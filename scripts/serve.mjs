// Minimal static file server for local testing. Usage: node scripts/serve.mjs [port]
// Supports HTTP Range requests (required for PMTiles byte serving).
import http from 'node:http';
import { open, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const PORT = Number(process.argv[2]) || 5173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.pmtiles': 'application/octet-stream',
};

function parseRange(header, size) {
  if (!header || !header.startsWith('bytes=')) return null;
  const [startStr, endStr] = header.slice(6).split('-');
  let start = startStr === '' ? NaN : Number(startStr);
  let end = endStr === '' ? size - 1 : Number(endStr);
  if (Number.isNaN(start)) {
    // suffix range: bytes=-N
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= size || start > end) {
    return null;
  }
  return { start, end };
}

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const filePath = normalize(join(ROOT, p));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
    const s = await stat(filePath).catch(() => null);
    if (!s || !s.isFile()) { res.writeHead(404).end('not found'); return; }

    const type = TYPES[extname(filePath)] || 'application/octet-stream';
    const size = s.size;
    const range = parseRange(req.headers.range, size);
    const fh = await open(filePath, 'r');

    try {
      if (range) {
        const { start, end } = range;
        const len = end - start + 1;
        const buf = Buffer.alloc(len);
        await fh.read(buf, 0, len, start);
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Length': len,
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
          'Service-Worker-Allowed': '/',
        });
        res.end(buf);
      } else {
        const buf = Buffer.alloc(size);
        await fh.read(buf, 0, size, 0);
        res.writeHead(200, {
          'Content-Type': type,
          'Content-Length': size,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
          'Service-Worker-Allowed': '/',
        });
        res.end(buf);
      }
    } finally {
      await fh.close();
    }
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});

server.listen(PORT, () => console.log(`serving ${ROOT} at http://localhost:${PORT}`));
