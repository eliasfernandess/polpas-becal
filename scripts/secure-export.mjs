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
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
if (supabaseOrigin && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseOrigin)) throw new Error("Origem Supabase inválida.");
const csp = [
  "default-src 'self'", `script-src 'self' ${[...hashes].join(" ")}`,
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self'",
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`, "object-src 'none'", "base-uri 'self'", "form-action 'none'",
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
// Vercel reads vercel.json before building: publish fresh hashes via Build Output API.
const output = ".vercel/output";
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
await fs.cp("out", `${output}/static`, { recursive: true, filter: source => !["_headers", ".security-headers.json"].includes(path.basename(source)) });
const routes = [{ src: "/(.*)", headers, continue: true }];
async function htmlRoutes(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await htmlRoutes(file);
    else if (entry.name === "index.html") {
      const relative = path.relative("out", file).split(path.sep).join("/");
      const route = "/" + relative.slice(0, -"index.html".length);
      if (route !== "/") routes.push({ src: route.slice(0, -1), status: 308, headers: { Location: route } });
      routes.push({ src: route, dest: "/" + relative });
    }
  }
}
await htmlRoutes("out");
routes.push({ handle: "filesystem" }, { src: "/(.*)", status: 404, dest: "/404.html" });
await fs.writeFile(`${output}/config.json`, JSON.stringify({ version: 3, routes }, null, 2) + "\n");
console.log(`Exportação estática protegida: ${hashes.size} hashes CSP de scripts, sem unsafe-eval/unsafe-inline para scripts.`);

