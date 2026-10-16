export const fixtureOwner = 'fixture-owner';
export const fixtureWorkspace = {
  accounts: [{ id: 'fixture-account', userId: fixtureOwner, accountName: 'Northstar Research (fictional)', relationshipStatus: 'Active', industry: 'Research', strategy: 'Prepare a bounded evaluation.' }],
  opportunities: [{ id: 'fixture-deal', userId: fixtureOwner, accountId: 'fixture-account', accountName: 'Northstar Research (fictional)', opportunityName: 'Analyzer evaluation (fictional)', stage: 'Proposal', status: 'Active', estimatedValue: null, currency: 'USD', nextAction: 'Confirm demo criteria.', nextActionDate: '2026-10-20', evidence: 'Customer requested a demo; evaluation criteria remain open.', missingContext: 'Decision date and evaluation criteria.', updatedAt: '2026-10-16T00:00:00Z' }],
  activities: [{ id: 'fixture-activity', userId: fixtureOwner, linkedOpportunityId: 'fixture-deal', activityDate: '2026-10-15', activityType: 'Customer meeting', summary: 'Customer requested a demo and a short follow-up.', nextAction: 'Ask for evaluation criteria.', dueDate: '2026-10-20' }],
  quotes: [], commitments: [], receivableRecords: [], milestoneRecords: [],
};
export async function loadSalesWorkspaceData() { return fixtureWorkspace; }
export async function loadPlanItemsForUser() { return []; }
