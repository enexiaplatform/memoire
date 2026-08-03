/**
 * A synthetic workspace at any size, shaped like a real distributor's book.
 *
 * Shared by the performance budget (which measures the derived models in Node)
 * and the surface-render harness (which measures the actual pages in a browser),
 * so both are talking about the same workspace when they disagree.
 *
 * Records are lean on purpose: real ones carry more text, but text is a storage
 * question, not a compute or render one, and fat records make the harness hit
 * the browser's storage ceiling before it reaches the scale being tested.
 *
 * Lean, but not so lean the app throws them away. Until 2026-08-03 the
 * activities here had no `rawNote`, and `loadLocalActivities` drops any record
 * without one - so every browser measurement that claimed 900 activities was
 * taken against zero of them, and the Activity page was being timed on an empty
 * workspace. A fixture that does not survive the product's own loader measures
 * nothing. Every record below now carries the fields its store requires.
 */

export function buildScaleWorkspace(scale = { opportunities: 300, activities: 900, accounts: 200, quotes: 250 }) {
  const SCALE = scale;
const account = (index) => `Account ${index % SCALE.accounts}`;

  const opportunities = Array.from({ length: SCALE.opportunities }, (_, index) => ({
  id: `opp-${index}`,
  accountName: account(index),
  opportunityName: `Deal ${index}`,
  stage: ['Discovery', 'Proposal', 'Negotiation', 'Procurement'][index % 4],
  status: index % 11 === 0 ? 'Won' : index % 17 === 0 ? 'Lost' : 'Active',
  estimatedValue: 100_000_000 + index * 1_000,
  currency: 'VND',
  pipelineProbability: (index % 10) * 10,
  nextAction: index % 3 === 0 ? '' : 'Follow up with procurement',
  nextActionDate: `2026-08-${String((index % 28) + 1).padStart(2, '0')}`,
  expectedClosePeriod: `Q${(index % 4) + 1}`,
  evidence: 'Technical evaluation done',
  // Every string field the store guarantees. A fixture missing one does not
  // measure a slow path, it throws inside it - `technicalCriteria` was absent
  // and `reviewDecisionCriteria` calls `.trim()` on it unguarded.
  budgetOwner: index % 4 === 0 ? '' : 'Finance director',
  procurementPath: index % 6 === 0 ? '' : 'Open tender',
  technicalCriteria: index % 5 === 0 ? '' : 'Throughput and IQ/OQ documentation',
  missingContext: index % 3 === 0 ? 'Economic buyer not confirmed' : '',
  objectionDebt: index % 7 === 0 ? 'Price vs incumbent unresolved' : '',
  forecastEvidenceCategory: ['Defensible', 'Weak but recoverable', 'Hope-based', 'Unsupported'][index % 4],
  decisionRecommendation: ['Advance', 'Rescue', 'Downgrade', 'Close'][index % 4],
  brand: `Brand ${index % 6}`,
  channel: index % 2 === 0 ? 'Direct' : 'Dealer',
  productOrSolution: 'Analyzer',
  decisionMaker: index % 5 === 0 ? '' : 'Head of Lab',
  fy26Value: 100_000_000,
  fy27Value: null,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: `2026-07-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
}));

  const activities = Array.from({ length: SCALE.activities }, (_, index) => ({
  id: `activity-${index}`,
  accountName: account(index),
  activityDate: `2026-07-${String((index % 28) + 1).padStart(2, '0')}`,
  activityType: ['Meeting', 'Call', 'Email', 'Site visit'][index % 4],
  summary: `Recorded touch ${index} with the customer about the current evaluation.`,
  // Required by loadLocalActivities. Without it the store silently discards
  // the record and the whole fixture measures an empty workspace.
  rawNote: `Recorded touch ${index} with the customer about the current evaluation.`,
  linkedOpportunityId: index % 3 === 0 ? `opp-${index % SCALE.opportunities}` : '',
  linkedOpportunityName: index % 3 === 0 ? `Deal ${index % SCALE.opportunities}` : '',
  opportunityName: index % 5 === 0 ? `Deal ${index % SCALE.opportunities}` : '',
  linkedAccountName: index % 3 === 0 ? account(index) : '',
  linkStatus: index % 3 === 0 ? 'Linked' : 'Unlinked',
  contactName: 'Contact person',
  stakeholderName: '',
  stakeholderRole: '',
  competitors: [],
  buyingSignals: [],
  risks: [],
  timelineSignals: [],
  nextActions: [],
  nextAction: index % 4 === 0 ? 'Send revised quote' : '',
  // The record's own field name. `nextActionDate` was never read by anything.
  dueDate: index % 4 === 0 ? '2026-08-12' : '',
  tags: ['commercial-signal'],
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  storageMode: 'local',
}));

  const accounts = Array.from({ length: SCALE.accounts }, (_, index) => ({
  id: `account-${index}`,
  accountName: `Account ${index}`,
  segment: 'Pharma',
  relationshipStatus: ['Strong', 'Developing', 'At risk'][index % 3],
  accountPotential: ['High', 'Medium', 'Low'][index % 3],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
}));

  const quotes = Array.from({ length: SCALE.quotes }, (_, index) => ({
  id: `quote-${index}`,
  quoteId: `Q-${index}`,
  accountName: account(index),
  opportunityId: `opp-${index % SCALE.opportunities}`,
  opportunityName: `Deal ${index % SCALE.opportunities}`,
  title: `Quote ${index}`,
  quoteDate: `2026-07-${String((index % 28) + 1).padStart(2, '0')}`,
  validUntil: '2026-09-01',
  amount: 90_000_000,
  currency: 'VND',
  grossMarginEstimate: null,
  discount: null,
  paymentTerm: '30% deposit, 70% on delivery',
  status: ['Sent', 'Accepted', 'Draft'][index % 3],
  poStatus: index % 5 === 0 ? 'Received' : 'Pending',
  deliveryStatus: index % 7 === 0 ? 'Delivered' : 'Not scheduled',
  expectedDeliveryDate: '2026-08-20',
  paymentStatus: index % 9 === 0 ? 'Paid' : 'Not due',
  paymentDueDate: '2026-09-15',
  nextAction: '',
  notes: '',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
}));

  const outcomes = opportunities
  .filter((opportunity) => opportunity.status !== 'Active')
  .map((opportunity, index) => ({
    id: `outcome-${index}`,
    opportunityId: opportunity.id,
    accountName: opportunity.accountName,
    opportunityName: opportunity.opportunityName,
    outcome: opportunity.status === 'Won' ? 'Won' : 'Lost',
    outcomeDate: `2026-07-${String((index % 28) + 1).padStart(2, '0')}`,
    finalAmount: 90_000_000,
    currency: 'VND',
    forecastEvidenceCategoryBeforeOutcome: 'Defensible',
    decisionRecommendationBeforeOutcome: 'Advance',
    stageBeforeOutcome: 'Negotiation',
    pipelineProbabilityBeforeOutcome: 70,
    reasonCategory: 'Price',
    reasonText: '',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    storageMode: 'local',
  }));


  return { opportunities, activities, accounts, quotes, outcomes };
}
