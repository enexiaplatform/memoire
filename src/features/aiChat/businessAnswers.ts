import type { SalesWorkspaceData } from "../../services/workspaceData";
import { buildPlanBoard, type PlanRecord } from "../../utils/weeklyPlan.ts";
import {
  selectQualifiedPipeline,
  disqualifiedLeadIds,
} from "../../utils/leadIdentity.ts";
import {
  buildPortfolioFacts,
  capturePortfolioMoneyBasis,
  summarizePortfolio,
} from "../../domain/portfolio/portfolioAnalytics.ts";
import {
  buildCoverage,
  quarterAmounts,
  declaredProbability,
  type ForecastQuarter,
} from "../../domain/commercialKernel/forecast.ts";
import { resolveCommercialThreads } from "../../domain/commercialKernel/deriveThreads.ts";
import { getReportingCurrency, hasExchangeRate } from "../../utils/money.ts";
import {
  isValidBusinessDate,
  todayDateKey,
  toLocalDateKey,
} from "../../utils/safeDate.ts";
import type { ChatSource } from "./types";
import { weeklyPlanDraft } from "./weeklyPlanDraft.ts";
import { workbenchAnswer } from "./workbenchAnswers.ts";

export type BusinessAnswer = {
  source: ChatSource;
  facts: string[];
  limitations: string[];
  preferredIds: string[];
};
const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d");

