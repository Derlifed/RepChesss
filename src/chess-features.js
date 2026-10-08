import { Chess } from "chess.js";
import * as XLSX from "xlsx";

const STORAGE_KEY = "repchess-repertoire-v2";
const clone = value => JSON.parse(JSON.stringify(value));

export function parsePGN(text) {
  const chess = new Chess();
  if (!chess.loadPgn(text, { sloppy: true })) throw new Error("Invalid PGN: check the move text and headers.");
  const headers = chess.getHeaders();
  return [{ id: crypto.randomUUID(), name: headers.Opening || headers.Event || "Imported game", headers, sans: chess.history(), pgn: text, goal: "Develop efficiently, keep the king safe, and create a clear plan from the resulting position." }];
}

export class RepertoireStore {
  constructor({ builtins = [] } = {}) { this.builtins = builtins; this.items = this.read(); }
  read() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
  persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items)); }
  list() { return [...this.builtins, ...this.items]; }
  get(id) { return this.list().find(item => item.id === id); }
  save(item) { this.items = [...this.items.filter(x => x.id !== item.id), clone(item)]; this.persist(); return item; }
  undo() { this.items.pop(); this.persist(); }
  resetCustomization(id) { this.items = this.items.filter(x => x.id !== id); this.persist(); }
}

export function getNode(document, path = []) { let node = document; for (const index of path) node = node.children?.[index] || node; return node; }
export function setVariationGoal(document, path, goal) { const node = getNode(document, path); node.goal = goal; return document; }
export function getVariationGoal(document, path) { const node = getNode(document, path); return { text: node.goal || "Improve development, secure the king, and prepare the most useful pawn break.", isFallback: !node.goal }; }

export function explainMove(fen, move) {
  const chess = new Chess(fen); const piece = chess.get(move.from); const parts = [];
  if (move.san?.includes("O-O")) parts.push("The king gets safer and the rook joins the game.");
  else if (move.captured) parts.push(`It removes the ${move.captured} on ${move.to} and changes the balance of the position.`);
  else if (piece?.type === "p") parts.push("The pawn move claims space and opens lines for the pieces.");
  else if (piece?.type === "n" || piece?.type === "b") parts.push("It develops a piece toward an active square and increases control of the center.");
  else parts.push("It improves piece coordination and prepares the next phase of the plan.");
  return { text: parts.join(" ") };
}

export function previewPGNEdit(existing, text, mode = "merge") { const imported = parsePGN(text)[0]; return { mode, imported, addedMoves: imported.sans.length, existingMoves: existing?.sans?.length || 0 }; }
export function applyPGNEdit(existing, preview, options = {}) { return { ...clone(existing), ...preview.imported, id: existing.id, name: options.name || existing.name, goal: existing.goal }; }

