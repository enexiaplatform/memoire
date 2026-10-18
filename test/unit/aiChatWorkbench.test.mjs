import { test } from "node:test";
import assert from "node:assert/strict";
import "../support/reportingCurrency.mjs";
import { buildChatContext } from "../../src/features/aiChat/chatContext.ts";
import { businessAnswer } from "../../src/features/aiChat/businessAnswers.ts";
import { workbenchAnswer } from "../../src/features/aiChat/workbenchAnswers.ts";
import {
  aiWorkflows,
  workflowsForSurface,
  viewedRecordScope,
} from "../../src/features/aiChat/workflows.ts";
import { parseActionList } from "../../shared/aiChatActions.js";
import {
  prepareActionBatch,
  applyActionBatch,
} from "../../src/features/aiChat/actionBatch.ts";
import {
  validateChatRequest,
  sourceHref,
  createAiChatHandler,
} from "../../api/_aiChat.js";
const now = new Date(2026, 9, 17, 12);
const account = {
  id: "a1",
  userId: "u1",
  accountName: "Fictional Acme",
  relationshipStatus: "Active",
  accountPotential: "High",
  strategy: "Review criteria",
  nextFollowUp: "2026-10-20",
  updatedAt: "2026-10-16T00:00:00Z",
  storageMode: "cloud",
};
const deal = (id = "d1", more = {}) => ({
  id,
  userId: "u1",
  accountId: "a1",
  accountName: "Fictional Acme",
  opportunityName: `Analyzer ${id}`,
  stage: "Proposal",
  status: "Active",
  estimatedValue: 100,
  currency: "VND",
  productOrSolution: "Analyzer",
  decisionMaker: "",
  budgetOwner: "",
  procurementPath: "",
  expectedClosePeriod: "",
  missingContext: "",
  objectionDebt: "",
  forecastEvidenceCategory: "Weak but recoverable",
  decisionRecommendation: "Monitor",
  nextAction: "Review scope",
  nextActionDate: "2026-10-20",
  evidence: "Demo requested",
  technicalCriteria: "Needs sensitivity",
  updatedAt: "2026-10-16T00:00:00Z",
  createdAt: "2026-10-01T00:00:00Z",
  storageMode: "cloud",
  ...more,
});
const workspace = (more = {}) => ({
  accounts: [account],
  opportunities: [deal()],
  activities: [],
  quotes: [],
  commitments: [],
  threads: [],
  stakeholders: [],
  objections: [],
  assets: [],
  evidence: [],
  actionOutcomes: [],
  opportunityOutcomes: [],
  portfolioRecords: [],
  receivableRecords: [],
  milestoneRecords: [],
  ...more,
});
const plan = {
  id: "p1",
  date: "2026-10-20",
  label: "Prepare checklist",
  tag: "Acme",
  done: false,
  linkedOpportunityId: "d1",
  linkedAccountName: "Fictional Acme",
  channel: "Desk work",
  createdAt: "2026-10-16T00:00:00Z",
  updatedAt: "2026-10-16T00:00:00Z",
  source: "user",
};
const source = (kind, id) => ({
  kind,
  id,
  key: `${kind}:${id}`,
  title: id,
  detail: "",
});
const sources = [
  source("plan", "p1"),
  source("account", "a1"),
  source("opportunity", "d1"),
];
const edit = (
  kind = "update_plan",
  changes = [{ field: "date", value: "2026-10-22" }],
) => ({
  kind,
  targetKey: kind === "update_plan" ? "plan:p1" : "account:a1",
  label: "",
  date: "",
  channel: "",
  changes,
});

