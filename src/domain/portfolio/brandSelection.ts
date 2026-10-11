import { portfolioAssignments, portfolioNodes, suggestPortfolioNode, type PortfolioRecord } from './portfolioCatalog.ts';

export const OTHERS_BRAND = '__others__';

/** Existing links survive renames. Uncatalogued intake is explicitly grouped under Others. */
export function resolveBrandSelection(records: PortfolioRecord[], input: { brand?: string; brandCatalogId?: string }, opportunityId?: string, previousBrand?: string) {
  const text = input.brand?.trim() || '';
  const old = portfolioAssignments(records).find(row => row.opportunityId === opportunityId);
  const nodes = portfolioNodes(records);
  const previous = nodes.find(row => row.id === old?.brandId);
  if (input.brandCatalogId === undefined && previous && previousBrand !== undefined && text === previousBrand.trim()) {
    return { brand: text, node: previous, others: previous.name === 'Others' };
  }
  if (input.brandCatalogId === OTHERS_BRAND) {
    if (!text) throw new Error('Enter a brand name for Others.');
    return { brand: text, node: suggestPortfolioNode(records, 'brand', 'Others'), others: true };
  }
  if (input.brandCatalogId) {
    const node = nodes.find(row => row.kind === 'brand' && row.id === input.brandCatalogId);
    if (!node || (node.status === 'retired' && old?.brandId !== node.id)) throw new Error('Choose an active Brand from the catalog.');
    return { brand: node.name, node, others: false };
  }
  if (!text) return { brand: '', node: null, others: false };
  if (previous && text === old?.originalBrand) return { brand: text, node: previous, others: previous.name === 'Others' };
  const node = suggestPortfolioNode(records, 'brand', text);
  return { brand: node?.name || text, node: node || suggestPortfolioNode(records, 'brand', 'Others'), others: !node };
}
