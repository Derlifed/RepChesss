import fs from "node:fs";
import path from "node:path";

const source = path.resolve("node_modules/stockfish/src");
const destination = path.resolve("public/stockfish");
if (!fs.existsSync(source)) throw new Error("Stockfish is missing. Run npm install.");
fs.mkdirSync(destination, { recursive: true });
fs.cpSync(source, destination, { recursive: true });
const files = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const filename = path.join(directory, entry.name);
  return entry.isDirectory() ? files(filename) : [filename];
});
const worker = files(source).find(filename => /lite-single.*\.js$/i.test(path.basename(filename)));
if (!worker) throw new Error("Stockfish lite-single worker was not found.");
fs.writeFileSync(path.join(destination, "config.json"), JSON.stringify({ worker: path.relative(source, worker).split(path.sep).join("/") }, null, 2));
console.log("Stockfish assets prepared.");
