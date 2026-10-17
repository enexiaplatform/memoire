import type { SalesWorkspaceData } from "../../services/workspaceData";
import { buildOrderBook } from "../../utils/orderToCash.ts";
import { buildReceivables } from "../../utils/receivables.ts";
import {
  getReportingCurrency,
  EXCHANGE_RATES_AS_OF,
} from "../../utils/money.ts";
import { todayDateKey } from "../../utils/safeDate.ts";
import { isLeadStage } from "../../utils/leadIdentity.ts";
import type {
  ChatContext,
  ChatScope,
  ChatSource,
  ChatSourceKind,
} from "./types";
import { businessAnswer } from "./businessAnswers.ts";
import type { PlanRecord } from "../../utils/weeklyPlan";

const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d");
const text = (value: unknown, length = 550) =>
  typeof value === "string" ? value.trim().slice(0, length) : "";

/** A previewable, bounded snapshot. Full notes, contact details and attachments are never included. */
export function buildChatContext(
  workspace: SalesWorkspaceData,
  userId: string,
  scope: ChatScope,
  question: string,
  planRecords: PlanRecord[] = [],
): ChatContext {
  const real = <
    T extends {
      userId?: string | null;
      source?: string;
      isSample?: boolean;
      __deleted?: boolean;
    },
  >(
    rows: T[],
  ) =>
    rows.filter(
      (row) =>
        !row.isSample &&
        row.source !== "demo" &&
        !row.__deleted &&
        (!row.userId || row.userId === userId),
    );
  const allAccounts = real(workspace.accounts);
  const allDeals = real(workspace.opportunities);
  const account =
    scope.kind === "account"
      ? allAccounts.find((row) => row.id === scope.id)
      : undefined;
  const opportunity =
    scope.kind === "opportunity"
      ? allDeals.find((row) => row.id === scope.id)
      : undefined;
  if (scope.kind !== "all" && !account && !opportunity)
    throw new Error("Choose a current account or opportunity before chatting.");
  const deals = allDeals.filter(
    (row) =>
      scope.kind === "all" ||
      (scope.kind === "opportunity" && row.id === opportunity?.id) ||
      (scope.kind === "account" && row.accountId === account?.id),
  );
  const scopeIds = new Set(deals.map((row) => row.id));
  const safeWorkspace: SalesWorkspaceData = {
    ...workspace,
    opportunities: deals,
    accounts: allAccounts,
    activities: real(workspace.activities).filter(
      (row) => scope.kind === "all" || scopeIds.has(row.linkedOpportunityId),
    ),
    commitments: real(workspace.commitments).filter(
      (row) =>
        scope.kind === "all" ||
        scopeIds.has(row.opportunityId || "") ||
        (scope.kind === "account" && row.accountId === account?.id),
    ),
    quotes: real(workspace.quotes).filter(
      (row) => scope.kind === "all" || scopeIds.has(row.opportunityId || ""),
    ),
    threads: real(workspace.threads || []),
    opportunityOutcomes: real(workspace.opportunityOutcomes || []),
    portfolioRecords: real(workspace.portfolioRecords || []),
  };
  const scopedPlan = real(planRecords).filter(
    (row) =>
      scope.kind === "all" ||
      scopeIds.has(row.linkedOpportunityId || "") ||
      (scope.kind === "account" &&
        row.linkedAccountName === account?.accountName),
  );
  let business: ReturnType<typeof businessAnswer> = null;
  let businessError = "";
  try {
    business = businessAnswer(safeWorkspace, question, scopedPlan);
  } catch {
    businessError =
      "The requested full-scope business calculation could not be completed consistently. Do not infer totals or trends; inspect Plan, Money or Reports.";
  }
  const preferred = new Set(business?.preferredIds || []);
  const editing =
    /\b(update|change|reschedule|cap nhat|sua|doi|doi lich|tao|them|create|add|fill)\b/.test(
      normalized(question),
    );
  const tokens = [
    ...new Set(
      normalized(question)
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2),
    ),
  ].slice(0, 24);
  const score = (value: string) => {
    const haystack = normalized(value);
    return tokens.reduce(
      (sum, word) => sum + (haystack.includes(word) ? 1 : 0),
      0,
    );
  };
  const chosenDeals = deals
    // Period analyses must not pull unrelated historical deals back into the answer.
    .filter(
      (row) =>
        editing ||
        !business ||
        business.source.id === "workspace-overview" ||
        preferred.has(row.id),
    )
    .map((row) => ({
      row,
      relevance: score(
        `${row.accountName} ${row.opportunityName} ${row.nextAction} ${row.evidence}`,
      ),
    }))
    .sort(
      (a, b) =>
        (editing
          ? 0
          : Number(preferred.has(b.row.id)) -
            Number(preferred.has(a.row.id))) ||
        b.relevance - a.relevance ||
        (a.row.nextActionDate || "9999").localeCompare(
          b.row.nextActionDate || "9999",
        ) ||
        (b.row.updatedAt || "").localeCompare(a.row.updatedAt || ""),
    )
    .slice(0, 5)
    .map((item) => item.row);
  const dealIds = new Set(chosenDeals.map((row) => row.id));
  const accountIds = new Set(
    chosenDeals.map((row) => row.accountId).filter(Boolean),
  );
  if (account) accountIds.add(account.id);
  const sources: ChatSource[] = [];
  const add = (
    kind: ChatSourceKind,
    id: string,
    title: string,
    detail: string,
  ) => {
    if (!id || sources.length >= 23) return;
    sources.push({
      key: `${kind}:${id}`,
      kind,
      id,
      title: text(title, 150),
      detail: text(detail, 1000),
    });
  };
  for (const row of allAccounts
    .filter((row) => accountIds.has(row.id))
    .slice(0, 3)) {
    add(
      "account",
      row.id,
      row.accountName,
      `Relationship: ${row.relationshipStatus}. Industry: ${row.industry}. Strategy: ${text(row.strategy)}. Next follow-up: ${text(row.nextFollowUp)}.`,
    );
  }
  for (const row of chosenDeals) {
    add(
      "opportunity",
      row.id,
      `${row.accountName} · ${row.opportunityName}`,
      `Stage: ${row.stage}. Status: ${row.status}. Recorded estimate: ${row.estimatedValue ?? "unknown"} ${row.currency || "unknown currency"}. Next action: ${text(row.nextAction)}; due: ${row.nextActionDate || "unknown"}. Evidence: ${text(row.evidence)}. Missing context: ${text(row.missingContext)}. Objections: ${text(row.objectionDebt)}.`,
    );
  }
  const activities = real(workspace.activities).filter(
    (row) =>
      dealIds.has(row.linkedOpportunityId) ||
      (scope.kind === "account" &&
        row.linkedAccountName === account?.accountName),
  );
  for (const row of [...activities]
    .sort((a, b) => (b.activityDate || "").localeCompare(a.activityDate || ""))
    .slice(0, 4)) {
    add(
      "activity",
      row.id,
      `${row.activityDate} · ${row.activityType}`,
      `Summary: ${text(row.summary)}. Next action: ${text(row.nextAction)}. Due: ${row.dueDate || "unknown"}.`,
    );
  }
  const commitments = real(workspace.commitments).filter(
    (row) =>
      dealIds.has(row.opportunityId || "") || accountIds.has(row.accountId),
  );
  for (const row of [...commitments]
    .sort((a, b) =>
      (a.currentDueDate || "9999").localeCompare(b.currentDueDate || "9999"),
    )
    .slice(0, 3)) {
    add(
      "commitment",
      row.id,
      row.commitmentText,
      `Party: ${row.commitmentParty}. Status: ${row.status}. Due: ${row.currentDueDate || "unknown"}. Account: ${row.accountName}.`,
    );
  }
  const quotes = real(workspace.quotes).filter((row) =>
    dealIds.has(row.opportunityId || ""),
  );
  // The money engines need every linked quote/collection/milestone for these deals.
  // Refuse a partial money calculation when the evidence budget cannot contain them.
  const receivables = real(workspace.receivableRecords || []).filter((row) =>
    dealIds.has(row.opportunityId),
  );
  const milestones = real(workspace.milestoneRecords || []).filter((row) =>
    dealIds.has(row.opportunityId),
  );
  const moneySourcesFit =
    sources.length + quotes.length + receivables.length + milestones.length <=
    23;
  const facts: string[] = [
    `Selected ${chosenDeals.length} of ${deals.length} opportunities in this scope. This is a retrieved subset, never a complete pipeline total.`,
    `Local business date: ${todayDateKey()}. Use this date for relative scheduling.`,
  ];
  const limitations = [
    "Only the displayed context and recent conversation are sent. Unselected records and earlier periods are not available.",
    "Sources are browser snapshots; server checks source ownership, not the freshness of every displayed field. Unsynced or changed records may differ.",
  ];
  for (const row of allAccounts
    .filter((row) => accountIds.has(row.id))
    .slice(0, 3)) {
    facts.push(
      `Account ${row.accountName} has ${deals.filter((deal) => deal.accountId === row.id).length} opportunities in this scope; only selected details are shown. An account name alone does not uniquely identify a deal when this count exceeds one.`,
    );
  }
  if (business) {
    sources.push(business.source);
    facts.push(...business.facts);
    limitations.push(...business.limitations);
  }
  if (businessError) limitations.push(businessError);
  if (
    scope.kind === "account" &&
    allDeals.some(
      (row) => !row.accountId && row.accountName === account?.accountName,
    )
  )
    limitations.push(
      "Opportunities without a confirmed account ID are excluded from this account scope.",
    );
  if (moneySourcesFit) {
    for (const row of quotes)
      add(
        "quote",
        row.id,
        row.title || "Quote",
        `Status: ${row.status}. Amount: ${row.amount ?? "unknown"} ${row.currency || "unknown currency"}.`,
      );
    for (const row of receivables)
      add(
        "receivable",
        row.id,
        "Recorded collections",
        `Opportunity: ${row.opportunityId}. Recorded receipts and payment schedule support the calculated facts below.`,
      );
    for (const row of milestones)
      add(
        "milestone",
        row.id,
        "Order milestones",
        `Opportunity: ${row.opportunityId}. Recorded delivery milestones support the calculated facts below.`,
      );
    try {
      const book = buildOrderBook({
        opportunities: chosenDeals,
        quotes,
        linkage: "explicit-id",
        milestoneRecords: milestones,
        receivableRecords: receivables,
        today: todayDateKey(),
      });
      const collections = buildReceivables({
        orders: book.orders,
        records: receivables,
        today: todayDateKey(),
      });
      const currency = getReportingCurrency();
      facts.push(
        `Calculated on this device using Memoire's existing order and receivables engines. Reporting currency: ${currency}. Planning FX rates dated ${EXCHANGE_RATES_AS_OF}, with this workspace's overrides; these are not live market rates.`,
      );
      const unavailable = collections.orders.filter(
        (row) => row.valueUnavailable,
      );
      if (!unavailable.length)
        facts.push(
          `Selected-subset orders: ${book.totalCount}. Selected-subset outstanding: ${collections.totalOutstandingBase} ${currency}; overdue: ${collections.totalOverdueBase} ${currency}. These figures cover only the selected sources.`,
        );
      else
        limitations.push(
          `${unavailable.length} selected order(s) have missing money or FX. No combined outstanding or overdue total is provided; missing money is not zero.`,
        );
      for (const row of collections.orders.filter(
        (row) => !row.valueUnavailable,
      ))
        facts.push(
          `${row.orderName}: outstanding ${row.outstandingBase} ${currency}; overdue ${row.overdueBase} ${currency}; term confidence ${row.termConfidence}.`,
        );
    } catch {
      limitations.push(
        "Money could not be calculated consistently for these sources. Open Money to inspect the missing or conflicting records; do not infer a total.",
      );
    }
  } else
    limitations.push(
      "Linked money evidence exceeds the context budget. No order or collection totals were calculated. Narrow to one opportunity.",
    );
  const qualified = chosenDeals.filter((row) => !isLeadStage(row.stage));
  facts.push(
    `Selected qualified opportunities: ${qualified.length}; selected leads: ${chosenDeals.length - qualified.length}. Estimated deal values are not realized revenue.`,
  );
  return {
    asOf: new Date().toISOString(),
    scope:
      account?.accountName ||
      opportunity?.opportunityName ||
      "All workspace · calculated summaries and relevant records",
    sources,
    facts,
    limitations,
  };
}