/** Read-only business tools. Full-scope calculations precede bounded record retrieval. */
export function businessAnswer(
  workspace: SalesWorkspaceData,
  question: string,
  plan: PlanRecord[] = [],
  reference = new Date(),
): BusinessAnswer | null {
  const specialist = workbenchAnswer(workspace, question, reference, plan);
  if (specialist) return specialist;
  const q = normalized(question),
    today = todayDateKey(reference),
    currency = getReportingCurrency();
  const outcomes = workspace.opportunityOutcomes || [];
  const closedLeadIds = disqualifiedLeadIds(outcomes);
  const opportunities = selectQualifiedPipeline(
    workspace.opportunities,
    closedLeadIds,
  );
  const facts: string[] = [],
    limitations: string[] = [],
    preferredIds: string[] = [];
  let id: string, title: string;
  if (/brand|thuong hieu|nhan hang/.test(q)) {
    id = "brand-performance";
    title = "Brand performance · full scoped workspace";
    const money = capturePortfolioMoneyBasis(
      opportunities.map((row) => row.currency),
    );
    const rows = buildPortfolioFacts({
      opportunities,
      outcomes,
      records: workspace.portfolioRecords || [],
      money,
      sample: false,
    });
    const currentStart = `${today.slice(0, 7)}-01`;
    const previousDate = new Date(
      reference.getFullYear(),
      reference.getMonth() - 1,
      1,
    );
    const previousStart = toLocalDateKey(previousDate);
    const sameDayPrevious = new Date(
      previousDate.getFullYear(),
      previousDate.getMonth(),
      Math.min(
        reference.getDate(),
        new Date(
          previousDate.getFullYear(),
          previousDate.getMonth() + 1,
          0,
        ).getDate(),
      ),
    );
    const previousEnd = toLocalDateKey(sameDayPrevious);
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.brandId || "__unassigned";
      const group = groups.get(key);
      if (group) group.push(row);
      else groups.set(key, [row]);
    }
    facts.push(
      `Computed across all ${opportunities.length} qualified opportunities in the selected workspace scope. Brand identity uses confirmed catalog assignment IDs. Reporting currency ${currency}.`,
    );
    facts.push(
      `Trend metric: recorded Won estimated deal value closed ${currentStart} through ${today}, compared with ${previousStart} through ${previousEnd} (matched month-to-date windows). This is not realized revenue or a historical pipeline snapshot.`,
    );
    const ranked = [...groups.values()]
      .map((group) => {
        const reading = summarizePortfolio(group);
        const currentRows = group.filter(
          (row) =>
            row.status === "Won" &&
            isValidBusinessDate(row.closedOn) &&
            row.closedOn >= currentStart &&
            row.closedOn <= today,
        );
        const previousRows = group.filter(
          (row) =>
            row.status === "Won" &&
            isValidBusinessDate(row.closedOn) &&
            row.closedOn >= previousStart &&
            row.closedOn <= previousEnd,
        );
        const current = summarizePortfolio(currentRows),
          previous = summarizePortfolio(previousRows);
        const delta =
          current.wonMissing ||
          previous.wonMissing ||
          current.won === null ||
          previous.won === null
            ? null
            : current.won - previous.won;
        return { group, reading, current, previous, delta };
      })
      .sort(
        (a, b) =>
          Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0) ||
          (b.reading.pipeline ?? 0) - (a.reading.pipeline ?? 0),
      );
    for (const row of ranked.slice(0, 8)) {
      const label = row.group[0].brandId
        ? row.group[0].brand
        : "Unassigned brand (unconfirmed free text is not merged)";
      facts.push(
        `${label}: active ${row.reading.activeCount}; current pipeline ${row.reading.pipeline ?? "unavailable"} ${currency}, missing values/FX ${row.reading.pipelineMissing}; Won MTD ${row.current.won ?? "unavailable"} vs previous matched MTD ${row.previous.won ?? "unavailable"} ${currency}; change ${row.delta ?? "unavailable"} ${currency}; decided deals ${row.reading.wonCount + row.reading.lostCount}; win rate ${row.reading.winRate === null ? "insufficient decided deals" : row.reading.winRate}.`,
      );
      preferredIds.push(
        ...row.group
          .filter((item) => item.status === "Won")
          .slice(0, 2)
          .map((item) => item.id),
      );
    }
    const undated = rows.filter(
      (row) => row.status === "Won" && !isValidBusinessDate(row.closedOn),
    ).length;
    limitations.push(
      `${ranked.length} brand groups calculated; at most 8 shown. ${undated} Won deals have no confirmed close date and are excluded from time trends. No stored historical pipeline snapshot was loaded, so do not claim that current pipeline increased/decreased over time.`,
    );
  } else if (/forecast|forcast|du bao|\bq[1-4]\b|quy\s*[1-4]/.test(q)) {
    const quarter =
      `Q${/(?:\bq|quy\s*)([1-4])\b/.exec(q)?.[1] || Math.floor(reference.getMonth() / 3) + 1}` as ForecastQuarter;
    const year = Number(
      /\b(20\d{2})\b/.exec(q)?.[1] || reference.getFullYear(),
    );
    id = "quarter-forecast";
    title = `${quarter} ${year} forecast · full scoped workspace`;
    const threads = resolveCommercialThreads({
      storedThreads: workspace.threads || [],
      opportunities,
      activities: workspace.activities,
      quotes: workspace.quotes,
      commitments: workspace.commitments,
      today: reference,
    });
    const coverage = buildCoverage({
      opportunities,
      threads,
      targets: [],
      outcomes,
      today: reference,
      includeSampleRecords: false,
    });
    const candidates = opportunities
      .filter((row) => row.status !== "Won" && row.status !== "Lost")
      .map((row) => ({
        row,
        amount: quarterAmounts(row, quarter, {
          today: reference,
          fiscalYear: year,
        })[quarter],
      }))
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const current = coverage.quarters.find((row) => row.quarter === quarter);
    facts.push(
      `Forecast scope: calendar fiscal year ${year}, ${quarter}, all ${opportunities.length} qualified opportunities. Quarter amounts reuse Memoire's canonical quarter allocations, explicit close periods and reporting currency ${currency}. Active forecast is estimated pipeline, not booked revenue.`,
    );
    if (year === coverage.fiscalYear && current)
      facts.push(
        `Full ${quarter} scope: ${current.opportunityCount} contributing opportunities including closed Won where dated; open pipeline ${current.openPipeline} ${currency}; declared weighted ${current.weightedDeclared} ${currency}; evidence-adjusted weighted ${current.weightedSupported} ${currency}; already Won ${current.committed} ${currency}. No target comparison is supplied because targets were not loaded.`,
      );
    else
      facts.push(
        `Open contributors to ${quarter} ${year}: ${candidates.length}. Weighted coverage and target comparison for this other year were not calculated.`,
      );
    for (const item of candidates.slice(0, 10)) {
      facts.push(
        `${item.row.accountName} · ${item.row.opportunityName}: ${quarter} allocation ${item.amount} ${currency}; declared probability ${declaredProbability(item.row)}%; stage ${item.row.stage}; next step ${item.row.nextAction || "missing"}; due ${item.row.nextActionDate || "missing"}.`,
      );
      preferredIds.push(item.row.id);
    }
    limitations.push(
      `All ${candidates.length} open contributors were considered; the 10 largest are listed. ${coverage.excludedUndatedCount} opportunities have no usable forecast timing; ${coverage.excludedCurrencyCount} have unavailable FX (counts are for the current coverage year). Missing values and undated deals cannot be treated as zero or included by guessing. Fiscal convention here is calendar quarters.`,
    );
    const missingValue = opportunities.filter(
      (row) =>
        row.status === "Active" &&
        (row.estimatedValue === null || !hasExchangeRate(row.currency)),
    ).length;
    if (missingValue)
      limitations.push(
        `${missingValue} active opportunities have missing estimated value or unavailable FX; the known-value forecast is incomplete.`,
      );
  } else if (
    /tuan|week|hom nay|today|gap|visit|meeting|follow.?up|khach hang|\bkh\b/.test(
      q,
    )
  ) {
    id = "weekly-actions";
    const nextWeek = /next week|tuan sau|tuan toi/.test(q);
    const drafting = nextWeek && !/da (?:len lich|lap)|already scheduled/.test(q) && /\b(?:chuan bi|lap|de xuat|sap xep|len (?:plan|ke hoach)|prepare|draft|suggest|build|create|plan (?:for )?next week)\b/.test(q);
    const anchor = new Date(reference);
    if (nextWeek) anchor.setDate(anchor.getDate() + 7);
    title = `${nextWeek ? "Next week" : "This week"} · full scoped Plan and follow-ups`;
    const board = buildPlanBoard({
      periodType: "week",
      anchorDate: anchor,
      opportunities: workspace.opportunities.filter(row => !closedLeadIds.has(row.id) && !["Won", "Lost"].includes(row.stage)),
      obligations: [],
      activities: workspace.activities,
      records: plan,
      today,
    });
    const items = board.days
      .flatMap((day) => day.items)
      .filter((item) => !item.done);
    facts.push(
      `Full ${nextWeek ? "next-week" : "current-week"} scope ${board.rangeStart} through ${board.rangeEnd}: ${items.length} open plan/follow-up items, including carried overdue work. Built using Memoire's existing Plan engine from the full scoped opportunity, activity and personal-plan records.`,
    );
    const listed = [...items]
      .sort(
        (a, b) =>
          Number(b.overdue) - Number(a.overdue) || a.date.localeCompare(b.date),
      )
      .slice(0, drafting ? 3 : 10);
    const visits = items.filter(
      (item) =>
        item.channel === "On-site visit" || item.channel === "Hosted visit",
    );
    facts.push(
      `Explicitly recorded in-person visit channels in this week: ${visits.length}. ${items.filter((item) => !item.channel).length} items have no recorded channel. When channel is absent, describe a task or proposed visit, never a confirmed meeting. Dates before ${board.rangeStart} are old backlog, not appointments scheduled this week.`,
    );
    for (const item of listed) {
      const taskLabel = drafting && item.label.length > 120 ? `${item.label.slice(0,120)} … [excerpt]` : item.label;
      const taskTag = drafting ? item.tag.slice(0,70) : item.tag;
      facts.push(
        `${item.date}${item.carriedFrom ? ` (originally ${item.carriedFrom}, overdue)` : ""}: ${taskTag || "No account tag"} · ${taskLabel}; channel ${item.channel || "not recorded"}; ${item.overdue ? "overdue" : "scheduled"}.`,
      );
      const linkedId =
        item.linkedOpportunityId ||
        (item.kind === "deal" ? item.id.slice("deal-".length) : "");
      if (linkedId) preferredIds.push(linkedId);
    }
    if (drafting) {
      const draft = weeklyPlanDraft(workspace, plan, reference, board.rangeStart, board.rangeEnd);
      facts.push(...draft.facts);
      preferredIds.unshift(...draft.preferredIds);
      limitations.push(...draft.limitations);
    }
    limitations.push(
      `Up to ${drafting ? 3 : 10} open items shown, from ${items.length} calculated. A follow-up is not a confirmed face-to-face visit: preserve the recorded channel; label any proposed meeting as a suggestion. Own-obligation money tasks were not loaded into this weekly tool.`,
    );
  } else {
    id = "workspace-overview";
    title = "Workspace overview · full scoped records";
    const money = capturePortfolioMoneyBasis(
      opportunities.map((row) => row.currency),
    );
    const rows = buildPortfolioFacts({
      opportunities,
      outcomes,
      records: workspace.portfolioRecords || [],
      money,
      sample: false,
    });
    const summary = summarizePortfolio(rows);
    facts.push(
      `Full scoped workspace: ${summary.count} qualified opportunities; ${summary.activeCount} active; recorded active pipeline ${summary.pipeline ?? "unavailable"} ${currency}; ${summary.pipelineMissing} active values/FX missing; ${summary.wonCount} Won, ${summary.lostCount} Lost; recorded Won estimated value ${summary.won ?? "unavailable"} ${currency}, ${summary.wonMissing} missing. Estimates are not collected cash.`,
    );
    limitations.push(
      "This overview is calculated across the full scope. Detailed snippets are a retrieved subset. A question that requires unavailable history or another metric must be answered with that limitation.",
    );
  }
  return {
    source: {
      key: `analysis:${id}`,
      kind: "analysis",
      id,
      title,
      detail: `Calculated from the full scoped browser workspace at ${today}. The server does not independently verify these aggregate snapshots.`,
    },
    facts,
    limitations,
    preferredIds,
  };
}
