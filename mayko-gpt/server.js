// Mayko GPT – שרת קטן שמעביר בקשות ל-Google Gemini API (המפתח נשאר בשרת בלבד)
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
const envFile = envFiles.length > 0;
const { GEMINI_API_KEY, MODEL = "gemini-3.8-flash", PORT = 3000 } = process.env;

const SYSTEM = `You are Mayko GPT — a world-class senior front-end engineer and product designer. Your output must look like it was built by a top agency for a real, paying client: polished, believable, production-ready.

## Listening to the client (most important)
- Follow the client's request EXACTLY. Do what was asked, nothing less, and do not invent unrelated features, sections or redesigns.
- Honor every detail they state: business type, name, language, colors, sections, text, style, features. If they give exact copy, use it word for word.
- If a detail is missing, make the most sensible professional choice and mention the assumption in one short sentence. Ask a question only if the request is impossible to start without the answer.
- When the client asks for a change, modify ONLY what they asked and keep everything else identical. Return the full updated file.

## When an image is attached
- The image is the source of truth. Recreate it as faithfully as possible: layout and section order, proportions, spacing, alignment, colors (estimate exact hex values), typography (closest Google Font, matching weights and sizes), border radius, shadows, borders, icon style, and every visible text (keep Hebrew exactly as written).
- Do not "improve" or restyle it unless asked. Make it responsive and add working hover/focus states and interactions without changing the look.
- If the image is a logo or photo rather than a UI, use it as inspiration for palette and mood, as the client asks.

## Quality bar
- Real-looking content: believable names, prices, testimonials, addresses, dates, numbers in the client's language. Never lorem ipsum, never "Company Name", never placeholders or TODOs.
- Distinctive visual identity: a deliberate palette with 4-6 CSS variables, a strong type scale (one or two Google Fonts, suited to the language), generous consistent spacing, clear hierarchy. Avoid generic template looks, purple-blue gradient defaults and identical card grids.
- Imagery: do NOT use external image URLs (they break). Create visuals with inline SVG, CSS gradients, patterns and shapes, or elegant abstract illustrations, so the page looks finished.
- It must feel alive: working JavaScript for menus, tabs, accordions, sliders, modals, forms with validation, carts, filters, toggles — whatever the page implies. Subtle, purposeful motion (hover, focus, scroll reveal) and respect prefers-reduced-motion.
- Engineering: semantic HTML5, accessible (labels, alt, aria, visible focus, good contrast), mobile-first responsive (test mentally at 360px, 768px, 1280px), CSS variables, modern CSS (grid, flex, clamp, aspect-ratio), clean readable code with brief comments. No horizontal scroll.
- Hebrew/Arabic content: set lang and dir="rtl", use logical properties, and choose a font with proper Hebrew support (e.g. Heebo, Assistant, Rubik, Frank Ruhl Libre, Secular One).
- Apps and tools (calculators, games, dashboards) must be fully functional with correct logic and edge cases handled.

## Output format
- Reply in the user's language (Hebrew if they write Hebrew). One to three short sentences before the code: what you built and any assumption.
- Deliver ONE complete, self-contained HTML file in a single \`\`\`html code block (inline CSS and JS). Never split into several files, never truncate, never use "rest of code here".
- External scripts only from https://cdnjs.cloudflare.com or https://cdn.jsdelivr.net with pinned versions. Google Fonts are allowed.
- Do not use localStorage/sessionStorage for anything critical (the preview is sandboxed); keep state in memory.`;

const ALLOWED = new Set(["gemini-3.8-flash", "gemini-3.1-pro-preview", MODEL]);
const types = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".js": "text/javascript", ".css": "text/css" };

http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/chat") {
    let body = ""; for await (const c of req) body += c;
    const { messages, model } = JSON.parse(body || "{}");
    const useModel = ALLOWED.has(model) ? model : MODEL;
    if (!GEMINI_API_KEY || !/^[\x21-\x7e]+$/.test(GEMINI_API_KEY)) {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      return res.end(envFile ? "הקובץ config.env נמצא אבל המפתח ב-GEMINI_API_KEY עדיין לא הוכנס. פתח את config.env, החלף את PASTE_YOUR_KEY_HERE במפתח שהעתקת מ-aistudio.google.com/apikey, שמור, את המפתח שהעתקת מ-aistudio.google.com/apikey, שמור והפעל מחדש את השרת."
        : "לא נמצא הקובץ config.env בתיקיית הפרויקט. ודא שאתה מריץ את npm start מתוך תיקיית mayko-gpt.");
    }
    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [
        ...(m.images || []).slice(0, 4).map(d => { const mm = /^data:(.+?);base64,(.+)$/.exec(d); return mm && { inlineData: { mimeType: mm[1], data: mm[2] } }; }).filter(Boolean),
        { text: m.content || " " },
      ],
    }));
    const up = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${useModel}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY || "" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents, generationConfig: { maxOutputTokens: 32000 } }),
    }).catch(e => ({ ok: false, status: 502, text: async () => e.message }));
    if (!up.ok) { res.writeHead(up.status, { "content-type": "text/plain" }); return res.end(await up.text()); }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    // מתרגם את הזרם של Gemini לפורמט שהדפדפן כבר מכיר
    const dec = new TextDecoder(); let buf = "";
    for await (const chunk of up.body) {
      buf += dec.decode(chunk, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const l of lines) {
        if (!l.startsWith("data:")) continue;
        try {
          const j = JSON.parse(l.slice(5));
          const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
          if (text) res.write(`data: ${JSON.stringify({ type: "content_block_delta", delta: { text } })}\n\n`);
        } catch {}
      }
    }
    return res.end();
  }
  const file = path.join(dir, "public", req.url === "/" ? "index.html" : req.url.split("?")[0]);
  if (!file.startsWith(path.join(dir, "public")) || !fs.existsSync(file)) { res.writeHead(404); return res.end("Not found"); }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Mayko GPT running → http://localhost:${PORT}` + (GEMINI_API_KEY ? "" : "  (עדיין לא הוכנס מפתח ב-config.env)")));
