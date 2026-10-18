import type { SalesWorkspaceData } from "../../services/workspaceData";
import { buildPlanBoard, type PlanRecord } from "../../utils/weeklyPlan.ts";
import { isValidBusinessDate, toLocalDateKey, todayDateKey } from "../../utils/safeDate.ts";
import { disqualifiedLeadIds } from "../../utils/leadIdentity.ts";

/** Drafting work is different from querying an already populated future calendar. */
export function weeklyPlanDraft(
  workspace: SalesWorkspaceData,
  records: PlanRecord[],
  reference: Date,
  rangeStart: string,
  rangeEnd: string,
) {
  const closedLeads = disqualifiedLeadIds(workspace.opportunityOutcomes || []);
  const active = workspace.opportunities.filter(
    (row) => row.status === "Active" && !["Won", "Lost"].includes(row.stage) && !closedLeads.has(row.id),
  );
  const current = buildPlanBoard({
    periodType: "week", anchorDate: reference, today: todayDateKey(reference),
    opportunities: active, obligations: [], activities: workspace.activities, records,
  });
  // The canonical board supplies completion/grouping and carried-backlog rules.
  const openIds = new Set(current.days.flatMap(day => day.items)
    .filter(item => !item.done && item.kind === "deal")
    .map(item => item.id.slice("deal-".length)));
  const candidates = active.filter(row =>
    (!isValidBusinessDate(row.nextActionDate) ||
      (row.nextActionDate < rangeStart && openIds.has(row.id))),
  ).sort((a, b) => (a.nextActionDate || "9999").localeCompare(b.nextActionDate || "9999") || a.id.localeCompare(b.id));
  const listed = candidates.slice(0, 5);
  const facts = [
    `DRAFT PLANNING MODE: ${candidates.length} active opportunity/Lead work candidates are eligible to propose for ${rangeStart} through ${rangeEnd}; ${listed.length} shown. These are NOT already scheduled in that future week. An empty future calendar does not mean there is no work to propose.`,
  ];
  for (const [index, row] of listed.entries()) {
    const date = new Date(`${rangeStart}T12:00:00`);
    date.setDate(date.getDate() + index);
    const suggestedDate = toLocalDateKey(date);
    facts.push(
      `DRAFT CANDIDATE opportunity:${row.id}: ${row.opportunityName.slice(0, 100)}; task ${row.nextAction?.trim() ? row.nextAction.slice(0, 450) : "Rà soát cơ hội và xác nhận bước tiếp theo"}; original due ${row.nextActionDate || "not recorded"}; suggested date ${suggestedDate}; channel not recorded. Reason: ${!row.nextAction?.trim() ? "no recorded next action; propose a record review to clarify it, not an invented customer promise" : isValidBusinessDate(row.nextActionDate) ? "unfinished current/backlog next action" : "recorded next action missing a due date"}. Proposed work date only, not a confirmed appointment.`,
    );
  }
  return {
    facts,
    preferredIds: listed.map(row => row.id),
    limitations: [
      "Draft candidates cover unfinished next actions and proposed record reviews where next actions are missing on active opportunities and working Leads, using current Plan completion/backlog rules. Existing manually entered Plan tasks are not automatically moved. Do not recreate work already scheduled next week. If candidates exist, provide a dated draft before asking for preferences; do not request the user to re-enter the supplied task details. If none exist, explain the missing actionable work rather than inventing customer commitments.",
    ],
  };
}
