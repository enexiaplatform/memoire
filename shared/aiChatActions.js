// The model proposes data only. This allowlist is shared by API and browser.
export const actionFields = [
  "nextAction",
  "nextActionDate",
  "stage",
  "status",
  "expectedClosePeriod",
  "estimatedValue",
  "pipelineProbability",
  "evidence",
  "missingContext",
  "objectionDebt",
  "decisionMaker",
  "budgetOwner",
  "procurementPath",
  "technicalCriteria",
];
export const planActionFields = ["date", "label", "channel"];
export const accountActionFields = [
  "strategy",
  "nextFollowUp",
  "relationshipStatus",
];
const allActionFields = [
  ...actionFields,
  ...planActionFields,
  ...accountActionFields,
];
export const actionChannels = [
  "",
  "On-site visit",
  "Hosted visit",
  "Online meeting",
  "Phone call",
  "Email / message",
  "Cold outreach",
  "Event",
  "Desk work",
  "Out of office",
];
export const actionSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "targetKey", "label", "date", "channel", "changes"],
    properties: {
      kind: {
        type: "string",
        enum: [
          "create_plan",
          "update_opportunity",
          "update_plan",
          "update_account",
        ],
      },
      targetKey: { type: "string" },
      label: { type: "string" },
      date: { type: "string" },
      channel: { type: "string", enum: actionChannels },
      changes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["field", "value"],
          properties: {
            field: { type: "string", enum: allActionFields },
            value: { type: "string" },
          },
        },
      },
    },
  },
};
const openStages = [
  "Discovery",
  "Qualification",
  "Technical discussion",
  "Demo",
  "Proposal",
  "Negotiation",
  "Procurement",
];
const validDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value &&
  value >= "2000-01-01" &&
  value <= "2100-12-31";
export function parseActionList(value, sources) {
  if (!Array.isArray(value) || value.length > 8)
    throw new Error("invalid_actions");
  const keys = new Map(sources.map((source) => [source.key, source.kind]));
  const seen = new Set();
  return value.map((action) => {
    if (
      !action ||
      typeof action !== "object" ||
      Object.keys(action).sort().join(",") !==
        "changes,channel,date,kind,label,targetKey" ||
      ![
        "create_plan",
        "update_opportunity",
        "update_plan",
        "update_account",
      ].includes(action.kind) ||
      !["targetKey", "label", "date", "channel"].every(
        (key) => typeof action[key] === "string",
      ) ||
      action.targetKey.length > 180 ||
      action.label.length > 500 ||
      !actionChannels.includes(action.channel) ||
      !Array.isArray(action.changes)
    )
      throw new Error("invalid_actions");
    if (action.kind === "create_plan") {
      if (
        !action.label.trim() ||
        !validDate(action.date) ||
        action.changes.length ||
        (action.targetKey &&
          !["account", "opportunity"].includes(keys.get(action.targetKey)))
      )
        throw new Error("invalid_actions");
    } else {
      if (
        keys.get(action.targetKey) !==
          {
            update_opportunity: "opportunity",
            update_plan: "plan",
            update_account: "account",
          }[action.kind] ||
        action.label ||
        action.date ||
        action.channel ||
        !action.changes.length ||
        action.changes.length > 8
      )
        throw new Error("invalid_actions");
    }
    const fields = new Set();
    for (const change of action.changes) {
      if (
        !change ||
        Object.keys(change).sort().join(",") !== "field,value" ||
        !(
          action.kind === "update_plan"
            ? planActionFields
            : action.kind === "update_account"
              ? accountActionFields
              : actionFields
        ).includes(change.field) ||
        typeof change.value !== "string" ||
        change.value.length > 1200 ||
        fields.has(change.field)
      )
        throw new Error("invalid_actions");
      fields.add(change.field);
      if (
        ["date", "nextFollowUp"].includes(change.field) &&
        !validDate(change.value)
      )
        throw new Error("invalid_actions");
      if (
        change.field === "label" &&
        (!change.value.trim() || change.value.length > 500)
      )
        throw new Error("invalid_actions");
      if (change.field === "channel" && !actionChannels.includes(change.value))
        throw new Error("invalid_actions");
      if (
        change.field === "relationshipStatus" &&
        ![
          "New",
          "Developing",
          "Active",
          "Dormant",
          "At risk",
          "Strong",
        ].includes(change.value)
      )
        throw new Error("invalid_actions");

      if (change.field === "stage" && !openStages.includes(change.value))
        throw new Error("invalid_actions");
      if (
        change.field === "status" &&
        !["Active", "On hold"].includes(change.value)
      )
        throw new Error("invalid_actions");
      if (change.field === "nextActionDate" && !validDate(change.value))
        throw new Error("invalid_actions");
      if (
        ["estimatedValue", "pipelineProbability"].includes(change.field) &&
        (!/^\d+(\.\d+)?$/.test(change.value) ||
          !Number.isFinite(Number(change.value)) ||
          Number(change.value) < 0 ||
          (change.field === "pipelineProbability" &&
            Number(change.value) > 100))
      )
        throw new Error("invalid_actions");
    }
    const identity =
      action.kind !== "create_plan"
        ? `${action.kind}:${action.targetKey}`
        : `${action.targetKey}:${action.date}:${action.label.trim()}`;
    if (seen.has(identity)) throw new Error("invalid_actions");
    seen.add(identity);
    return {
      ...action,
      changes: action.changes.map((change) => ({ ...change })),
    };
  });
}

/** Context retention only: assistant text never authorizes a write. */
export function isPlanTransferRequest(question) {
  const text = question
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
  return (
    /\b(add|put|save|insert|them|luu|dua)\b/.test(text) &&
    /\b(plan|ke hoach|lich)\b/.test(text) &&
    (// Vietnamese "them" is the add verb, not the English pronoun "them".
      (/\b(add|put|save|insert)\b/.test(text) && /\b(it|them|these|those|above|draft|this|that|all)\b/.test(text)) ||
      (/\b(add|put|save|insert)\b/.test(text) && /\b(?:first|last) (?:one|two|three|\d+|task|item)\b/.test(text)) ||
      /\b(?:(?:cac|nhung) )?(?:viec|cong viec|muc|lich|ke hoach|ban nhap|de xuat|danh sach) (?:o )?(?:nay|do|tren)\b/.test(text) ||
      /\b(?:tat ca|toan bo|chung) vao (?:plan|ke hoach|lich)\b/.test(text) ||
      /\b(?:viec|muc)(?: so)? \d+\b|\b\d+ (?:viec|muc) (?:dau|cuoi)\b/.test(text) ||
      /^(?:add (?:into|to) (?:the )?plan(?: with details information)?|(?:them|luu) (?:vao )?(?:plan|ke hoach|lich))(?: (?:tuan sau|tuan toi|next week))?[.! ]*$/.test(text))
  );
}
