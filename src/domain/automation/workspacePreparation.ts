import type { AutomationSettings } from '../../../shared/automation.js';
import { rowToOpportunity } from '../../services/opportunityStore.ts';
import { rowToRecord } from '../../services/salesActivityStore.ts';
import { buildOrderBook } from '../../utils/orderToCash.ts';
import { buildReceivables } from '../../utils/receivables.ts';
import { buildOrderMargins } from '../../utils/orderMargin.ts';
import { activitiesForOpportunityStrict } from '../../utils/activityIndex.ts';
import { classifyNurture, FIRST_TOUCH_LATE_DAYS } from '../../utils/leadQueue.ts';
import { findClosablePlanItems } from '../../utils/capturePlanReconciliation.ts';
import { EXCHANGE_RATES_AS_OF, EXCHANGE_RATES_TO_VND } from '../../utils/money.ts';
import { explicitMoneyContext } from '../../utils/moneyContext.ts';
import { buildPortfolioFacts } from '../portfolio/portfolioAnalytics.ts';
import { buildReportSources } from '../reports/reportSources.ts';
import { parseSavedReport } from '../reports/reportRecord.ts';
import { runReport } from '../reports/reportEngine.ts';
import { parseSavedDashboard } from '../dashboards/dashboardRecord.ts';
import { runDashboard } from '../dashboards/dashboardEngine.ts';
import { sanitizeBusinessDate } from '../../utils/safeDate.ts';
import type { AutomationCandidate, AutomationSnapshot } from './automationEngine.ts';

type Row = Record<string, any>;
export type PreparedOutput = { key: string; kind: string; title: string; period: string; href: string; payload: Row };
export const PREPARATION_SOURCES = {
  supplierCommitments: 'supplier_commitments', receivables: 'order_receivables', milestones: 'order_milestones',
  costs: 'order_costs', outcomes: 'opportunity_outcomes', accounts: 'accounts', stakeholders: 'stakeholders',
  objections: 'objections', portfolio: 'portfolio_records', reports: 'report_definitions', dashboards: 'dashboard_definitions',
  weeklyCommitments: 'weekly_commitments', reviewPacks: 'review_packs', knowledge: 'knowledge_notes', assets: 'sales_assets',
  importBatches: 'import_batches', importRows: 'import_row_results', profiles: 'user_profiles', threads: 'commercial_threads',
  captures: 'captures',
} as const;
export const realAutomationRow = (row: Row) => row.isSample !== true && row.is_sample !== true
  && row.source !== 'demo' && row.source_type !== 'demo' && row.__deleted !== true;
