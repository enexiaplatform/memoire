import { createClient } from '@supabase/supabase-js';

/** Real handlers in development, with server-only configuration kept off Vite's browser graph. */
export function automationDevPlugin(env) {
  return { name: 'memoire-automation-dev', configureServer(server) {
    server.middlewares.use('/api/commercial', async (req, res, next) => {
      const query = Object.fromEntries(new URL(req.url || '/', 'http://localhost').searchParams);
      if (!['automations', 'automation-worker'].includes(query.resource)) return next();
      const reply = {
        setHeader: (name, value) => res.setHeader(name, value),
        status(code) { res.statusCode = code; return this; },
        json(body) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); },
      };
      try {
        let size = 0; const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 4000) return reply.status(413).json({ version: 1, error: 'request_too_large' });
          chunks.push(chunk);
        }
        const raw = Buffer.concat(chunks).toString('utf8');
        const { createAutomationHandler, createAutomationWorker } = await server.ssrLoadModule('/api/_automation.js');
        const adminClient = () => createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
        const handler = query.resource === 'automations' ? createAutomationHandler({ env, adminClient })
          : createAutomationWorker({ env, clientFactory: adminClient });
        await handler({ method: req.method, headers: req.headers, query, body: raw ? JSON.parse(raw) : undefined, socket: req.socket }, reply);
      } catch { if (!res.writableEnded) reply.status(400).json({ version: 1, error: 'invalid_request' }); }
    });
  } };
}