test("workflow catalog covers the existing surfaces and chooses without transmitting", () => {
  assert.equal(aiWorkflows.length, 11);
  for (const surface of [
    "today",
    "leads",
    "accounts",
    "opportunities",
    "timeline",
    "revenue",
    "reviews",
    "products",
    "capture",
    "reports",
  ])
    assert.ok(workflowsForSurface(`/app/${surface}`).length);
  assert.equal(workflowsForSurface("/app/leads")[0].id, "leads");
  assert.deepEqual(viewedRecordScope("?accountId=a1"), {
    kind: "account",
    id: "a1",
  });
  assert.deepEqual(viewedRecordScope("?accountId=a1&opportunityId=d1"), {
    kind: "opportunity",
    id: "d1",
  });
  assert.equal(viewedRecordScope("?accountId=../../other"), null);
});
test("next-week Plan analysis reads next week instead of current week", () => {
  const result = businessAnswer(workspace(), "Đề xuất Plan tuần sau", [], now);
  assert.match(result.source.title, /Next week/);
  assert.match(result.facts.join(" "), /2026-10-19 through 2026-10-25/);
  assert.ok(result.preferredIds.includes("d1"));
  const current = businessAnswer(workspace(), "Tuần này gặp ai?", [], now);
  assert.match(current.facts.join(" "), /2026-10-12 through 2026-10-18/);
});
test("lead qualification uses canonical evidence dimensions and never creates a score", () => {
  const result = workbenchAnswer(
    workspace({ opportunities: [deal("l1", { stage: "Lead" })] }),
    "Sàng lọc lead qualification",
    now,
  );
  assert.equal(result.source.id, "lead-qualification");
  assert.match(result.facts.join(" "), /recorded dimensions/);
  assert.deepEqual(result.preferredIds, ["l1"]);
  assert.equal(
    workbenchAnswer(workspace(), "Review lead time objection", now),
    null,
  );
});
test("defense, customer preparation and hygiene use scoped data with named limits", () => {
  const data = workspace({
    opportunities: [
      deal("d1", {
        nextAction: "",
        nextActionDate: "",
        evidence: "",
        estimatedValue: null,
      }),
    ],
  });
  const health = workbenchAnswer(data, "Ưu tiên hôm nay và deal risk", now);
  assert.equal(health.source.id, "deal-coaching");
  assert.match(health.facts[0], /1 measured/);
  const gaps = workbenchAnswer(data, "Rà soát data hygiene", now);
  assert.match(gaps.facts.join(" "), /1 have at least one missing field/);
  assert.match(gaps.facts.join(" "), /0 have past-due/);
  assert.match(gaps.facts.join(" "), /estimated value/);
  const emptyAccount = workbenchAnswer(
    workspace({ opportunities: [] }),
    "account brief",
    now,
  );
  assert.match(emptyAccount.facts[0], /1 linked accounts, 0 opportunities/);
});
test("learning keeps the existing low-sample boundary and actual outcome reasons", () => {
  const outcome = {
    id: "o1",
    userId: "u1",
    opportunityId: "d1",
    accountName: "Fictional Acme",
    opportunityName: "Analyzer d1",
    outcome: "Lost",
    outcomeDate: "2026-10-15",
    reasonCategory: "Technical fit",
    reasonText: "Sensitivity not accepted",
    lessonLearned: "Confirm threshold first",
    stageBeforeOutcome: "Proposal",
  };
  const result = workbenchAnswer(
    workspace({ opportunityOutcomes: [outcome] }),
    "win/loss learning",
    now,
  );
  assert.match(result.facts.join(" "), /sample: 1/);
  assert.match(result.facts.join(" "), /false/);
  assert.match(result.facts.join(" "), /Confirm threshold first/);
  assert.match(result.limitations.join(" "), /not causal/);
});
test("collections facts reuse canonical order engine and distinguish unknown values", () => {
  const result = workbenchAnswer(
    workspace({
      opportunities: [
        deal("won", {
          stage: "Won",
          status: "Won",
          estimatedValue: null,
          expectedClosePeriod: "2026-10",
          paymentTerm: "30 days",
        }),
      ],
    }),
    "collections công nợ",
    now,
  );
  assert.equal(result.source.id, "collections-priority");
  assert.match(result.facts[0], /explicitly linked order book/);
  // No qualified orders is an honest empty scope, not an invented receivable.
  const empty = workbenchAnswer(
    workspace({ opportunities: [] }),
    "collections",
    now,
  );
  assert.match(empty.facts[0], /0 orders/);
  assert.deepEqual(empty.preferredIds, []);
});
test("rich context excludes other owners/scopes, contact details and superseded findings", () => {
  const stakeholder = {
    id: "s1",
    userId: "u1",
    accountId: "a1",
    opportunityId: "d1",
    name: "Fictional QC",
    stakeholderRole: "Technical Buyer",
    roleTitle: "QC",
    influenceLevel: "High",
    relationshipStrength: "Developing",
    stance: "Neutral",
    email: "DO-NOT-SHARE@private.test",
    phone: "PRIVATE-PHONE",
    notes: "PRIVATE-NOTE",
  };
  const evidence = {
    id: "e1",
    userId: "u1",
    accountId: "a1",
    accountName: "Fictional Acme",
    opportunityId: "d1",
    category: "technical_outcome",
    direction: "supports",
    summary: "Current trial accepted",
    observedAt: "2026-10-16",
    recordedAt: "2026-10-16",
    updatedAt: "2026-10-16",
  };
  const data = workspace({
    opportunities: [deal(), deal("other", { accountId: "a2" })],
    stakeholders: [
      stakeholder,
      {
        ...stakeholder,
        id: "foreign",
        userId: "other",
        name: "FOREIGN-PERSON",
      },
      {
        ...stakeholder,
        id: "scope-other",
        accountId: "a2",
        opportunityId: "other",
        name: "OTHER-SCOPE",
      },
    ],
    objections: [
      {
        id: "b1",
        userId: "u1",
        accountId: "a1",
        opportunityId: "d1",
        objectionType: "Technical fit",
        objectionText: "Need proof",
        status: "Open",
        requiredProof: "Trial report",
        responsePlan: "Review protocol",
        impact: "High",
      },
    ],
    evidence: [
      evidence,
      {
        ...evidence,
        id: "e0",
        summary: "OLD-SUPERSEDED",
        observedAt: "2026-10-01",
        recordedAt: "2026-10-01",
        updatedAt: "2026-10-01",
      },
    ],
  });
  const context = buildChatContext(
    data,
    "u1",
    { kind: "opportunity", id: "d1" },
    "account brief",
    [plan],
  );
  const json = JSON.stringify(context);
  for (const text of [
    "DO-NOT-SHARE",
    "PRIVATE-PHONE",
    "PRIVATE-NOTE",
    "FOREIGN-PERSON",
    "OTHER-SCOPE",
    "OLD-SUPERSEDED",
  ])
    assert.equal(json.includes(text), false, text);
  for (const kind of ["plan", "stakeholder", "objection", "evidence"])
    assert.ok(
      context.sources.some((row) => row.kind === kind),
      kind,
    );
  assert.equal(
    validateChatRequest({
      consent: true,
      messages: [{ role: "user", content: "Brief" }],
      context,
    }),
    true,
  );
  for (const row of context.sources) assert.match(sourceHref(row), /^\/app\//);
});
test("new actions accept only exact source kind and allowlisted values", () => {
  assert.equal(
    parseActionList(
      [
        edit(),
        edit("update_account", [{ field: "strategy", value: "Meet QC" }]),
      ],
      sources,
    ).length,
    2,
  );
  for (const invalid of [
    edit("update_plan", [{ field: "done", value: "true" }]),
    edit("update_plan", [{ field: "linkedOpportunityId", value: "other" }]),
    edit("update_plan", [{ field: "date", value: "2026-02-30" }]),
    edit("update_plan", [{ field: "channel", value: "Carrier pigeon" }]),
    edit("update_account", [{ field: "accountName", value: "Rename" }]),
    edit("update_account", [{ field: "relationshipStatus", value: "Won" }]),
    edit("update_account", [{ field: "nextFollowUp", value: "" }]),
    { ...edit(), targetKey: "account:a1" },
  ])
    assert.throws(() => parseActionList([invalid], sources));
  assert.throws(() => parseActionList([edit(), edit()], sources));
});
test("editing a Plan preserves identity, links and history without creating a second task", async () => {
  const batch = prepareActionBatch(
    [edit()],
    sources,
    workspace(),
    "u1",
    "batch",
    now.getTime(),
    [plan],
  );
  assert.equal(batch.items[0].plan.id, "p1");
  assert.equal(batch.items[0].plan.linkedOpportunityId, "d1");
  assert.equal(batch.items[0].plan.createdAt, plan.createdAt);
  assert.equal(batch.items[0].plan.done, false);
  assert.match(batch.items[0].preview, /2026-10-20 → 2026-10-22/);
  let saved;
  const results = await applyActionBatch(
    batch,
    {
      load: async () => ({
        opportunities: [deal()],
        plans: [plan],
        accounts: [account],
      }),
      addPlan: async (row) => {
        saved = row;
        return { mode: "cloud" };
      },
      update: async () => {
        throw Error("wrong writer");
      },
    },
    () => true,
    now.getTime(),
  );
  assert.equal(results[0].status, "cloud");
  assert.equal(saved.id, "p1");
  assert.equal(saved.date, "2026-10-22");
  assert.equal(plan.date, "2026-10-20");
});
test("entire batch preflight rejects stale, deleted, completed and foreign targets before any write", async () => {
  for (const changed of [
    { ...plan, updatedAt: "changed" },
    { ...plan, __deleted: true },
    { ...plan, done: true },
    { ...plan, label: "Changed without timestamp" },
  ]) {
    const batch = prepareActionBatch(
      [edit()],
      sources,
      workspace(),
      "u1",
      "batch",
      now.getTime(),
      [plan],
    );
    let writes = 0;
    await assert.rejects(() =>
      applyActionBatch(
        batch,
        {
          load: async () => ({ opportunities: [], plans: [changed] }),
          addPlan: async () => {
            writes++;
            return { mode: "cloud" };
          },
        },
        () => true,
        now.getTime(),
      ),
    );
    assert.equal(writes, 0);
  }
  for (const bad of [
    { ...plan, derivedKey: "deal:d1" },
    { ...plan, done: true },
    { ...plan, isSample: true },
  ])
    assert.throws(() =>
      prepareActionBatch(
        [edit()],
        sources,
        workspace(),
        "u1",
        "batch",
        now.getTime(),
        [bad],
      ),
    );
  assert.throws(() =>
    prepareActionBatch(
      [edit("update_account", [{ field: "strategy", value: "New" }])],
      sources,
      workspace({ accounts: [{ ...account, userId: "other" }] }),
      "u1",
      "batch",
      now.getTime(),
    ),
  );
});
test("account update uses its writer, preserves values and halts after local-only result", async () => {
  const actions = [
    edit("update_account", [
      { field: "strategy", value: "Meet QC" },
      { field: "nextFollowUp", value: "2026-10-22" },
    ]),
    edit(),
  ];
  const batch = prepareActionBatch(
    actions,
    sources,
    workspace(),
    "u1",
    "batch",
    now.getTime(),
    [plan],
  );
  let plansWritten = 0,
    received;
  const result = await applyActionBatch(
    batch,
    {
      load: async () => ({
        opportunities: [],
        plans: [plan],
        accounts: [account],
      }),
      updateAccount: async (row, changes) => {
        received = { row, changes };
        return { mode: "local", warning: "Cloud unavailable" };
      },
      addPlan: async () => {
        plansWritten++;
        return { mode: "cloud" };
      },
    },
    () => true,
    now.getTime(),
  );
  assert.equal(received.row.id, "a1");
  assert.equal(account.strategy, "Review criteria");
  assert.equal(result[0].status, "local");
  assert.equal(result[1].status, "not_run");
  assert.equal(plansWritten, 0);
});
test("server verifies new source kinds with owner-bound reads and refuses missing ownership", async () => {
  const tables = [];
  const handler = createAiChatHandler({
    env: { AI_CHAT_ENABLED: "true", GROQ_API_KEY: "fictional" },
    verify: async () => ({ id: "u1" }),
    clientForToken: () => ({
      from(table) {
        tables.push(table);
        return {
          select() {
            return this;
          },
          eq(key, value) {
            assert.equal(key, "user_id");
            assert.equal(value, "u1");
            return this;
          },
          in: async () => ({ data: [], error: null }),
        };
      },
    }),
    rateLimit: () => ({
      allowed: true,
      limit: 6,
      remaining: 5,
      resetAt: Date.now() + 60000,
    }),
    fetcher: async () => {
      throw Error("Provider must not run");
    },
  });
  const response = {
    code: 200,
    setHeader() {},
    status(value) {
      this.code = value;
      return this;
    },
    json(value) {
      this.payload = value;
    },
  };
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer synthetic" },
      body: {
        consent: true,
        messages: [{ role: "user", content: "Prepare brief" }],
        context: {
          asOf: now.toISOString(),
          scope: "Fictional",
          sources: [
            source("plan", "p1"),
            source("stakeholder", "s1"),
            source("objection", "b1"),
            source("evidence", "e1"),
            source("outcome", "o1"),
          ],
          facts: [],
          limitations: [],
        },
      },
    },
    response,
  );
  assert.equal(response.code, 409);
  assert.equal(response.payload.error, "context_not_synced");
  assert.deepEqual(
    tables.sort(),
    [
      "plan_items",
      "stakeholders",
      "objections",
      "commercial_evidence",
      "opportunity_outcomes",
    ].sort(),
  );
});
import { buildOrderBook } from "../../src/utils/orderToCash.ts";
import { buildReceivables } from "../../src/utils/receivables.ts";
test("collection adapter reports canonical amounts and withholds totals for missing FX", () => {
  const quote = {
    id: "q1",
    opportunityId: "d1",
    accountName: "Fictional Acme",
    title: "Order quote",
    quoteDate: "2026-09-01",
    amount: 100,
    currency: "VND",
    paymentTerm: "Net 30",
    status: "Accepted",
    poStatus: "Received",
    deliveryStatus: "Delivered",
    paymentStatus: "Not due",
    paymentDueDate: "2026-09-30",
    createdAt: "2026-09-01",
    updatedAt: "2026-09-01",
  };
  const data = workspace({
    opportunities: [deal("d1", { stage: "Won", status: "Won" })],
    quotes: [quote],
  });
  const book = buildOrderBook({
    opportunities: data.opportunities,
    quotes: data.quotes,
    linkage: "explicit-id",
    today: "2026-10-17",
    milestoneRecords: [],
    receivableRecords: [],
  });
  const canonical = buildReceivables({
    orders: book.orders,
    records: [],
    today: "2026-10-17",
  });
  assert.equal(canonical.totalOutstandingBase, 100);
  const result = workbenchAnswer(data, "collections", now);
  assert.ok(
    result.facts.some((fact) =>
      fact.includes(
        `Outstanding ${canonical.totalOutstandingBase}; overdue ${canonical.totalOverdueBase}; confirmed overdue ${canonical.confirmedOverdueBase}; planned overdue ${canonical.plannedOverdueBase};`,
      ),
    ),
  );
  assert.ok(result.preferredIds.includes("d1"));
  const unknown = workbenchAnswer(
    workspace({
      opportunities: [
        deal("d1", { stage: "Won", status: "Won", currency: "ZZZ" }),
      ],
      quotes: [{ ...quote, currency: "ZZZ" }],
    }),
    "collections",
    now,
  );
  assert.ok(unknown.limitations.some((line) => line.includes("withheld")));
  assert.equal(
    unknown.facts.some((line) => line.startsWith("Outstanding ")),
    false,
  );
});
test("named customer without an opportunity is retrievable for its existing strategy", () => {
  const context = buildChatContext(
    workspace({ opportunities: [] }),
    "u1",
    { kind: "all" },
    "Cập nhật chiến lược Fictional Acme",
  );
  assert.ok(context.sources.some((row) => row.key === "account:a1"));
});
import { assertPlanReferenceTargets } from "../../src/features/aiChat/planReference.ts";
test("copying a Plan source cannot silently discard its unavailable original linkage", () => {
  assert.throws(
    () =>
      assertPlanReferenceTargets(
        [
          {
            kind: "create_plan",
            targetKey: "",
            label: "Copy task",
            date: "2026-10-22",
            channel: "Desk work",
            changes: [],
          },
        ],
        {
          asOf: now.toISOString(),
          scope: "Fictional",
          sources: [source("plan", "p1")],
          facts: [],
          limitations: [],
        },
      ),
    /liên kết gốc/,
  );
});
test("outgoing provider schema includes editable Plan keys and excludes read-only targets", async () => {
  let schema;
  const handler = createAiChatHandler({
    env: { AI_CHAT_ENABLED: "true", GROQ_API_KEY: "fictional" },
    verify: async () => ({ id: "u1" }),
    clientForToken: () => ({
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          in: async (_field, ids) => ({
            data: ids.map((id) => ({ id, user_id: "u1" })),
            error: null,
          }),
        };
      },
    }),
    rateLimit: () => ({
      allowed: true,
      limit: 6,
      remaining: 5,
      resetAt: Date.now() + 60000,
    }),
    fetcher: async (_url, options) => {
      schema = JSON.parse(options.body).response_format.json_schema.schema;
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                answer: "Proposed move",
                sourceKeys: ["plan:p1"],
                draft: "",
                suggestedAction: "",
                missingContext: [],
                suggestedQuestions: [],
                actions: [edit()],
                clarification: "",
              }),
            },
          },
        ],
      });
    },
  });
  const response = {
    code: 200,
    setHeader() {},
    status(value) {
      this.code = value;
      return this;
    },
    json(value) {
      this.payload = value;
    },
  };
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer synthetic" },
      body: {
        consent: true,
        messages: [{ role: "user", content: "Move Plan p1 to 2026-10-22" }],
        context: {
          asOf: now.toISOString(),
          scope: "Fictional",
          sources: [...sources, source("stakeholder", "s1")],
          facts: [],
          limitations: [],
        },
      },
    },
    response,
  );
  assert.equal(response.code, 200);
  assert.ok(
    schema.properties.actions.items.properties.targetKey.enum.includes(
      "plan:p1",
    ),
  );
  assert.equal(
    schema.properties.actions.items.properties.targetKey.enum.includes(
      "stakeholder:s1",
    ),
    false,
  );
  assert.equal(response.payload.actions[0].kind, "update_plan");
});
import { fitChatContext } from "../../src/features/aiChat/contextBudget.ts";
test("large evidence fits free-provider input budget without dropping writable identities or facts", () => {
  const make = (kind, id) => ({
    ...source(kind, id),
    title: "Fictional descriptive record ".repeat(5).slice(0, 150),
    detail: "Supporting record text. ".repeat(40),
  });
  const original = {
    asOf: now.toISOString(),
    scope: "Fictional",
    sources: [
      make("account", "a1"),
      make("opportunity", "d1"),
      make("plan", "p1"),
      make("analysis", "data-hygiene"),
      ...Array.from({ length: 12 }, (_, index) =>
        make("stakeholder", `s${index}`),
      ),
    ],
    facts: Array.from(
      { length: 5 },
      (_, index) => `${index}: ${"A".repeat(1090)}`,
    ),
    limitations: ["Only a snapshot."],
  };
  const packed = fitChatContext(original, "Prepare account brief");
  assert.ok(Buffer.byteLength(JSON.stringify(packed), "utf8") <= 7600);
  assert.deepEqual(packed.facts, original.facts);
  for (const key of [
    "account:a1",
    "opportunity:d1",
    "plan:p1",
    "analysis:data-hygiene",
  ])
    assert.ok(packed.sources.some((row) => row.key === key));
  assert.ok(packed.sources.length < original.sources.length);
  assert.match(packed.limitations.at(-1), /supporting sources omitted/);
  assert.equal(
    original.sources[0].detail.length,
    "Supporting record text. ".repeat(40).length,
  );
});
test("facts too large to preserve require narrowing before transmitting anything", () => {
  assert.throws(
    () =>
      fitChatContext(
        {
          asOf: now.toISOString(),
          scope: "Fictional",
          sources: [],
          facts: Array.from({ length: 10 }, () => "A".repeat(1100)),
          limitations: [],
        },
        "Brief",
      ),
    /Chọn một khách hàng/,
  );
});
test("Plan transfer never drops the most recent agenda to squeeze into the model budget", async () => {
  const run = async (question) => {
    let calls = 0;
    const handler = createAiChatHandler({
      env: { AI_CHAT_ENABLED: "true", GROQ_API_KEY: "fictional" },
      verify: async () => ({ id: "u1" }),
      clientForToken: () => ({
        from() {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            in: async (_key, ids) => ({
              data: ids.map((id) => ({ id, user_id: "u1" })),
              error: null,
            }),
          };
        },
      }),
      rateLimit: () => ({
        allowed: true,
        limit: 6,
        remaining: 5,
        resetAt: Date.now() + 60000,
      }),
      fetcher: async () => {
        calls++;
        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  answer: "Recorded facts",
                  sourceKeys: ["opportunity:d1"],
                  draft: "",
                  suggestedAction: "",
                  missingContext: [],
                  suggestedQuestions: [],
                  actions: [],
                  clarification: "",
                }),
              },
            },
          ],
        });
      },
    });
    const response = {
      code: 200,
      setHeader() {},
      status(value) {
        this.code = value;
        return this;
      },
      json(value) {
        this.payload = value;
      },
    };
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer synthetic" },
        body: {
          consent: true,
          messages: [
            { role: "user", content: "U".repeat(1000) },
            { role: "assistant", content: "D".repeat(6000) },
            { role: "user", content: question },
          ],
          context: {
            asOf: now.toISOString(),
            scope: "Fictional",
            sources: [source("opportunity", "d1")],
            facts: Array.from({ length: 5 }, () => "A".repeat(1100)),
            limitations: [],
          },
        },
      },
      response,
    );
    return { response, calls };
  };
  const transfer = await run("add it into the Plan for next week");
  assert.equal(transfer.response.code, 413);
  assert.equal(transfer.response.payload.error, "context_too_large");
  assert.equal(transfer.calls, 0);
  const independent = await run("Which stage is recorded?");
  assert.equal(independent.response.code, 200);
  assert.equal(independent.calls, 1);
});


