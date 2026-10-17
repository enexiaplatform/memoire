import { test } from "node:test";
import assert from "node:assert/strict";
import "../support/reportingCurrency.mjs";
import { parseActionList } from "../../shared/aiChatActions.js";
import { parseChatReply } from "../../api/_aiChat.js";
import {
  prepareActionBatch,
  applyActionBatch,
} from "../../src/features/aiChat/actionBatch.ts";
const source = {
  kind: "opportunity",
  id: "d1",
  key: "opportunity:d1",
  title: "Fictional Acme analyzer",
  detail: "",
};
const row = {
  id: "d1",
  userId: "u1",
  accountName: "Fictional Acme",
  opportunityName: "Analyzer",
  stage: "Proposal",
  status: "Active",
  nextAction: "Old step",
  nextActionDate: "2026-10-20",
  updatedAt: "2026-10-16T00:00:00Z",
  storageMode: "cloud",
};
const workspace = { opportunities: [row], accounts: [] };
const plan = (label = "Call customer") => ({
  kind: "create_plan",
  targetKey: source.key,
  label,
  date: "2026-10-20",
  channel: "Phone call",
  changes: [],
});
const update = () => ({
  kind: "update_opportunity",
  targetKey: source.key,
  label: "",
  date: "",
  channel: "",
  changes: [{ field: "nextAction", value: "Confirm criteria" }],
});
const prepare = (actions = [plan(), update()]) =>
  prepareActionBatch(actions, [source], workspace, "u1", "batch-1", 1000);
