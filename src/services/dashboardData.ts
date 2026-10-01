import { loadSavedReports } from './reportStore.ts';
import { captureWorkspaceReportContext } from './reportData.ts';
import { assertDashboardScope } from './dashboardStore.ts';
import type { PortfolioScope } from './portfolioStore.ts';
import { parseDashboardDefinition, type DashboardDefinition } from '../domain/dashboards/dashboardDefinition.ts';
import { runDashboard } from '../domain/dashboards/dashboardEngine.ts';
export async function executeWorkspaceDashboard(scope: PortfolioScope, definition: DashboardDefinition, scopeKey: string) {
  assertDashboardScope(scope);
  const parsed = parseDashboardDefinition(definition), library = await loadSavedReports(scope);
  assertDashboardScope(scope);
  const collections = library.records.some(report => !report.archived && report.definition.dataset === 'collections' && parsed.widgets.some(widget => widget.reportId === report.id));
  const context = await captureWorkspaceReportContext(scope, collections, scopeKey);
  assertDashboardScope(scope);
  return runDashboard(parsed, library.records, context);
}
