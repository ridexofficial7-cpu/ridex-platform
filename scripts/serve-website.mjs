import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../apps/public-website");
const port = Number(process.env.PORT || 8080);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname); }
  catch { res.writeHead(400); res.end("Bad Request"); return; }
  if (pathname === "/") pathname = "/index.html";
  const candidate = path.resolve(root, `.${pathname}`);
  if (!candidate.startsWith(root + path.sep) && candidate !== path.join(root, "index.html")) { res.writeHead(403); res.end("Forbidden"); return; }
  fs.readFile(candidate, (err, data) => {
    if (err) { res.writeHead(err.code === "ENOENT" ? 404 : 500); res.end(err.code === "ENOENT" ? "Not Found" : "Server Error"); return; }
    res.writeHead(200, { "Content-Type": types[path.extname(candidate)] || "application/octet-stream", "X-Content-Type-Options": "nosniff" });
    res.end(data);
  });
}).listen(port, "127.0.0.1", () => console.log(`RideX public website: http://127.0.0.1:${port}`));
