import { createClient } from "@supabase/supabase-js";
import { getBearerToken, verifyUserToken } from "./_auth.js";
import { getSupabaseAnonKey, getSupabaseUrl } from "./_env.js";
import {
  resolveWorkspaceServerScope,
  workspaceDataHeaders,
} from "./_workspaceScope.js";

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const clientFor = (token, workspace) =>
  createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: {
      headers: {
        Authorization: "Bearer " + token,
        ...workspaceDataHeaders(workspace),
      },
    },
  });
const reject = (status) => {
  throw Object.assign(new Error("Atlas reference unavailable"), { status });
};
export function atlasReceiver({
  mapping,
  credential,
  fetchImpl = fetch,
  verify = (token) => verifyUserToken(token, null, { requireUserId: false }),
  clientForToken = clientFor,
} = {}) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const m =
          mapping || JSON.parse(process.env.MEMOIRE_ATLAS_MAPPING || "null"),
        key = credential || process.env.MEMOIRE_ATLAS_CONSUMER_KEY;
      if (!m || !key) reject(503);
      if (
        ![
          m.user,
          m.owner,
          m.workspace,
          m.organization,
          m.atlasWorkspace,
          m.servicePrincipal,
        ].every((x) => typeof x === "string" && uuid.test(x))
      )
        reject(503);
      const configured = new URL(getSupabaseUrl());
      if (
        m.issuer !== configured.origin ||
        configured.href !== configured.origin + "/" ||
        !(
          configured.protocol === "https:" ||
          (configured.protocol === "http:" &&
            configured.hostname === "127.0.0.1" &&
            process.env.NODE_ENV !== "production")
        )
      )
        reject(503);
      const permissions = m.permissions;
      if (
        !Array.isArray(permissions) ||
        !permissions.length ||
        permissions.some(
          (p) =>
            !["reference.read", "reference.pin", "events.sync"].includes(p),
        )
      )
        reject(503);
      const needed =
        req.method === "GET"
          ? req.query?.diagnostics === "1"
            ? "events.sync"
            : "reference.read"
          : req.body?.command === "pin"
            ? "reference.pin"
            : "events.sync";
      if (!permissions.includes(needed)) reject(403);
      const origin = new URL(m.origin);
      if (
        origin.username ||
        origin.password ||
        origin.pathname !== "/" ||
        origin.search ||
        origin.hash ||
        !(
          origin.protocol === "https:" ||
          (origin.protocol === "http:" &&
            origin.hostname === "127.0.0.1" &&
            process.env.NODE_ENV !== "production")
        )
      )
        reject(503);
      if (!["POST", "GET"].includes(req.method)) reject(405);
      const token = getBearerToken(req.headers),
        user = token && (await verify(token));
      if (!user) reject(401);
      if (
        user.id !== m.user ||
        req.headers["x-memoire-data-workspace"] !== m.workspace
      )
        reject(404);
      const scope = await resolveWorkspaceServerScope(
        req.headers,
        token,
        user.id,
        clientForToken,
      );
      if (scope?.ownerId !== m.owner) reject(404);
      async function call(path, body) {
        const reply = await fetchImpl(new URL(path, origin), {
          method: body ? "POST" : "GET",
          headers: {
            authorization: "Bearer " + key,
            ...(body ? { "content-type": "application/json" } : {}),
          },
          redirect: "error",
          signal: AbortSignal.timeout(5000),
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!reply.ok) {
          if (reply.status === 401 || reply.status === 403)
            throw Object.assign(new Error("Consumer authorization failed"), {
              status: 503,
              credentialRejected: true,
            });
          reject(reply.status === 404 ? 404 : 503);
        }
        return reply.json();
      }
      let me;
      try {
        me = await call("/api/me");
      } catch (error) {
        if (
          error.credentialRejected &&
          req.method === "GET" &&
          req.query?.diagnostics === "1"
        )
          return res
            .status(503)
            .json({ credential_status: "rejected", reconciliation: "blocked" });
        throw error;
      }
      if (
        me.kind !== "consumer" ||
        me.id !== m.servicePrincipal ||
        me.workspaces.length !== 1 ||
        !me.workspaces.some(
          (w) =>
            w.id === m.atlasWorkspace &&
            w.organization_id === m.organization &&
            w.role === "consumer",
        )
      )
        reject(403);
      const root = "/api/v1/workspaces/" + m.atlasWorkspace + "/";
      const live = async (id) => {
        if (!uuid.test(id)) reject(422);
        const a = await call(root + "assets/" + id);
        if (
          a.id !== id ||
          a.workspace_id !== m.atlasWorkspace ||
          a.organization_id !== m.organization ||
          a.lifecycle_status !== "Published" ||
          a.classification !== "Shareable" ||
          !Number.isSafeInteger(a.version) ||
          a.version < 1
        )
          reject(404);
        return {
          asset_id: id,
          version: a.version,
          title: a.title,
          asset_type: a.asset_type,
          verification_status: a.verification_status,
        };
      };
      const progress = async (action, args = {}) => {
        const proof = process.env.MEMOIRE_ATLAS_PROGRESS_KEY;
        if (!proof) reject(503);
        const { data, error } = await scope.client.rpc(
          "memoire_atlas_progress_op",
          {
            p_key: proof,
            p_org: m.organization,
            p_workspace: m.atlasWorkspace,
            p_principal: m.servicePrincipal,
            p_action: action,
            ...args,
          },
        );
        if (error || !data) reject(503);
        return data;
      };
      if (req.method === "GET" && req.query?.diagnostics === "1") {
        const state = await progress("read");
        const pending = await call(root + "events?after=" + state.checkpoint);
        return res
          .status(200)
          .json({
            ...state,
            pending_visible_page: pending.length,
            credential_status: "verified",
            reconciliation: pending.length ? "pending" : "caught_up",
          });
      }
      if (req.method === "GET") {
        const id = req.query?.asset;
        if (typeof id !== "string" || !uuid.test(id)) reject(422);
        const stored = await scope.client
          .from("memoire_atlas_pins")
          .select("version")
          .eq("owner_id", scope.ownerId)
          .eq("atlas_org", m.organization)
          .eq("atlas_workspace", m.atlasWorkspace)
          .eq("asset_id", id)
          .maybeSingle();
        if (stored.error) reject(503);
        if (!stored.data) reject(404);
        return res
          .status(200)
          .json({ ...(await live(id)), pinned_version: stored.data.version });
      }
      if (req.body?.command === "pin") {
        const a = await live(req.body.asset);
        await progress("pin", { p_asset: a.asset_id, p_version: a.version });
        return res.status(200).json(a);
      }
      if (req.body?.command !== "sync") reject(422);
      const state = await progress("read");
      let after = BigInt(state.checkpoint),
        failedSeq = "0";
      if (Date.parse(state.retry_at) > Date.now()) {
        res.setHeader(
          "Retry-After",
          String(Math.ceil((Date.parse(state.retry_at) - Date.now()) / 1000)),
        );
        reject(429);
      }
      try {
        const remote = await call(root + "checkpoint");
        if (BigInt(remote.last_seq) < after) {
          try {
            await call(root + "checkpoint", { seq: String(after) });
          } catch (error) {
            if (error.status !== 404) throw error;
          }
        }
        const events = await call(root + "events?after=" + after);
        let applied = 0;
        for (const e of events) {
          if (
            e.schema_version !== 1 ||
            e.source_application !== "atlas" ||
            !/^atlas\.asset\.(created|updated|published|archived|verification_changed|relationship_changed)\.v1$/.test(
              e.event_type,
            ) ||
            !uuid.test(e.event_id) ||
            e.workspace_id !== m.atlasWorkspace ||
            e.organization_id !== m.organization ||
            BigInt(e.seq) <= after
          )
            reject(503);
          failedSeq = String(e.seq);
          const a = await live(e.asset_id);
          if (a.version < e.asset_version) reject(503);
          await progress("event", {
            p_expected: String(after),
            p_seq: String(e.seq),
            p_asset: a.asset_id,
            p_version: a.version,
            p_event: e.event_id,
          });
          after = BigInt(e.seq);
          await call(root + "checkpoint", { seq: e.seq });
          applied++;
        }
        await progress("success", { p_expected: String(after) });
        return res
          .status(200)
          .json({
            processed: applied,
            after: String(after),
            more: events.length === 100,
          });
      } catch (error) {
        await progress("failure", {
          p_expected: String(after),
          p_seq: failedSeq,
        });
        throw error;
      }
    } catch (error) {
      return res
        .status(error.status || 503)
        .json({ error: "Atlas reference unavailable" });
    }
  };
}
