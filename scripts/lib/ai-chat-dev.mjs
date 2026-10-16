import { createAiChatHandler } from "../../api/_aiChat.js";

/** The same handler as Vercel, behind Vite's development server. Never a mock. */
export function aiChatDevPlugin(env) {
  return {
    name: "memoire-ai-chat-dev",
    configureServer(server) {
      const handler = createAiChatHandler({ env });
      server.middlewares.use("/api/ai-chat", async (req, res) => {
        if (req.url !== "/" && req.url !== "" && !req.url?.startsWith("?")) {
          res.statusCode = 404;
          res.end();
          return;
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
          let size = 0;
          const chunks = [];
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 48000) {
              reply.status(413).json({ error: "context_too_large" });
              return;
            }
            chunks.push(chunk);
          }
          const raw = Buffer.concat(chunks).toString("utf8");
          req.body = raw ? JSON.parse(raw) : undefined;
          await handler(req, reply);
        } catch {
          if (!res.writableEnded)
            reply.status(400).json({ error: "invalid_request" });
        }
      });
    },
  };
}
