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
      kind: { type: "string", enum: ["create_plan", "update_opportunity"] },
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
            field: { type: "string", enum: actionFields },
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
      !["create_plan", "update_opportunity"].includes(action.kind) ||
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
        keys.get(action.targetKey) !== "opportunity" ||
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
        !actionFields.includes(change.field) ||
        typeof change.value !== "string" ||
        change.value.length > 1200 ||
        fields.has(change.field)
      )
        throw new Error("invalid_actions");
      fields.add(change.field);
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
      action.kind === "update_opportunity"
        ? action.targetKey
        : `${action.targetKey}:${action.date}:${action.label.trim()}`;
    if (seen.has(identity)) throw new Error("invalid_actions");
    seen.add(identity);
    return {
      ...action,
      changes: action.changes.map((change) => ({ ...change })),
    };
  });
}
