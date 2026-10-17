import { chat } from "../lib/chat.js";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.writeHead(405); return res.end("POST only"); }
  return chat(req.body, res);
}