test('Plan drafting retrieval keeps overdue candidates even when next week already has many scheduled deals', () => {
  const rows=[...Array.from({length:8},(_,i)=>deal(`scheduled-${i}`,{nextActionDate:'2026-10-21'})),deal('backlog',{nextActionDate:'2026-10-15'}),deal('lead-backlog',{stage:'Lead',nextActionDate:'2026-09-23'})];
  const context=buildChatContext(workspace({opportunities:rows}), 'u1', {kind:'all'}, 'Chuẩn bị plan tuần sau cho tôi');
  const ids=context.sources.filter(source=>source.kind==='opportunity').map(source=>source.id);
  assert.ok(ids.includes('backlog'));
  assert.ok(ids.includes('lead-backlog'));
  assert.equal(ids.length,5);
  assert.match(context.facts.join(' '),/DRAFT CANDIDATE opportunity:lead-backlog/);
});


test('weekly draft with long Vietnamese account names fits without unrelated personal Plan identities',()=>{
  const name='CÔNG TY CỔ PHẦN DƯỢC PHẨM VÀ NGHIÊN CỨU THỬ NGHIỆM SẢN XUẤT QUỐC TẾ ';
  const accounts=Array.from({length:3},(_,i)=>({...account,id:`a${i}`,accountName:name+i}));
  const opportunities=Array.from({length:100},(_,i)=>deal(`d${i}`,{accountId:`a${i%3}`,accountName:name+(i%3),nextAction:'',nextActionDate:'',opportunityName:'Cơ hội kiểm tra hồ sơ '+i}));
  const records=Array.from({length:3},(_,i)=>({...plan,id:`plan${i}`,label:'Một việc cá nhân dài cần giữ nguyên '.repeat(12),linkedOpportunityId:undefined,linkedAccountName:undefined}));
  const context=buildChatContext(workspace({accounts,opportunities}),'u1',{kind:'all'},'Chuẩn bị plan tuần sau cho tôi',records);
  assert.equal(context.sources.filter(source=>source.kind==='opportunity').length,5);
  assert.equal(context.sources.some(source=>source.kind==='plan'),false);
  assert.match(context.facts.join(' '),/100 active opportunity\/Lead work candidates/);
  assert.ok(Buffer.byteLength(JSON.stringify(context))<=7200);
});
