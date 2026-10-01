import { loadSalesWorkspaceData } from './workspaceData.ts';
import { loadPortfolio, type PortfolioScope } from './portfolioStore.ts';
import { assertReportScope } from './reportStore.ts';
import { loadOrderMilestonesForWorkspace } from './orderMilestoneStore.ts';
import { loadOrderCostsForWorkspace } from './orderCostStore.ts';
import { loadOrderReceivablesForWorkspace } from './orderReceivableStore.ts';
import { buildPortfolioFacts, capturePortfolioMoneyBasis } from '../domain/portfolio/portfolioAnalytics.ts';
import { buildReportSources } from '../domain/reports/reportSources.ts';
import { runReport, type ReportRun } from '../domain/reports/reportEngine.ts';
import type { ReportDefinition } from '../domain/reports/reportDefinition.ts';
import { getWorkspaceSyncStatus } from './workspaceSyncStatus.ts';
import { todayDateKey } from '../utils/safeDate.ts';
export async function executeWorkspaceReport(scope: PortfolioScope, definition: ReportDefinition, scopeKey: string): Promise<ReportRun> {
  assertReportScope(scope);
  const [workspace, catalog, milestones, costs, receivables] = await Promise.all([
    loadSalesWorkspaceData(scope.userId, { force: true }), loadPortfolio(scope),
    definition.dataset === 'collections' ? loadOrderMilestonesForWorkspace(scope.userId, scope.sampleDataActive) : Promise.resolve([]),
    definition.dataset === 'collections' ? loadOrderCostsForWorkspace(scope.userId, scope.sampleDataActive) : Promise.resolve([]),
    definition.dataset === 'collections' ? loadOrderReceivablesForWorkspace(scope.userId, scope.sampleDataActive) : Promise.resolve([]),
  ]);
  assertReportScope(scope);
  const money = capturePortfolioMoneyBasis([...workspace.opportunities.map(row => row.currency), ...workspace.quotes.map(row => row.currency),
    ...receivables.flatMap(record => record.receipts.map(receipt => receipt.currency))]);
  const facts = buildPortfolioFacts({ opportunities: workspace.opportunities, outcomes: workspace.opportunityOutcomes, records: catalog.records, money, sample: scope.sampleDataActive });
  const today = todayDateKey(), sources = buildReportSources({ facts, opportunities: workspace.opportunities, quotes: workspace.quotes,
    outcomes: workspace.opportunityOutcomes, milestones, costs, receivables, money, today, sample: scope.sampleDataActive });
  const status = getWorkspaceSyncStatus();
  const sourceStatus = scope.sampleDataActive ? 'Demo sources; no live cloud data.' : !scope.userId ? 'Browser workspace sources.'
    : `Current workspace view. ${catalog.message} ${status.state === 'error' ? status.message : 'Source loaders may use browser copies; cloud/accounting completeness is not certified.'}`;
  return runReport({ definition, sources, money, scopeKey, runAt: new Date().toISOString(), today,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, sourceStatus });
}
