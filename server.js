// הרצה מקומית. ב-Vercel משתמשים ב-api/chat.js
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const envFiles = ["config.env", ".env", ".env.txt", "config.env.txt"].map(f => path.join(dir, f)).filter(f => fs.existsSync(f));
for (const f of envFiles) {
  for (const l of fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    const v = m && m[2].replace(/^["']|["']$/g, "");
    if (m && v && v !== "PASTE_YOUR_KEY_HERE") process.env[m[1]] ||= v;
  }
}
console.log(envFiles.length ? "נקראו קבצי הגדרות: " + envFiles.join(", ") : "לא נמצא config.env בתיקייה " + dir);

const { chat } = await import("./lib/chat.js");
const PORT = process.env.PORT || 3000;
const types = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".js": "text/javascript", ".css": "text/css" };

http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/chat") {
    let body = ""; for await (const c of req) body += c;
    return chat(JSON.parse(body || "{}"), res);
  }
  const file = path.join(dir, "public", req.url === "/" ? "index.html" : req.url.split("?")[0]);
  if (!file.startsWith(path.join(dir, "public")) || !fs.existsSync(file)) { res.writeHead(404); return res.end("Not found"); }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Mayko GPT running → http://localhost:${PORT}` + (process.env.GEMINI_API_KEY ? "" : "  (עדיין לא הוכנס מפתח ב-config.env)")));
