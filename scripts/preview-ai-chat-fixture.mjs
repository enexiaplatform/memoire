import { createServer } from "vite";
import { resolve } from "node:path";
import { createAiChatHandler } from "../api/_aiChat.js";
import {
  fixtureOwner,
  fixtureWorkspace,
} from "../test/fixtures/aiChat/workspace.mjs";

// Local-only verification harness. Its URL, fictional banner and isolated port
// make the evidence boundary visible. It is never imported by production code.
const root = process.cwd();
const fixturePort = Number(process.env.FIXTURE_PORT || 5188);
const ids = new Set(
  [
    ...fixtureWorkspace.accounts,
    ...fixtureWorkspace.opportunities,
    ...fixtureWorkspace.activities,
  ].map((row) => row.id),
);
ids.add('fixture-decoy');
const handler = createAiChatHandler({
  env: {
    AI_CHAT_ENABLED: "true",
    GROQ_API_KEY: "fixture-placeholder-not-a-key",
  },
  verify: async (token) =>
    token === "fixture-only-token" ? { id: fixtureOwner } : null,
  clientForToken: () => ({
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      in: async (_key, requested) => ({
        data: requested
          .filter((id) => ids.has(id))
          .map((id) => ({ id, user_id: fixtureOwner })),
        error: null,
      }),
    }),
  }),
  rateLimit: () => ({
    allowed: true,
    limit: 6,
    remaining: 5,
    resetAt: Date.now() + 60000,
  }),
  fetcher: async (_url, options) => {
    const sent = JSON.parse(options.body),
      question = sent.messages.at(-1).content;
    if (question.includes("QUOTA"))
      return new Response("{}", {
        status: 429,
        headers: { "retry-after": "2" },
      });
    if (question.includes("TIMEOUT"))
      throw new DOMException("fixture", "TimeoutError");
    if (question.includes("FORMAT_ERROR"))
      return Response.json({error:{code:"tool_use_failed",failed_generation:"fixture-only nonexistent tool"}},{status:400});
    await new Promise((done) => setTimeout(done, question.includes('SLOW') ? 8000 : 1200));
    const short = /short|ngắn/i.test(question);
    const answer = {
      answer:
        "The recorded next step is to confirm evaluation criteria. The decision date is missing. This is a fictional fixture response, not live AI.",
      sourceKeys: ["opportunity:fixture-deal", "activity:fixture-activity"],
      draft: short
        ? "Hello, could you confirm the demo criteria? Thank you."
        : "Hello,\n\nThank you for discussing the analyzer evaluation. Could you confirm the criteria you would like the demo to address? We can then prepare a focused session.\n\nBest regards",
      suggestedAction: "Confirm the customer’s demo evaluation criteria.",
      missingContext: ["Decision date is not recorded."],
      suggestedQuestions: ["Viết ngắn hơn.", "Which evidence is missing?"],
    };
    if (/FIXTURE_ACTIONS|tạo 2 việc plan|add into Plan with details information|add it into the Plan for next week/i.test(question)) {
      Object.assign(answer,{
        answer:'Đề xuất tạo 2 việc Plan và sửa next action của cơ hội Analyzer (dữ liệu giả lập). Nhắn “thực hiện” để áp dụng hoặc “hủy”.',draft:'',suggestedAction:'',missingContext:[],suggestedQuestions:[],
        actions:[
          {kind:'create_plan',targetKey:'opportunity:fixture-deal',label:'Fixture: call about demo criteria',date:'2026-10-20',channel:'Phone call',changes:[]},
          {kind:'create_plan',targetKey:'opportunity:fixture-deal',label:'Fixture: send evaluation checklist',date:'2026-10-21',channel:'Email / message',changes:[]},
          {kind:'update_opportunity',targetKey:'opportunity:fixture-deal',label:'',date:'',channel:'',changes:[{field:'nextAction',value:'Fixture: confirm demo criteria and send checklist'},{field:'nextActionDate',value:'2026-10-20'}]},
        ],
      });
    }
    if (/add into Plan with details information|add it into the Plan for next week/i.test(question)) {
      answer.actions = answer.actions.filter(action => action.kind === 'create_plan');
      // Reproduces the wrong-record trap: fresh retrieval can include the
      // decoy; draft conversion must remove it before this provider call.
      if(sent.messages.some(message=>message.content.includes('FIXTURE_REFERENCE'))) {
        const keys=sent.response_format.json_schema.schema.properties.actions.items.properties.targetKey.enum;
        const target=keys.includes('opportunity:fixture-decoy')?'opportunity:fixture-decoy':'opportunity:fixture-deal';
        answer.actions=answer.actions.map(action=>({...action,targetKey:target}));
      }
    }
    if(question.includes('FIXTURE_REFERENCE'))
      Object.assign(answer,{answer:'Draft for Northstar Research (fictional) · Analyzer evaluation (fictional):\n2026-10-20: call about demo criteria, Phone call.\n2026-10-21: send evaluation checklist, Email / message. Nothing saved.',draft:'',suggestedAction:'',missingContext:[],suggestedQuestions:[],actions:[]});
    if (question.includes('FIXTURE_AGENDA'))
      Object.assign(answer, {answer: 'Fictional weekly agenda. Not saved.\n\n' + 'Recorded context: the evaluation criteria are not confirmed, so review the checklist before contacting the customer. This is a suggestion, not a confirmed appointment.\n\n'.repeat(18) + '2026-10-20: Fixture: call about demo criteria. Channel Phone call.\n2026-10-21: Fixture: send evaluation checklist. Channel Email / message.',draft:'',suggestedAction:'',suggestedQuestions:[],missingContext:[],actions:[]});
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(answer) },
          },
        ],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  },
});
const fixturePlugin = {
  name: "isolated-ai-chat-fixture",
  enforce: "pre",
  resolveId(source, importer) {
    const file = importer?.replace(/\\/g, "/");
    if (file?.endsWith('/src/features/aiChat/AiChatPanel.tsx') && source==='../../services/aiChatActions') return resolve(root,'test/fixtures/aiChat/actions.mjs');
    if (
      file?.endsWith("/src/features/aiChat/AiChatPanel.tsx") &&
      source === "../../services/workspaceData"
    )
      return resolve(root, "test/fixtures/aiChat/workspace.mjs");
    if (
      file?.endsWith("/src/features/aiChat/AiChatPanel.tsx") &&
      source === "../../services/planItemStore"
    )
      return resolve(root, "test/fixtures/aiChat/plan.mjs");
    if (
      file?.endsWith("/src/services/aiChat.ts") &&
      source === "../lib/supabaseClient"
    )
      return resolve(root, "test/fixtures/aiChat/auth.mjs");
    if (
      file?.endsWith("/src/features/aiChat/MemoireChat.tsx") &&
      source === "../../hooks/useAuth"
    )
      return resolve(root, "test/fixtures/aiChat/user.mjs");
  },
  configureServer(server) {
    server.middlewares.use("/api/ai-chat", async (req, res) => {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 48000) {
          res.statusCode = 413;
          res.end();
          return;
        }
      }
      const reply = {
        status(code) {
          res.statusCode = code;
          return this;
        },
        setHeader(name, value) {
          res.setHeader(name, value);
        },
        json(value) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(value));
        },
      };
      try {
        req.body = raw ? JSON.parse(raw) : undefined;
        await handler(req, reply);
      } catch {
        reply.status(400).json({ error: "invalid_request" });
      }
    });
  },
};
const server = await createServer({
  plugins: [fixturePlugin],
  server: { host: "127.0.0.1", port: fixturePort, strictPort: true },
  cacheDir: "node_modules/.vite-ai-chat-fixture",
});
await server.listen();
console.log(
  `Fictional AI chat fixture: http://127.0.0.1:${fixturePort}/test/fixtures/aiChat/index.html`,
);
