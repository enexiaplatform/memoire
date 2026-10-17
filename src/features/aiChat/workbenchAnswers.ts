import type { SalesWorkspaceData } from "../../services/workspaceData";
import type { BusinessAnswer } from "./businessAnswers";
import { buildLeadQueue, leadQueueStateLabels } from "../../utils/leadQueue.ts";
import { buildLivePipelineHealth } from "../../utils/livePipelineHealth.ts";
import { analyzePersonalSalesLearning } from "../../utils/personalSalesLearning.ts";
import { buildOrderBook } from "../../utils/orderToCash.ts";
import { buildReceivables } from "../../utils/receivables.ts";
import { getReportingCurrency } from "../../utils/money.ts";
import { todayDateKey, isValidBusinessDate } from "../../utils/safeDate.ts";
import { buildPlanBoard, type PlanRecord } from "../../utils/weeklyPlan.ts";
import { derivePlanCommitments } from "../../domain/commercialKernel/derivePlanCommitments.ts";
import { isLeadStage, disqualifiedLeadIds } from "../../utils/leadIdentity.ts";

const brief = (value: unknown) => String(value || "").slice(0, 200);
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .toLowerCase();

/** Full scoped deterministic readings; the model explains these, never recomputes them. */
export function workbenchAnswer(
  workspace: SalesWorkspaceData,
  question: string,
  reference = new Date(),
  plan: PlanRecord[] = [],
): BusinessAnswer | null {
  const q = normalize(question),
    today = todayDateKey(reference);
  const facts: string[] = [],
    limitations: string[] = [],
    preferredIds: string[] = [];
  let id: string, title: string;
  const outcomes = workspace.opportunityOutcomes || [];
  const closedLeads = disqualifiedLeadIds(outcomes);
  const qualified = workspace.opportunities.filter(
    (row) => !isLeadStage(row.stage) && !closedLeads.has(row.id),
  );
  if (
    /lead qualification|sang loc lead|qualify|\bleads?\b/.test(
      q.replace(/lead time/g, "delivery time"),
    )
  ) {
    id = "lead-qualification";
    title = "Lead qualification · full scoped records";
    const queue = buildLeadQueue({
      ...workspace,
      opportunityOutcomes: outcomes,
      today,
      plannedCommitments: derivePlanCommitments({
        activities: workspace.activities,
        planItems: plan,
        includeSampleRecords: false,
      }),
    });
    facts.push(
      `All scoped leads: ${queue.total} working, ${queue.closedCount} closed. States: ${JSON.stringify(queue.counts)}. These use the same Lead queue and five evidence dimensions as Memoire, not an invented AI score.`,
    );
    const priority = ["ready", "needs-action", "going-quiet", "new", "nurture"];
    const rows = queue.rows
      .filter((row) => !row.closed)
      .sort((a, b) => {
        const rank = (state: string) => {
          const index = priority.indexOf(state);
          return index < 0 ? 3 : index;
        };
        return (
          rank(a.state) - rank(b.state) ||
          a.opportunity.id.localeCompare(b.opportunity.id)
        );
      });
    for (const row of rows.slice(0, 5)) {
      preferredIds.push(row.opportunity.id);
      facts.push(
        `${row.opportunity.accountName} · ${row.opportunity.opportunityName}: queue ${leadQueueStateLabels[row.state]}; qualification ${row.qualification.readiness}; ${row.qualification.present}/${row.qualification.total} recorded dimensions; missing ${row.qualification.missing.join(", ") || "none"}; ${brief(row.stateReason)}.`,
      );
    }
    limitations.push(
      `Up to five of ${queue.total} working leads detailed. Qualification must still use the existing Qualify flow to preserve account and Brand identity.`,
    );
  } else if (
    /collections|cong no|thu hoi no|nhac thanh toan|thu tien|receivables|overdue payment/.test(
      q,
    )
  ) {
    id = "collections-priority";
    title = "Collections · full scoped order book";
    const book = buildOrderBook({
      opportunities: qualified,
      quotes: workspace.quotes,
      linkage: "explicit-id",
      milestoneRecords: workspace.milestoneRecords || [],
      receivableRecords: workspace.receivableRecords || [],
      today,
    });
    const collections = buildReceivables({
      orders: book.orders,
      records: workspace.receivableRecords || [],
      today,
    });
    const unknown = collections.orders.filter(
      (row) => row.valueUnavailable,
    ).length;
    facts.push(
      `Full scoped explicitly linked order book: ${book.totalCount} orders; ${collections.openCount} open receivables; ${unknown} orders have unavailable value/FX. Reporting currency ${getReportingCurrency()}.`,
    );
    if (!unknown)
      facts.push(
        `Outstanding ${collections.totalOutstandingBase}; overdue ${collections.totalOverdueBase}; confirmed overdue ${collections.confirmedOverdueBase}; planned overdue ${collections.plannedOverdueBase}; expected next 30 days ${collections.expectedNext30Base}. All amounts in ${getReportingCurrency()}, calculated by Memoire's receivables engine.`,
      );
    else
      limitations.push(
        "Combined outstanding/overdue totals are withheld because value/FX is missing. Unknown is never zero or settled.",
      );
    const rows = collections.orders
      .filter((row) => !row.valueUnavailable && !row.settled)
      .sort(
        (a, b) =>
          b.overdueBase - a.overdueBase ||
          b.outstandingBase - a.outstandingBase,
      );
    for (const row of rows.slice(0, 5)) {
      preferredIds.push(row.opportunityId);
      facts.push(
        `${row.accountName} · ${row.orderName}: outstanding ${row.outstandingBase}; overdue ${row.overdueBase}; confirmed ${row.confirmedOverdueBase}; planned ${row.plannedOverdueBase}; term confidence ${row.termConfidence}; ${row.daysOverdue ?? "unknown"} days late. Currency ${getReportingCurrency()}.`,
      );
    }
    limitations.push(
      `Top five of ${rows.length} known-value open receivables shown. The order book can include planned or PO-pending commitments, not only invoiced debt. Assumed payment terms are planning assumptions, not customer-confirmed debt dates. Draft reminders only; no message or payment posting is executed.`,
    );
  } else if (
    /win.?loss|learning|rut kinh nghiem|bai hoc|ly do thua|why.*lost/.test(q)
  ) {
    id = "outcome-learning";
    title = "Recorded outcome learning · full scoped history";
    const learning = analyzePersonalSalesLearning({
      outcomes,
      opportunities: qualified,
    });
    facts.push(
      `Recorded outcome sample: ${learning.totalOutcomes}. Enough for the existing descriptive pattern rule: ${learning.hasEnoughData}. ${learning.lowDataMessage || ""}`,
    );
    for (const insight of learning.insights.slice(0, 4))
      facts.push(
        `${insight.type}: ${brief(insight.title)}. ${brief(insight.pattern)} Frequency ${insight.frequency}. Suggested verification: ${brief(insight.suggestedBehaviorChange)}`,
      );
    for (const row of [...outcomes]
      .filter(
        (row) =>
          isValidBusinessDate(row.outcomeDate) &&
          !closedLeads.has(row.opportunityId),
      )
      .sort((a, b) => b.outcomeDate.localeCompare(a.outcomeDate))
      .slice(0, 5)) {
      preferredIds.push(row.opportunityId);
      facts.push(
        `${row.outcomeDate}: ${row.accountName} · ${row.opportunityName}; recorded ${row.outcome}; reason ${row.reasonCategory}: ${brief(row.reasonText)}; lesson ${brief(row.lessonLearned)}.`,
      );
    }
    limitations.push(
      "These are recorded retrospective reasons and descriptive frequencies, not causal evidence or calibrated predictions. Missing lessons are not invented; small samples must remain explicit.",
    );
  } else if (
    /data hygiene|du lieu thieu|ra soat du lieu|missing fields/.test(q)
  ) {
    id = "data-hygiene";
    title = "Data hygiene · full scoped open opportunities";
    const open = workspace.opportunities.filter(
      (row) =>
        row.status !== "Won" &&
        row.status !== "Lost" &&
        !closedLeads.has(row.id),
    );
    const rows = open.map((row) => ({
      row,
      gaps: [
        !row.nextAction?.trim() && "next action",
        !isValidBusinessDate(row.nextActionDate) && "next-action date",
        !row.evidence?.trim() && "evidence",
        row.estimatedValue == null && "estimated value",
      ].filter(Boolean),
    }));
    const missing = rows
      .filter((item) => item.gaps.length)
      .sort(
        (a, b) =>
          b.gaps.length - a.gaps.length || a.row.id.localeCompare(b.row.id),
      );
    facts.push(
      `All ${open.length} scoped open records checked: ${missing.length} have at least one missing field; ${open.filter((row) => isValidBusinessDate(row.nextActionDate) && row.nextActionDate < today).length} have past-due next actions. Missing dates and overdue dates are separate conditions.`,
    );
    for (const { row, gaps } of missing.slice(0, 5)) {
      preferredIds.push(row.id);
      facts.push(
        `${row.accountName} · ${row.opportunityName}: missing ${gaps.join(", ")}.`,
      );
    }
    limitations.push(
      `Five highest missing-field counts shown out of ${missing.length}; this is an information count, not a commercial score. Never invent missing values or clear fields automatically.`,
    );
  } else if (
    /account brief|chuan bi.*(gap|hop)|meeting brief|customer brief/.test(q)
  ) {
    id = "account-brief";
    title = "Customer preparation · scoped relationships";
    const accounts = workspace.accounts;
    facts.push(
      `Scoped customer preparation: ${accounts.length} linked accounts, ${workspace.opportunities.length} opportunities, ${workspace.stakeholders.length} stakeholders, ${workspace.objections.filter((row) => row.status === "Open").length} open objections. Account-wide relationships are not proof of involvement in each deal.`,
    );
    for (const row of accounts.slice(0, 3))
      facts.push(
        `${row.accountName}: relationship ${row.relationshipStatus}; strategy ${brief(row.strategy)}; next follow-up ${row.nextFollowUp || "missing"}.`,
      );
    preferredIds.push(
      ...workspace.opportunities
        .filter((row) => row.status === "Active")
        .slice(0, 5)
        .map((row) => row.id),
    );
    limitations.push(
      "For a meeting brief choose the exact account or opportunity. Up to five opportunity details are retrieved; a proposed agenda is not a confirmed appointment.",
    );
  } else if (
    /deal risk|coaching|go vuong|can cuu|uu tien|priorit|rescue|downgrade/.test(
      q,
    )
  ) {
    id = "deal-coaching";
    title = "Pipeline defense · full scoped active opportunities";
    const health = buildLivePipelineHealth({
      ...workspace,
      salesAssets: workspace.assets,
      today,
    });
    facts.push(
      `Full active qualified pipeline: ${health.measuredDealCount} measured; ${health.defendableDeals} Defend, ${health.rescueDeals} Rescue, ${health.downgradeCandidates} Downgrade. Memoire's existing defense engine supplies these readings; they are not outcomes or guaranteed probabilities.`,
    );
    if (/uu tien|priorit/.test(q)) {
      const board = buildPlanBoard({
        periodType: "week",
        anchorDate: reference,
        opportunities: qualified,
        obligations: [],
        activities: workspace.activities,
        records: plan,
        today,
      });
      const due = board.days
        .flatMap((day) => day.items)
        .filter((item) => !item.done && item.date <= today);
      facts.push(
        `Current-week Plan engine: ${due.length} open items due through ${today}, including carried backlog. Only explicitly recorded visit channels are confirmed as visits.`,
      );
      for (const item of due.slice(0, 3))
        facts.push(
          `Due work ${item.date}: ${brief(item.tag)} · ${brief(item.label)}; channel ${item.channel || "not recorded"}${item.carriedFrom ? `; carried from ${item.carriedFrom}` : ""}.`,
        );
    }
    const rank = { Rescue: 0, Downgrade: 1, Monitor: 2, Defend: 3 };
    for (const row of [...health.items]
      .sort((a, b) => rank[a.decision] - rank[b.decision])
      .slice(0, 5)) {
      preferredIds.push(row.deal.sourceOpportunityId || row.deal.id);
      facts.push(
        `${row.account} · ${row.opportunity}: ${row.decision}; category ${row.category}; missing ${row.missingContext.slice(0, 3).join(", ") || "none recorded"}; objection ${brief(row.objectionDebt)}; proposed next action ${brief(row.nextAction)}.`,
      );
    }
    limitations.push(
      "Top five defense priorities shown. Decisions are analytical suggestions; no stage, evidence, probability or status is changed by this analysis.",
    );
  } else return null;
  return {
    source: {
      key: `analysis:${id}`,
      kind: "analysis",
      id,
      title,
      detail: `Calculated from all scoped records on ${today}; detailed records are bounded. Browser calculation, not independently recalculated by the server.`,
    },
    facts,
    limitations,
    preferredIds,
  };
}
