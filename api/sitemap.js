// Served at /sitemap.xml (see vercel.json). Built from the production domain, so no domain is hard-coded.
import { siteUrl } from './_http.js';

const PAGES = ['/', '/privacy.html', '/terms.html'];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default function handler(req, res) {
  const base = siteUrl(req);
  const urls = PAGES.map((p) => `  <url><loc>${esc(base + p)}</loc></url>`).join('\n');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}
