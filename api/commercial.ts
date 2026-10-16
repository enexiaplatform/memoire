import { createCommercialHandler } from "../.memoire-server/commercial.mjs";
import { createAiChatHandler } from "./_aiChat.js";

const commercial = createCommercialHandler();
const chat = createAiChatHandler();

// Optional chat shares the existing function slot to retain the Hobby cap.
export default function handler(req: any, res: any) {
  return req.query?.resource === "ai-chat"
    ? chat(req, res)
    : commercial(req, res);
}