export const automationPayloads = (rows: Row[]) => rows.map(row => ({ ...row.payload, id: row.id })).filter(realAutomationRow);
const text = (v: unknown) => typeof v === 'string' ? v.trim() : '';
export const shiftAutomationDate = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dateOf = (value: unknown) => sanitizeBusinessDate(typeof value === 'string' ? value.slice(0, 10) : '') || '';
const link = (path: string, id: string) => `${path}${encodeURIComponent(id)}`;
export function automationWeek(today: string) {
  return shiftAutomationDate(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
}

/** All preparation reads one confirmed cloud snapshot. No source writer is imported. */
export function prepareWorkspaceAutomation(snapshot: AutomationSnapshot, settings: AutomationSettings, today: string, capturedAt = `${today}T00:00:00Z`) {
  const required = settings.collectionReminder || settings.supplierReminder || settings.leadFollowup || settings.orderReminder
    || settings.opportunityReminder || settings.weeklyReview || settings.preparedOutputs || settings.savedReports || settings.savedDashboards;
  const candidates: AutomationCandidate[] = [], outputs: PreparedOutput[] = [], missingMoney: {sourceId:string; href:string; label:string}[] = [], retirementProtectedSources: string[] = [];
  const result = () => ({ candidates, outputs, retirementProtectedSources, warnings:{missingMoneyCount:missingMoney.length,missingMoney:missingMoney.slice(0,100)} });
  if (!required) return result();
  for (const key of Object.keys(PREPARATION_SOURCES)) {
    if (!Array.isArray(snapshot[key]) || snapshot[key].length > 5000) throw new Error(`snapshot_incomplete:${key}`);
  }
  const raw = (key: string) => snapshot[key].filter(realAutomationRow);
  const json = (key: string) => automationPayloads(snapshot[key]);
  const localDate = (value: unknown) => {
    if (!value || typeof value !== 'string') return '';
    if (sanitizeBusinessDate(value)) return value;
    if (!Number.isFinite(Date.parse(value))) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone:settings.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
    const part = (type: string) => parts.find(item => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  const opportunities = raw('opportunities').map(row => { const value = rowToOpportunity(row as never);
    return {...value, createdAt:localDate(value.createdAt), updatedAt:localDate(value.updatedAt)}; });
  const activities = raw('activities').map(row => rowToRecord(row as never));
  const byId = new Map(opportunities.map(row => [row.id, row]));
  const quotes = json('quotes').map(row => ({...row,createdAt:localDate(row.createdAt)})), records = json('receivables'), costs = json('costs'),
    milestones = json('milestones').map(row => ({...row,doneAt:localDate(row.doneAt)})), outcomes = json('outcomes');
  const profile = raw('profiles')[0];
  const basis = { currency: text(profile?.reporting_currency) || 'VND', ratesToVnd: { ...EXCHANGE_RATES_TO_VND }, ratesAsOf: EXCHANGE_RATES_AS_OF };
  const money = () => explicitMoneyContext(basis);
  let cachedOrders: ReturnType<typeof buildOrderBook> | undefined;
  const orders = () => {
    for (const rows of [records, costs]) if (new Set(rows.map(row => row.opportunityId)).size !== rows.length) throw new Error('Duplicate order-linked source; resolve before preparation.');
    return cachedOrders ||= buildOrderBook({ opportunities, quotes: quotes as never, linkage: 'explicit-id',
      milestoneRecords: milestones as never, costRecords: costs as never, outcomes: outcomes as never,
      receivableRecords: records as never, today, money: money() });
  };
  const add = (rule: AutomationCandidate['rule'], sourceId: string, suffix: string, due: string, label: string, opportunityId = '', accountName = '', reason = '') => {
    candidates.push({ key: `${rule}:${sourceId}:${suffix}`, rule, sourceId, dueDate: due, date: today,
      label: label.slice(0, 450), accountName, opportunityId, reason });
  };
  if (settings.supplierReminder) for (const row of json('supplierCommitments')) {
    const due = dateOf(row.dueDate);
    if (row.status !== 'open' || !due || due > shiftAutomationDate(today, settings.supplierLeadDays) || !text(row.label)) continue;
    add('supplier-reminder', row.id, due, due, `${row.party === 'self' ? 'Keep supplier promise' : 'Check supplier promise'}: ${row.label}`,
      text(row.linkedOpportunityId), text(row.brand), `${row.kind}; ${row.party}; recorded due ${due}. No payment or completion recorded.`);
  }
  if (settings.leadFollowup) for (const row of opportunities) {
    if (row.stage !== 'Lead' || row.status !== 'Active') continue;
    const nurture = classifyNurture(row, today), created = dateOf(row.createdAt);
    if (nurture.nurturing) {
      if (nurture.due) add('lead-followup', row.id, `nurture:${nurture.revisitDate}`, nurture.revisitDate,
        `Revisit lead: ${row.opportunityName}`, row.id, row.accountName, `Recorded nurture revisit ${nurture.revisitDate}; ${nurture.reason}`);
    } else if (created && shiftAutomationDate(created, FIRST_TOUCH_LATE_DAYS) <= today
      && !activitiesForOpportunityStrict(row, activities).length) {
      add('lead-followup', row.id, 'first-touch', shiftAutomationDate(created, FIRST_TOUCH_LATE_DAYS),
        `Prepare first touch: ${row.opportunityName}`, row.id, row.accountName, `No confirmed linked touch; lead recorded ${created}. Check activity links before contacting.`);
    }
  }
  if (settings.collectionReminder) for (const row of buildReceivables({ orders: orders().orders, records: records as never, today, money: money() }).orders) {
    if (row.valueUnavailable) {
      missingMoney.push({sourceId:row.opportunityId,href:link('/app/opportunities?opportunityId=',row.opportunityId),label:`${row.orderRef}: amount or receipt FX unavailable; existing work kept.`});
      retirementProtectedSources.push(`collection-reminder:${row.opportunityId}`);
      continue;
    }
    for (const part of row.installments) {
      if (part.settled || !part.dueDate || part.dueDate > shiftAutomationDate(today, settings.collectionLeadDays)) continue;
      add('collection-reminder', row.opportunityId, `${part.id}:${part.dueDate}`, part.dueDate, `Review collection: ${row.orderRef} · ${part.label}`,
        row.opportunityId, row.accountName, `${part.outstandingBase} ${basis.currency} outstanding; ${part.dateBasis} date ${part.dueDate}; planning FX as of ${basis.ratesAsOf}. Verify bank receipt before recording payment.`);
      candidates[candidates.length - 1].subjectKey = `collection-reminder:${row.opportunityId}:${part.id}`;
    }
  }
  if (settings.orderReminder) for (const row of orders().orders) {
    if (row.fullyCollected || !row.nextMilestone || !(row.overdue || row.stalled)) continue;
    // Collections owns a payment task when enabled; do not chase the same money twice.
    if (settings.collectionReminder && ['paid', 'deposit'].includes(row.nextMilestone.key)) continue;
    add('order-reminder', row.opportunityId, `${row.nextMilestone.key}:${row.nextDueDate || 'undated'}`, row.nextDueDate || today,
      `Review order: ${row.orderRef} · ${row.nextMilestone.label}`, row.opportunityId, row.accountName,
      row.stalled ? `No dated next milestone; ${row.daysInStage} days since recorded movement. Confirm the date.` : `Recorded milestone overdue. Open source evidence before updating it.`);
  }
  if (settings.opportunityReminder) for (const row of opportunities) {
    if (row.status !== 'Active' || ['Lead', 'Won', 'Lost'].includes(row.stage) || text(row.nextAction) && dateOf(row.nextActionDate)) continue;
    add('opportunity-reminder', row.id, 'next-action', today, `Set next action: ${row.opportunityName}`, row.id, row.accountName,
      'Active qualified opportunity has no complete dated next action. Choose and record the next move.');
  }
  const make = (kind: string, title: string, href: string, period: string, build: () => Row) => {
    let payload: Row;
    try { payload = { status: 'ready', ...build() }; }
    catch (error) { payload = { status: 'unavailable', error: error instanceof Error ? error.message : 'Source unavailable. No partial result.' }; }
    outputs.push({ key: `${kind}:${period}`, kind, title, href, period,
      payload: { ...payload, asOfDate: today, basis: 'confirmed-cloud-records', money: basis,
        limitations: ['Planning rates; browser-only FX overrides are excluded.', 'Unsynced browser records and email are excluded.', 'Draft preparation requires your review.'] } });
  };
  const items = (rows: Row[], path: string | ((row: Row) => string), label: (row: Row) => string) => ({ count: rows.length,
    items: rows.slice(0, 100).map(row => ({ sourceId: row.id, label: label(row), href: typeof path === 'function' ? path(row) : link(path, row.id) })), truncated: rows.length > 100 });
  const plans = json('plans').filter(row => !row.done && !row.dismissed);
  if (settings.weeklyReview) make('weekly-review', 'Weekly Review draft', '/app/reviews', automationWeek(today), () => ({
    weekStart: automationWeek(today), weekEnd: shiftAutomationDate(automationWeek(today), 6),
    openPlan: items(plans, row => link('/app/timeline?date=', dateOf(row.date) || today), row => `${row.date || 'Undated'} · ${row.label}`),
    openPromises: items(raw('commitments').filter(row => row.status === 'open'), row => link('/app/accounts?accountName=', text(row.account_name)), row => `${row.commitment_text} · ${row.current_due_date || 'Undated'}`),
    recordedChanges: items(raw('activities').filter(row => dateOf(row.activity_date) >= automationWeek(today) && dateOf(row.activity_date) <= today),
      row => link('/app/capture?date=', dateOf(row.activity_date) || today), row => `${row.activity_date} · ${row.summary || row.raw_note || 'Recorded touch'}`),
    reflections: 'Add your own learning, decisions and next-week commitments after checking the sources.',
  }));
  if (settings.preparedOutputs) {
    make('capture-review', 'Capture review queue', '/app/capture', today, () => {
      const review = activities.filter(row => !row.linkedOpportunityId);
      const reconciliation = activities.filter(row => row.activityDate >= shiftAutomationDate(today, -7)).flatMap(activity =>
        findClosablePlanItems({ activity, opportunities, records: json('plans') as never, today }).map(match => ({
          activityId: activity.id, planId: match.item.id, label: match.item.label, reason: match.reason,
          href: link('/app/capture?date=', activity.activityDate || today), requiresConfirmation: true })));
      return { ...items(review, row => link('/app/capture?date=', dateOf(row.activityDate) || today), row => row.summary || row.rawNote || row.id),
        pendingIntake: items(raw('captures').filter(row => row.status !== 'processed'), row => link('/app/capture?date=', dateOf(row.captured_at) || today), row => text(row.raw_text).slice(0, 300)),
        reconciliation: reconciliation.slice(0, 100), reconciliationCount: reconciliation.length };
    });
    make('plan-review', 'Plan preparation', '/app/timeline', automationWeek(today), () => ({ ...items(plans.filter(row => !dateOf(row.date) || row.date < today),
      row => link('/app/timeline?date=', dateOf(row.date) || today), row => `${row.date || 'Undated'} · ${row.label}`), action: 'Review overdue and undated work; no dates or completion marks were changed.' }));
    make('account-briefs', 'Account and stakeholder briefs', '/app/accounts', today, () => ({
      ...items(raw('accounts'), '/app/accounts?accountId=', row => row.account_name || row.name || row.id),
      briefs: raw('accounts').slice(0, 100).map(row => ({ sourceId: row.id, account: row.account_name || row.name,
        opportunityIds: opportunities.filter(item => item.accountId === row.id).map(item => item.id),
        stakeholderIds: raw('stakeholders').filter(item => item.account_id === row.id).map(item => item.id),
        openPromiseIds: raw('commitments').filter(item => item.status === 'open' && opportunities.some(opportunity => opportunity.accountId === row.id && opportunity.id === item.opportunity_id)).map(item => item.id),
        missing: raw('stakeholders').some(item => item.account_id === row.id) ? [] : ['No ID-linked stakeholder recorded; verify contacts and buying roles.'] })),
    }));
    make('margin-review', 'Margin exceptions', '/app/revenue?view=margin', today, () => {
      const result = buildOrderMargins({ orders: orders().orders, costRecords: costs as never, targetPct: profile?.target_margin_pct ?? 20, money: money() });
      return { targetPct: result.targetPct, ...items([...result.byOrder.values()].filter(row => !row.hasCost || row.costUnavailable || row.marginPct === null || !row.meetsTarget)
        .map(row => ({ ...row, id: row.opportunityId })), '/app/opportunities?opportunityId=', row => {
          const order = orders().orders.find(item => item.opportunityId === row.id);
          return `${order?.orderRef || row.id} · ${!row.hasCost ? 'Cost missing' : row.costUnavailable ? 'FX missing' : row.marginPct === null ? 'Margin unavailable' : `${row.marginPct}% vs ${result.targetPct}% target`}`;
        }), missingOrderValueIds: orders().orders.filter(row => row.amount === null || !money().hasRate(row.currency)).map(row => row.opportunityId) };
    });
    make('portfolio-review', 'Catalog classification review', '/app/products', today, () => {
      const facts = buildPortfolioFacts({ opportunities, outcomes: outcomes as never, records: json('portfolio') as never, money: basis, sample: false });
      return { ...items(facts.filter(row => !row.mapped), '/app/opportunities?opportunityId=', row => `${row.opportunity} · original Brand: ${row.originalBrand || 'Missing'}`),
        action: 'Choose a catalog identity or explicit Others. Original text is preserved; no fuzzy merge or classification was applied.' };
    });
    make('knowledge-review', 'Objections and reusable knowledge', '/app/objections', today, () => ({
      ...items(raw('objections').filter(row => !['resolved', 'Resolved', 'closed', 'Closed'].includes(row.status)), row => link('/app/objections?accountName=', text(row.account_name)), row => row.objection_text || row.title || row.objection || row.id),
      knowledgeCount: json('knowledge').length, assetCount: json('assets').length,
      knowledge: items(json('knowledge'), row => link('/app/vault?q=', text(row.title)), row => row.title || row.label || row.id),
      assets: items(json('assets'), row => link('/app/vault?q=', text(row.title)), row => `${row.assetType || 'Asset'} · ${row.title || row.id}`),
      reuseCandidates: raw('objections').filter(row => ['Open', 'Addressed'].includes(row.status)).flatMap(objection =>
        json('assets').filter(asset => asset.relatedObjectionType && asset.relatedObjectionType === objection.objection_type
          || asset.relatedOpportunityId && asset.relatedOpportunityId === objection.opportunity_id).map(asset => ({
          sourceId: objection.id, assetId: asset.id, label: `${objection.objection_text} → ${asset.title}`,
          href: link('/app/vault?q=', text(asset.title)), reason: 'Exact recorded objection type or opportunity ID. Review relevance before reuse.' }))).slice(0, 100),
      action: 'Review unresolved objections against recorded notes/assets. Reuse and resolution require your confirmation; no causal success is inferred.' }));
    make('data-quality', 'Import and record quality', '/app/settings?tab=data', today, () => ({
      importExceptions: items(raw('importRows').filter(row => ['warning', 'error'].includes(row.action)), '/app/settings?importRow=', row => `${row.target_table} · ${row.error_code || (row.warning_codes || []).join(', ')}`),
      incompleteImports: items(raw('importBatches').filter(row => ['running', 'failed'].includes(row.status)), '/app/settings?importBatch=', row => `${row.status} · ${row.scope}`),
      missingValues: opportunities.filter(row => row.estimatedValue === null || !money().hasRate(row.currency)).map(row => ({ sourceId: row.id, href: link('/app/opportunities?opportunityId=', row.id), label: `${row.opportunityName}: amount or FX unavailable` })),
      action: 'Resolve source errors and verify exact identities before import. No records were merged or accepted.' }));
    make('cloud-health', 'Cloud and recovery preparation', '/app/settings?tab=data', today, () => ({
      sourceCounts: Object.fromEntries(Object.keys(PREPARATION_SOURCES).map(key => [key, snapshot[key].length])),
      latestCloudActivity: raw('activities').map(row => row.updated_at || row.created_at || '').sort().pop() || null,
      action: 'Export a workspace backup before recovery. Check device sync and recovery notices in Settings; this server cannot inspect pending device writes or local backup files.',
      deviceSyncVerified: false, backupVerified: false, restorePerformed: false,
    }));
  }
  if (settings.savedReports || settings.savedDashboards) {
    // Definition versions, source IDs and money basis travel with each saved result.
    let context: Parameters<typeof runDashboard>[2] | undefined;
    const reportContext = () => {
      if (!context) {
        const facts = buildPortfolioFacts({ opportunities, outcomes: outcomes as never, records: json('portfolio') as never, money: basis, sample: false });
        context = { sources: buildReportSources({ facts, opportunities, quotes: quotes as never, outcomes: outcomes as never, milestones: milestones as never,
          costs: costs as never, receivables: records as never, sample: false, today, money: basis }), money: basis, scopeKey: 'confirmed-cloud',
          runAt: capturedAt, today, timezone: settings.timezone, sourceStatus: 'Confirmed cloud records; planning FX; excludes browser-only changes.' };
      }
      return context;
    };
    if (settings.savedReports) for (const row of json('reports').filter(row => !row.archived)) make('saved-report', `Report · ${row.definition?.name || row.id}`,
      link('/app/reports?report=', row.id), `${today}:${row.id}`, () => {
        const report = parseSavedReport(row);
        return { definitionId: report.id, definitionVersion: report.version, result: runReport({ ...reportContext(), definition: report.definition }) };
      });
    if (settings.savedDashboards) for (const row of json('dashboards').filter(row => !row.archived)) make('saved-dashboard', `Dashboard · ${row.definition?.name || row.id}`,
      link('/app/dashboards?dashboard=', row.id), `${today}:${row.id}`, () => {
        const dashboard = parseSavedDashboard(row);
        return { definitionId: dashboard.id, definitionVersion: dashboard.version, result: runDashboard(dashboard.definition, json('reports') as never, reportContext()) };
      });
  }
  if (outputs.length > 100 || JSON.stringify(outputs).length > 2000000) throw new Error('prepared_outputs_too_large');
  // Keep source references out of labels only when the original source is genuinely missing.
  for (const candidate of candidates) if (candidate.opportunityId && !byId.has(candidate.opportunityId)) candidate.opportunityId = '';
  return result();
}