test("API parses only bounded typed actions for owned-context IDs", () => {
  const reply = parseChatReply(
    {
      answer: "Preview only",
      sourceKeys: [source.key],
      draft: "",
      suggestedAction: "",
      missingContext: [],
      suggestedQuestions: [],
      actions: [plan(), update()],
    },
    [source],
  );
  assert.equal(reply.actions.length, 2);
  assert.match(reply.answer, /Chưa áp dụng/);
  const clarification=parseChatReply({answer:'Untrusted duplicate',sourceKeys:[],draft:'',suggestedAction:'',missingContext:[],suggestedQuestions:[],actions:[],clarification:'Bạn muốn sửa cơ hội nào?'},[source]);
  assert.equal(clarification.answer,'Bạn muốn sửa cơ hội nào?');
  for (const invalid of [
    { ...update(), targetKey: "opportunity:foreign" },
    { ...update(), changes: [{ field: "user_id", value: "other" }] },
    { ...update(), changes: [{ field: "stage", value: "Won" }] },
    { ...update(), changes: [{ field: "currency", value: "USD" }] },
    { ...update(), changes: [{ field: "pipelineProbability", value: "101" }] },
    { ...update(), changes: [{ field: "estimatedValue", value: "-1" }] },
    { ...plan(), date: "2026-02-30" },
    { ...plan(), channel: "Invented channel" },
    { ...plan(), kind: "delete_opportunity" },
    { ...plan(), execute: true },
  ])
    assert.throws(() => parseActionList([invalid], [source]));
  assert.throws(() => parseActionList([update(), update()], [source]));
  assert.throws(() =>
    parseActionList(
      Array.from({ length: 9 }, (_, i) => plan(String(i))),
      [source],
    ),
  );
});
test("preparing does not write, uses stable Plan identity and retains exact opportunity identity", () => {
  const batch = prepare();
  assert.equal(batch.items[0].plan.id, "chat-batch-1-0");
  assert.equal(batch.items[0].plan.linkedOpportunityId, "d1");
  assert.equal(batch.items[0].plan.channel, "Phone call");
  assert.match(batch.items[1].preview, /Old step → Confirm criteria/);
  assert.equal(row.nextAction, "Old step");
  assert.throws(() =>
    prepareActionBatch(
      [update()],
      [source],
      { ...workspace, opportunities: [{ ...row, userId: "other" }] },
      "u1",
      "b",
    ),
  );
  assert.throws(() =>
    prepareActionBatch(
      [update()],
      [source],
      { ...workspace, opportunities: [{ ...row, status: "Won" }] },
      "u1",
      "b",
    ),
  );
  assert.throws(() =>
    prepareActionBatch(
      [{ ...update(), changes: [{ field: "stage", value: "Discovery" }] }],
      [source],
      { ...workspace, opportunities: [{ ...row, stage: "Lead" }] },
      "u1",
      "b",
    ),
  );
});
test("freshness is checked for the entire batch before any write", async () => {
  let writes = 0;
  const stores = {
    load: async () => ({
      opportunities: [{ ...row, updatedAt: "newer" }],
      plans: [],
    }),
    update: async () => {
      writes++;
    },
    addPlan: async () => {
      writes++;
    },
  };
  await assert.rejects(() =>
    applyActionBatch(prepare(), stores, () => true, 1001),
  );
  assert.equal(writes, 0);
});
test("confirmation executes all items through injected existing writers and reports results", async () => {
  const calls = [];
  const stores = {
    load: async () => ({ opportunities: [row], plans: [] }),
    update: async (r, c) => {
      calls.push({ kind: "update", id: r.id, changes: c });
      return { mode: "cloud" };
    },
    addPlan: async (r) => {
      calls.push({ kind: "plan", record: r });
      return { mode: "cloud" };
    },
  };
  const result = await applyActionBatch(prepare(), stores, () => true, 1001);
  assert.deepEqual(
    result.map((r) => r.status),
    ["cloud", "cloud"],
  );
  assert.equal(calls[1].id, "d1");
  assert.deepEqual(calls[1].changes, [
    { field: "nextAction", value: "Confirm criteria" },
  ]);
});
test("existing identical Plan work and no-op updates are not written again", async () => {
  const batch = prepare([
    plan(),
    { ...update(), changes: [{ field: "nextAction", value: "Old step" }] },
  ]);
  let writes = 0;
  const result = await applyActionBatch(
    batch,
    {
      load: async () => ({
        opportunities: [row],
        plans: [batch.items[0].plan],
      }),
      addPlan: async () => {
        writes++;
      },
      update: async () => {
        writes++;
      },
    },
    () => true,
    1001,
  );
  assert.deepEqual(
    result.map((r) => r.status),
    ["unchanged", "unchanged"],
  );
  assert.equal(writes, 0);
});
test("partial failure stops later work and preserves successful results", async () => {
  let writes = 0;
  const batch = prepare([plan("One"), plan("Two"), plan("Three")]);
  const result = await applyActionBatch(
    batch,
    {
      load: async () => ({ opportunities: [row], plans: [] }),
      update: async () => ({ mode: "cloud" }),
      addPlan: async () => {
        if (++writes === 2) throw Error("network");
        return { mode: "cloud" };
      },
    },
    () => true,
    1001,
  );
  assert.deepEqual(
    result.map((r) => r.status),
    ["cloud", "failed", "not_run"],
  );
  assert.equal(writes, 2);
});
test("local-only outcome is explicit and stops the batch", async () => {
  const result = await applyActionBatch(
    prepare([plan("One"), plan("Two")]),
    {
      load: async () => ({ opportunities: [], plans: [] }),
      addPlan: async () => ({ mode: "local", warning: "not synced" }),
      update: async () => {
        throw Error("unexpected");
      },
    },
    () => true,
    1001,
  );
  assert.deepEqual(
    result.map((r) => r.status),
    ["local", "not_run"],
  );
  assert.equal(result[0].detail, "not synced");
});
test("owner changes and expired previews stop before writes", async () => {
  let loads = 0;
  const stores = {
    load: async () => {
      loads++;
      return { opportunities: [row], plans: [] };
    },
  };
  await assert.rejects(() =>
    applyActionBatch(prepare(), stores, () => false, 1001),
  );
  await assert.rejects(() =>
    applyActionBatch(prepare(), stores, () => true, 601001),
  );
  assert.equal(loads, 0);
});
test("switching owner after the first write prevents further operations", async () => {
  let owner = true,
    writes = 0;
  const result = await applyActionBatch(
    prepare([plan("One"), plan("Two")]),
    {
      load: async () => ({ opportunities: [], plans: [] }),
      addPlan: async () => {
        writes++;
        owner = false;
        return { mode: "cloud" };
      },
    },
    () => owner,
    1001,
  );
  assert.equal(writes, 1);
  assert.deepEqual(
    result.map((r) => r.status),
    ["cloud", "not_run"],
  );
});
