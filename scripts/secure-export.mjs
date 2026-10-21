import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const hashes = new Set();
async function walk(dir) {
  for (const f of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, f.name);
    if (f.isDirectory()) await walk(file);
    else if (f.name.endsWith(".html")) {
      const html = await fs.readFile(file, "utf8");
      for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/\bsrc=/.test(match[1]) || !match[2]) continue;
        hashes.add(`'sha256-${createHash("sha256").update(match[2]).digest("base64")}'`);
      }
    }
  }
}
await walk("out");
const csp = [
  "default-src 'self'", `script-src 'self' ${[...hashes].join(" ")}`,
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self'",
  "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'none'",
  "frame-ancestors 'none'", "frame-src 'none'",
].join("; ");
const headers = {
  "Content-Security-Policy": csp,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Robots-Tag": "noindex, nofollow",
};
await fs.writeFile("out/.security-headers.json", JSON.stringify(headers, null, 2));
await fs.writeFile("out/_headers", "/*\n" + Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`).join("\n") + "\n");
await fs.writeFile("vercel.json", JSON.stringify({ framework: null, buildCommand: "npm run build", outputDirectory: "out", headers: [{ source: "/(.*)", headers: Object.entries(headers).map(([key, value]) => ({ key, value })) }] }, null, 2) + "\n");
console.log(`Exportação estática protegida: ${hashes.size} hashes CSP de scripts, sem unsafe-eval/unsafe-inline para scripts.`);

