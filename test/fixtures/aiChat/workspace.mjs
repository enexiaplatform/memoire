export const fixtureOwner = 'fixture-owner';
export const WORKSPACE_REFRESHED_EVENT = 'memoire:workspace-refreshed';
export const fixtureWorkspace = {
  accounts: [{ id: 'fixture-account', userId: fixtureOwner, accountName: 'Northstar Research (fictional)', relationshipStatus: 'Active', industry: 'Research', strategy: 'Prepare a bounded evaluation.', nextFollowUp:'2026-10-20', updatedAt:'2026-10-16T00:00:00Z',storageMode:'cloud' }],
  opportunities: [{ id: 'fixture-deal', userId: fixtureOwner, accountId: 'fixture-account', accountName: 'Northstar Research (fictional)', opportunityName: 'Analyzer evaluation (fictional)', stage: 'Proposal', status: 'Active', estimatedValue: null, currency: 'USD', nextAction: 'Confirm demo criteria.', nextActionDate: '2026-10-20', evidence: 'Customer requested a demo; evaluation criteria remain open.', missingContext: 'Decision date and evaluation criteria.', updatedAt: '2026-10-16T00:00:00Z' }],
  activities: [{ id: 'fixture-activity', userId: fixtureOwner, linkedOpportunityId: 'fixture-deal', activityDate: '2026-10-15', activityType: 'Customer meeting', summary: 'Customer requested a demo and a short follow-up.', nextAction: 'Ask for evaluation criteria.', dueDate: '2026-10-20' }],
  stakeholders:[{id:'fixture-person',userId:fixtureOwner,accountId:'fixture-account',opportunityId:'fixture-deal',name:'Fictional QC lead',stakeholderRole:'Technical Buyer',roleTitle:'QC',influenceLevel:'High',relationshipStrength:'Developing',stance:'Neutral'}],
  objections:[{id:'fixture-blocker',userId:fixtureOwner,accountId:'fixture-account',opportunityId:'fixture-deal',objectionType:'Technical fit',objectionText:'Need a validated sensitivity report',requiredProof:'Demo acceptance report',responsePlan:'Review checklist',status:'Open',impact:'High'}],
  evidence:[], assets:[], actionOutcomes:[], opportunityOutcomes:[],
  quotes: [], commitments: [], receivableRecords: [], milestoneRecords: [],
};
export async function loadSalesWorkspaceData() {
  if(typeof window!=='undefined') {
    const savedAccount=localStorage.getItem('memoire.fixture.ai-actions.accounts');
    if(savedAccount) fixtureWorkspace.accounts=JSON.parse(savedAccount);
    const saved=localStorage.getItem('memoire.fixture.ai-actions.opportunities');
    if(saved) fixtureWorkspace.opportunities=JSON.parse(saved);
  }
  if(!fixtureWorkspace.opportunities.some(row=>row.id==='fixture-decoy'))
    fixtureWorkspace.opportunities.push({...fixtureWorkspace.opportunities[0],id:'fixture-decoy',opportunityName:'Endotoxin / BOKANG (fictional decoy)',nextAction:'Unrelated decoy task',nextActionDate:'2026-10-01'});
  return fixtureWorkspace;
}
export async function loadPlanItemsForUser() { return []; }
