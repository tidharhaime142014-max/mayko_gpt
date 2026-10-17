export const SYSTEM = `You are Mayko GPT — a world-class senior front-end engineer and product designer. Your output must look like it was built by a top agency for a real, paying client: polished, believable, production-ready.

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


// לוגיקה משותפת: רצה גם מקומית (server.js) וגם ב-Vercel (api/chat.js)
export async function chat(body, res) {
  const { MODEL = "gemini-3.8-flash" } = process.env;
  // ניקוי אוטומטי: רווחים, מרכאות, ואם הודבקה כל השורה "GEMINI_API_KEY=..."
  const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").replace(/^["'\s]+|["'\s]+$/g, "").replace(/^GEMINI_API_KEY\s*=\s*/i, "").replace(/^["'\s]+|["'\s]+$/g, "");
  const allowed = new Set(["gemini-3.8-flash", "gemini-3.1-pro-preview", MODEL]);
  const { messages = [], model } = body || {};
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "PASTE_YOUR_KEY_HERE" || !/^[\x21-\x7e]+$/.test(GEMINI_API_KEY)) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    return res.end("חסר מפתח GEMINI_API_KEY. מקומית: הכנס אותו ב-config.env. ב-Vercel: Settings ← Environment Variables, ואז Redeploy.");
  }
  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [
      ...(m.images || []).slice(0, 4).map(d => { const mm = /^data:(.+?);base64,(.+)$/.exec(d); return mm && { inlineData: { mimeType: mm[1], data: mm[2] } }; }).filter(Boolean),
      { text: m.content || " " },
    ],
  }));
  const useModel = allowed.has(model) ? model : MODEL;
  // מנסים כמה צירופים של דגם וכתובת (Gemini / Vertex express). מפסיקים בהצלחה או בשגיאה שאינה שגיאת הרשאה.
  const models = [...new Set([useModel, "gemini-3.8-flash"])];
  const targets = m => [
    ["gemini", `https://generativelanguage.googleapis.com/v1beta/models/${m}`],
    ["vertex", `https://aiplatform.googleapis.com/v1/publishers/google/models/${m}`],
  ];
  const payload = JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents, generationConfig: { maxOutputTokens: 32000 } });
  const tried = []; let up;
  outer: for (const m of models) {
    for (const [name, base] of targets(m)) {
      tried.push(`${name}/${m}`);
      up = await fetch(`${base}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: payload,
      }).catch(e => ({ ok: false, status: 502, text: async () => e.message }));
      if (up.ok || (up.status !== 401 && up.status !== 403)) break outer;
    }
  }
  if (!up.ok) {
    res.writeHead(up.status, { "content-type": "text/plain; charset=utf-8" });
    const t = await up.text();
    const hint = up.status === 401 || up.status === 400 ? `[בדיקה] המפתח מתחיל ב-"${GEMINI_API_KEY.slice(0, 4)}", אורך ${GEMINI_API_KEY.length}. נוסה: ${tried.join(" , ")}.` : "";
    return res.end((hint ? hint.trim() + "\n\n" : "") + t);
  }
  res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" });
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
  res.end();
}
