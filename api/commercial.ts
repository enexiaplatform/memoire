import { createCommercialHandler, createAutomationHandler, createAutomationWorker } from "../.memoire-server/commercial.mjs";
import { createAiChatHandler } from "./_aiChat.js";

import { createPlanCompletionHandler } from "./_planCompletion.js";

const planCompletion = createPlanCompletionHandler();
const commercial = createCommercialHandler();
const chat = createAiChatHandler();
const automations = createAutomationHandler();
const automationWorker = createAutomationWorker();

// Optional chat shares the existing function slot to retain the Hobby cap.
export default function handler(req: any, res: any) {
  if (req.query?.resource === 'plan-completion') return planCompletion(req, res);
  if (req.query?.resource === 'automations') return automations(req, res);
  if (req.query?.resource === 'automation-worker') return automationWorker(req, res);
  return req.query?.resource === "ai-chat"
    ? chat(req, res)
    : commercial(req, res);
}
