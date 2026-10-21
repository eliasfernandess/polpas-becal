import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve("out");
const port = Number(process.env.PORT || 3000);
const mime = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".webp": "image/webp", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".xml": "application/xml" };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    let target = path.resolve(root, "." + pathname);
    if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    if (pathname.split("/").some(segment => segment.startsWith("."))) { res.writeHead(404); res.end(); return; }
    let status = 200;
    try { if ((await fs.stat(target)).isDirectory()) target = path.join(target, "index.html"); await fs.access(target); }
    catch { target = path.join(root, "404.html"); status = 404; }
    const data = await fs.readFile(target);
    const security = JSON.parse(await fs.readFile(path.join(root, ".security-headers.json"), "utf8"));
    res.writeHead(status, { ...security, "Content-Type": mime[path.extname(target)] || "application/octet-stream", "Cache-Control": pathname.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "no-cache" });
    if (req.method === "HEAD") res.end(); else res.end(data);
  } catch { res.writeHead(400); res.end("Requisição inválida."); }
});
server.listen(port, "127.0.0.1", () => console.log(`Local: http://127.0.0.1:${port}`));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));