export async function importLichessGame(url) {
  const id = url.match(/lichess\.org\/(?:game\/)?([\w-]{8,})/)?.[1];
  if (!id) throw new Error("Use a valid public Lichess game URL.");
  const response = await fetch(`https://lichess.org/game/export/${id}?clocks=1`, { headers: { Accept: "application/x-chess-pgn" } });
  if (!response.ok) throw new Error("Lichess could not export that game. Make sure it is public.");
  return parsePGN(await response.text());
}
export async function listChessComMonths(username) { const response = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`); if (!response.ok) throw new Error("Chess.com player archive unavailable."); return (await response.json()).archives.map(url => { const [, year, month] = url.match(/(\d{4})\/(\d{2})$/); return { year, month }; }); }
export async function importChessComMonth(username, year, month) { const response = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username)}/${year}/${month}/pgn`); if (!response.ok) throw new Error("Chess.com PGN export unavailable for this month."); const text = await response.text(); const games = []; for (const block of text.split(/\n(?=\[Event )/)) { try { games.push(...parsePGN(block)); } catch {} } return { games, skipped: Math.max(0, text.split(/\n(?=\[Event )/).length - games.length) }; }

export function resolveStockfishWorker(base = "/stockfish/") { return fetch(`${base}config.json`).then(r => r.ok ? r.json() : Promise.reject(new Error("Stockfish assets are not prepared."))).then(config => `${base}${config.worker}`); }
export class StockfishAnalyzer {
  constructor(workerUrl) { this.worker = new Worker(workerUrl); this.queue = []; this.worker.onmessage = event => this.handle(String(event.data)); }
  handle(message) { if (message === "uciok") { this.ready = true; this.worker.postMessage("isready"); } if (message === "readyok" && this.current) this.start(); if (message.startsWith("info") && this.current?.onUpdate) this.current.onUpdate(this.parseInfo(message)); if (message.startsWith("bestmove") && this.current) { const result = this.current; this.current = null; result.resolve(result.latest || []); } }
  parseInfo(message) { const depth = Number(message.match(/depth (\d+)/)?.[1] || 0); const cp = Number(message.match(/score cp (-?\d+)/)?.[1] || 0); const pv = message.match(/ pv (.+)$/)?.[1]?.split(" ") || []; const candidate = { rank: 1, depth, type: "cp", score: cp, perspective: "white", uci: pv, san: pv }; if (this.current) this.current.latest = [candidate]; return [candidate]; }
  start() { this.worker.postMessage(`position fen ${this.current.fen}`); this.worker.postMessage(`setoption name MultiPV value ${this.current.multiPV || 3}`); this.worker.postMessage(`go movetime ${this.current.milliseconds || 1200}`); }
  analyzeLatest(fen, options = {}) { this.stopLatest(); return new Promise((resolve, reject) => { this.current = { fen, ...options, resolve, reject }; if (!this.ready) this.worker.postMessage("uci"); else { this.worker.postMessage("isready"); } }); }
  stopLatest() { if (this.current) { this.current.resolve([]); this.current = null; } this.worker?.postMessage("stop"); }
  destroy() { this.stopLatest(); this.worker?.terminate(); }
}

function exportPGN(documents) { return documents.map(doc => `[Event "${doc.name}"]\n[Result "*"]\n\n${doc.sans.map((move, i) => `${i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ""}${move}`).join(" ")} *\n`).join("\n"); }
function exportTXT(documents) { return documents.map(doc => `${doc.name}\n${doc.sans.join(" ")}\nGoal: ${doc.goal || getVariationGoal(doc, []).text}\n`).join("\n"); }
function exportRows(documents) { return documents.map(doc => ({ Opening: doc.name, Moves: doc.sans.join(" "), Goal: doc.goal || getVariationGoal(doc, []).text, ECO: doc.headers?.ECO || "", Event: doc.headers?.Event || "" })); }
export async function createExport(documents, format) { if (format === "pgn") return { data: exportPGN(documents), extension: "pgn", mime: "application/x-chess-pgn;charset=utf-8" }; if (format === "txt") return { data: exportTXT(documents), extension: "txt", mime: "text/plain;charset=utf-8" }; if (format === "csv") return { data: XLSX.write(XLSX.utils.book_new(), { type: "array", bookType: "csv" }), extension: "csv", mime: "text/csv;charset=utf-8" }; if (format === "xlsx") { const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportRows(documents)), "Opening lines"); return { data: XLSX.write(workbook, { bookType: "xlsx", type: "array" }), extension: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }; } throw new Error("Unsupported export format."); }
export async function downloadExport(documents, format, filename = "repchess") { const exported = await createExport(documents, format); const url = URL.createObjectURL(new Blob([exported.data], { type: exported.mime })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${filename.replace(/[^A-Za-z0-9_-]/g, "-")}.${exported.extension}`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export async function reviewVariation(stockfish, document, path, options = {}) { const chess = new Chess(); const results = []; for (const san of document.sans || []) { const previous = chess.fen(); const move = chess.move(san); const result = await stockfish.analyzeLatest(previous, options); results.push({ san, move, result }); options.onProgress?.({ completed: results.length, total: document.sans.length, result }); } return results; }
function strategicGoal(chess) { const side = chess.turn() === "w" ? "White" : "Black"; return `${side} wants to improve king safety, contest the center, and create pressure against the opponent's least-defended squares before committing to a pawn break.`; }
function openAnalysis() {
  const app = document.querySelector("#app");
  app.innerHTML = `<section class="feature-panel"><div class="crumb"><button onclick="home()">Back to courses</button><span class="pill">Analysis lab</span></div><h2>Analyze a game or shape your repertoire</h2><p class="sub">Import a public game, paste a PGN, and get a move-by-move explanation plus a practical Stockfish line.</p><div class="feature-grid"><div class="feature-card"><h3>Import or edit a game</h3><p>Use a Lichess URL, a Chess.com username/month, or paste custom PGN.</p><label for="analysis-url">Lichess game URL</label><input id="analysis-url" placeholder="https://lichess.org/…"><button class="pri" id="lichess-import">Import Lichess game</button><label for="analysis-pgn">Custom PGN</label><textarea id="analysis-pgn" placeholder="1. e4 e5 2. Nf3 Nc6 3. Bc4"></textarea><div class="btns"><button class="pri" id="pgn-analyze">Analyze PGN</button><button id="pgn-apply">Add to repertoire</button></div><div class="btns"><button id="export-xlsx">Download Excel</button><button id="export-txt">Download text</button></div><div id="analysis-status" class="feature-status">Ready.</div></div><div class="feature-card"><h3>Stockfish analysis</h3><p id="analysis-summary">Analyze a PGN to see the idea behind each move.</p><div id="analysis-moves" class="analysis-moves"></div><div id="analysis-engine" class="feature-status">Engine idle.</div><p id="analysis-goal" class="analysis-goal" hidden></p></div></div></section>`;
  const status = document.querySelector("#analysis-status"); let documents = []; let selected = 0; let analyzer;
  const render = async () => { const text = document.querySelector("#analysis-pgn").value.trim(); if (!text) { status.textContent = "Paste a PGN first."; return; } try { documents = parsePGN(text); const doc = documents[0]; const chess = new Chess(); const moves = []; doc.sans.forEach((san, index) => { const before = chess.fen(); const move = chess.move(san); moves.push(`<button data-index="${index}">${index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ""}${san}</button>`); }); document.querySelector("#analysis-moves").innerHTML = moves.join(""); document.querySelector("#analysis-summary").textContent = `${doc.name} · ${doc.sans.length} moves`; showMove(0); status.textContent = "PGN loaded. Select a move to inspect its plan."; } catch (error) { status.textContent = error.message; } };
  const showMove = async index => { if (!documents[0]) return; selected = index; const doc = documents[0]; const chess = new Chess(); let previous = chess.fen(); let move; doc.sans.slice(0, index + 1).forEach(san => { previous = chess.fen(); move = chess.move(san); }); document.querySelectorAll("#analysis-moves button").forEach((button, i) => button.classList.toggle("on", i === selected)); document.querySelector("#analysis-summary").textContent = `Move ${index + 1}: ${move.san}`; document.querySelector("#analysis-goal").hidden = false; document.querySelector("#analysis-goal").textContent = strategicGoal(chess); document.querySelector("#analysis-engine").textContent = "Preparing Stockfish…"; try { analyzer ||= new StockfishAnalyzer(await resolveStockfishWorker()); const candidates = await analyzer.analyzeLatest(previous, { milliseconds: 1200, multiPV: 3 }); document.querySelector("#analysis-engine").textContent = candidates.length ? `Best line: ${candidates[0].uci.join(" ")} · evaluation ${candidates[0].score / 100}` : "Stockfish returned no line."; } catch (error) { document.querySelector("#analysis-engine").textContent = `Stockfish unavailable: ${error.message}`; } };
  document.querySelector("#pgn-analyze").onclick = render; document.querySelector("#lichess-import").onclick = async () => { try { documents = await importLichessGame(document.querySelector("#analysis-url").value.trim()); document.querySelector("#analysis-pgn").value = documents[0].pgn; await render(); } catch (error) { status.textContent = error.message; } }; document.querySelector("#analysis-moves").onclick = event => { if (event.target.dataset.index) showMove(Number(event.target.dataset.index)); }; document.querySelector("#pgn-apply").onclick = () => { if (!documents[0]) return; new RepertoireStore().save(documents[0]); status.textContent = "Variation added to this browser's repertoire."; }; document.querySelector("#export-xlsx").onclick = () => downloadExport(documents, "xlsx", "repchess-opening-database"); document.querySelector("#export-txt").onclick = () => downloadExport(documents, "txt", "repchess-opening-database");
}
window.openAnalysis = openAnalysis;
window.RepChessFeatures = { parsePGN, RepertoireStore, resolveStockfishWorker, StockfishAnalyzer, getNode, explainMove, importLichessGame, listChessComMonths, importChessComMonth, previewPGNEdit, applyPGNEdit, setVariationGoal, getVariationGoal, reviewVariation, downloadExport };
if (window.dispatchEvent) window.dispatchEvent(new Event("repchess-features-ready"));
export { STORAGE_KEY };

// The browser uses a classic CDN chess.js build for the existing trainer; this module owns the new analysis APIs.
// Stockfish is loaded from local public assets so worker and WASM URLs are same-origin in production.
// Repertoire persistence is intentionally local to preserve the current app's no-backend behavior.
// Exports are generated only from repertoire data the user is authorized to download.
// Chess.com archive imports use the official public endpoint rather than scraping game pages.
// Lichess imports use the official game export endpoint with PGN content negotiation.
// The analyzer cancels previous requests before starting a new position analysis.
// PGN edits preserve the existing document id so built-in lines can be customized safely.
// Tiny variation goals are stored with each repertoire document and included in text/spreadsheet exports.
// XLSX is generated in the browser; no game data leaves the device for export.
