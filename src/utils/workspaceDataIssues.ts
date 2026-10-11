import type { SalesWorkspaceData } from '../services/workspaceData.ts';
import { checkOpportunityIntegrity, checkQuoteIntegrity, describeIntegrity } from './recordIntegrity.ts';
import { buildAccountAliasIndex } from './accountAliases.ts';
import { isLeadRecord } from './leadIdentity.ts';
import { portfolioAssignments } from '../domain/portfolio/portfolioCatalog.ts';
export type WorkspaceDataIssue = { id: string; record: string; reason: string; href: string };
/** Resolve issues against the current owner-scoped source collection. No writes. */
export function workspaceDataIssues(workspace: SalesWorkspaceData): WorkspaceDataIssue[] {
  const issues: WorkspaceDataIssue[] = [];
  const accountNames = workspace.accounts.map(account => account.accountName);
  const aliases = buildAccountAliasIndex(workspace.accountMerges);
  const assignments = new Map(portfolioAssignments(workspace.portfolioRecords || []).map(row => [row.opportunityId, row]));
  for (const opportunity of workspace.opportunities) {
    const href = `/app/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}${isLeadRecord(opportunity) ? '&from=leads' : ''}`;
    if (!isLeadRecord(opportunity) && opportunity.status === 'Active') {
      const result = checkOpportunityIntegrity({ opportunity, accountNames, aliases });
      if (!result.complete) issues.push({ id: 'deal:' + opportunity.id, record: `${opportunity.accountName} · ${opportunity.opportunityName}`, reason: describeIntegrity(result), href });
    }
    if (workspace.portfolioRecords !== undefined && opportunity.brand && !assignments.get(opportunity.id)?.brandId) issues.push({ id: 'brand:' + opportunity.id, record: `${opportunity.accountName} · ${opportunity.brand}`, reason: 'Brand text has no accepted catalog link. Link to a Brand or explicitly classify as Others.', href: `/app/products?opportunityId=${encodeURIComponent(opportunity.id)}` });
  }
  for (const quote of workspace.quotes.filter(row => !row.__deleted)) {
    const result = checkQuoteIntegrity({ quote, opportunities: workspace.opportunities });
    const reason = !quote.opportunityId ? 'Choose the source Opportunity. Unlinked quotes are excluded from financial reports.' : describeIntegrity(result);
    if (reason) issues.push({ id: 'quote:' + quote.id, record: quote.title || quote.quoteId, reason, href: `/app/quotes?quoteId=${encodeURIComponent(quote.id)}` });
  }
  return issues;
}
