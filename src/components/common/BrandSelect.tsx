import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../../auth/authContext';
import { useDemoWorkspaceMode } from '../../hooks/useDemoWorkspaceMode';
import { hasLocalSampleData } from '../../utils/dataMode';
import { loadPortfolio, readPortfolio, PORTFOLIO_UPDATED_EVENT } from '../../services/portfolioStore';
import { portfolioNodes, type PortfolioRecord } from '../../domain/portfolio/portfolioCatalog';
import { OTHERS_BRAND, resolveBrandSelection } from '../../domain/portfolio/brandSelection';
import { controlClass, fieldLabelClass } from '../ui/daylightStyles';

export function BrandSelect({ value, catalogId, opportunityId, onChange }: {
  value: string; catalogId?: string; opportunityId?: string;
  onChange: (brand: string, brandCatalogId: string) => void;
}) {
  const { user } = useAuthContext();
  const demo = useDemoWorkspaceMode();
  const sample = demo || hasLocalSampleData();
  const scope = useMemo(() => ({ userId: sample ? null : user?.id || null, sampleDataActive: sample }), [sample, user?.id]);
  const [loaded, setLoaded] = useState<{ scope: typeof scope; records: PortfolioRecord[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const refresh = () => { void loadPortfolio(scope).then(catalog => {
      if (live) { setLoaded({ scope, records: catalog.records }); setError(catalog.cloud === 'unavailable' ? catalog.message : ''); }
    }).catch(() => { if (live) setError('Catalog unavailable. Reload Products & Brands before saving a Brand.'); }); };
    refresh();
    const onUpdate = () => { try { if (live) setLoaded({ scope, records: readPortfolio(scope) }); } catch { /* Initial load reports errors. */ } };
    window.addEventListener(PORTFOLIO_UPDATED_EVENT, onUpdate);
    return () => { live = false; window.removeEventListener(PORTFOLIO_UPDATED_EVENT, onUpdate); };
  }, [scope]);
  const records = loaded?.scope === scope ? loaded.records : [];
  const nodes = portfolioNodes(records).filter(node => node.kind === 'brand');
  const resolved = resolveBrandSelection(records, { brand: value }, opportunityId, value);
  const selected = catalogId ?? (resolved.others ? OTHERS_BRAND : resolved.node?.id || '');
  return <div className="space-y-2">
    <label className={fieldLabelClass}>Brand / principal<select aria-label="Brand / principal" className={`${controlClass} mt-1.5`} value={selected}
      disabled={loaded?.scope !== scope} onChange={event => {
        const id = event.target.value;
        onChange(id === OTHERS_BRAND ? '' : nodes.find(node => node.id === id)?.name || '', id);
      }}>
      <option value="">No brand yet</option>
      {nodes.filter(node => node.name !== 'Others' && (node.status === 'active' || node.id === selected)).map(node => <option key={node.id} value={node.id}>{node.name}{node.status === 'retired' ? ' (retired)' : ''}</option>)}
      <option value={OTHERS_BRAND}>Others — enter manually</option>
    </select></label>
    {selected === OTHERS_BRAND && <label className={fieldLabelClass}>Other brand name<input aria-label="Other brand name" required maxLength={200}
      className={`${controlClass} mt-1.5`} value={value} onChange={event => onChange(event.target.value, OTHERS_BRAND)} /></label>}
    <p className="text-xs text-muted">Choose a catalog Brand or enter a name under Others. <Link className="font-semibold text-brand-blue" to="/app/products">Manage Brands</Link></p>
    {error && <p role="status" className="text-xs text-tint-amber-ink">{error}</p>}
  </div>;
}
