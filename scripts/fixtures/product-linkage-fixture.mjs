export function seedLinkageDemo() {

    if (localStorage.getItem('linkage-fixture')) return;
    localStorage.setItem('linkage-fixture', 'true'); localStorage.setItem('memoire_demo_workspace', 'interactive-demo');
    localStorage.setItem('memoire.sampleData.loaded', 'true'); localStorage.setItem('memoire_reporting_currency', 'VND');
    const at = '2026-10-01T00:00:00.000Z', envelope = { schemaVersion: 1, version: 1, source: 'demo', isSample: true, createdAt: at, updatedAt: at, history: [] };
    const opp = (id, amount, patch = {}) => ({ id, accountName: 'Acme', opportunityName: `Deal ${id}`, stage: 'Proposal', status: 'Active', estimatedValue: amount, currency: 'VND',
      source: 'demo', isSample: true, createdAt: at, updatedAt: at, nextAction: 'Call buyer', nextActionDate: '2026-10-02', brand: 'Original brand', productOrSolution: 'Original bundle', ...patch });
    localStorage.setItem('memoire.opportunities.v1', JSON.stringify([opp('alpha', 100), opp('beta', 200), opp('won', 50, { stage: 'Won', status: 'Won' }), opp('lead', 900, { stage: 'Lead' })]));
    localStorage.setItem('memoire.accounts.v1', JSON.stringify([{ id: 'account', accountName: 'Acme', source: 'demo', isSample: true, createdAt: at, updatedAt: at }]));
    const nodes = ['a', 'b'].map(id => ({ ...envelope, id, kind: 'brand', name: `Brand ${id.toUpperCase()}`, code: '', description: '', status: 'active', parentId: null, brandId: null, groupId: null, aliases: [] }));
    localStorage.setItem('memoire.portfolioRecords.v1', JSON.stringify([...nodes, ...['alpha', 'beta', 'won', 'lead'].map(id => ({ ...envelope, id: `assignment-${id}`, kind: 'assignment', opportunityId: id,
      businessUnitId: null, brandId: id === 'won' || id === 'lead' ? 'a' : 'b', groupId: null, productId: null, originalBrand: 'Original brand', originalProduct: 'Original bundle' }))]));
    localStorage.setItem('memoire.quotes.v1', JSON.stringify([{ id: 'q', quoteId: 'q', opportunityId: 'won', accountName: 'Acme', opportunityName: 'Deal won', title: 'Order', amount: 60, currency: 'VND',
      quoteDate: '2026-10-01', validUntil: '2026-12-31', paymentTerm: '100% on order', status: 'Accepted', poStatus: 'Received', deliveryStatus: 'Delivered', paymentStatus: 'Due', paymentDueDate: '2026-10-01',
      source: 'demo', isSample: true, createdAt: at, updatedAt: at }]));
    localStorage.setItem('memoire.orderReceivables.v1', JSON.stringify([{ id: 'receivable', opportunityId: 'won', installments: [], receipts: [{ id: 'payment', amount: 20, currency: 'VND', receivedOn: '2026-10-01', method: 'Transfer', note: '' }],
      deliveredOn: '', invoicedOn: '', note: '', source: 'demo', isSample: true, createdAt: at, updatedAt: at }]));
}
