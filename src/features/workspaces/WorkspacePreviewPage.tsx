import { useCallback, useState } from 'react';
import { BriefcaseBusiness, Check, ChevronDown, Plus } from 'lucide-react';
import { BrandWordmark } from '../../components/brand/BrandWordmark';
import { NoIndex } from '../../components/marketing/PageSeo';
import { ghostPillClass, primaryPillClass } from '../../components/ui/daylightStyles';
import { WorkspaceCreateDialog } from './WorkspaceCreateDialog';
import { createWorkspaceCopy, type CopyCategory, type Workspace } from './workspaceCopy';

const source: Workspace = {
  id: 'example', name: 'Medtec / Biomedia',
  accounts: [{ id: 'a', name: 'Example Research Lab', industry: 'Life sciences', location: 'Ho Chi Minh City' }],
  contacts: [{ id: 'c', accountId: 'a', name: 'Demo contact', role: 'Lab manager', email: 'lab@example.com' }],
  catalog: [{ id: 'p', name: 'Example media kit', brand: 'Example brand', category: 'Consumables' }],
  templates: [{ id: 't', name: 'Weekly commercial review', layout: 'weekly' }],
  activities: [{ id: 'e', summary: 'Completed a product discussion' }],
  opportunities: [{ id: 'o', name: 'Example instrument evaluation' }],
  orders: [{ id: 'ord', name: 'Example order' }],
  quotes: [{ id: 'q', name: 'Example quotation' }],
  salesActual: 12000000,
};

export function WorkspacePreviewPage() {
  const [workspaces, setWorkspaces] = useState([source]);
  const [activeId, setActiveId] = useState(source.id);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const closeDialog = useCallback(() => setCreating(false), []);
  const active = workspaces.find(workspace => workspace.id === activeId) ?? source;
  const beginCreate = () => { setSwitcherOpen(false); setCreating(true); };

  async function createWorkspace(input: { name: string; sourceId: string; categories: CopyCategory[] }) {
    if (workspaces.some(workspace => workspace.name.toLocaleLowerCase() === input.name.toLocaleLowerCase())) {
      throw new Error('A workspace already uses this name.');
    }
    const snapshot = workspaces.find(workspace => workspace.id === input.sourceId);
    if (!snapshot) throw new Error('Choose an available source workspace.');
    const created = createWorkspaceCopy({ ...input, id: crypto.randomUUID(), source: snapshot });
    setWorkspaces(current => [...current, created]);
    setActiveId(created.id);
    closeDialog();
  }

  const overview = [
    { label: 'Accounts', count: active.accounts.length },
    { label: 'Pipeline', count: active.opportunities.length },
    { label: 'Quotes', count: active.quotes.length },
    { label: 'Orders', count: active.orders.length },
    { label: 'Sales actual', count: new Intl.NumberFormat('en-VN', { style: 'currency', currency: 'VND' }).format(active.salesActual) },
  ];
  const records = [
    { label: 'Accounts', items: active.accounts.map(row => row.name) },
    { label: 'Contacts', items: active.contacts.map(row => row.name) },
    { label: 'Products & Brands', items: active.catalog.map(row => row.name) },
    { label: 'Reporting templates', items: active.templates.map(row => row.name) },
    { label: 'Activities', items: active.activities.map(row => row.summary) },
  ];

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <NoIndex />
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-8">
          <BrandWordmark className="text-xl" />
          <div className="relative">
            <button type="button" aria-expanded={switcherOpen} aria-controls="workspace-switcher" className={ghostPillClass} onClick={() => setSwitcherOpen(value => !value)}>
              <BriefcaseBusiness aria-hidden size={16} /> {active.name} <ChevronDown aria-hidden size={15} />
            </button>
            {switcherOpen && <div id="workspace-switcher" className="absolute right-0 z-20 mt-2 min-w-56 rounded-xl border border-line bg-white p-1.5 shadow-panel">
              {workspaces.map(workspace => <button key={workspace.id} type="button" aria-current={workspace.id === active.id ? 'true' : undefined} onClick={() => { setActiveId(workspace.id); setSwitcherOpen(false); }} className="flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-sm hover:bg-canvas">
                {workspace.name}{workspace.id === active.id && <Check aria-hidden size={16} className="text-brand-blue" />}
              </button>)}
              <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-brand-blue hover:bg-canvas" onClick={beginCreate}><Plus aria-hidden size={16} />Create workspace</button>
            </div>}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-7 px-5 py-8 sm:px-8 sm:py-12">
        <p className="rounded-lg border border-line bg-white px-4 py-3 text-sm text-muted">Preview with sample data. Workspaces created here last until this page is reloaded.</p>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-display text-3xl font-bold tracking-tight" aria-live="polite">{active.name}</h1>
          <button type="button" className={primaryPillClass} onClick={beginCreate}><Plus aria-hidden size={16} />Create workspace</button>
        </div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-panel bg-white px-5 py-5 shadow-panel sm:grid-cols-5">
          {overview.map(metric => <div key={metric.label}>
            <dt className="text-xs font-semibold text-muted">{metric.label}</dt>
            <dd className="mt-1 break-words font-display text-xl font-bold tabular-nums">{metric.count}</dd>
          </div>)}
        </dl>
        <section aria-labelledby="records-heading" className="rounded-panel bg-white px-5 py-4 shadow-panel">
          <h2 id="records-heading" className="mb-2 font-display text-base font-bold">Workspace records</h2>
          <dl className="divide-y divide-line">
            {records.map(record => <div key={record.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 py-3 text-sm">
              <dt className="font-semibold">{record.label}</dt>
              <dd className="text-muted">{record.items.join(', ') || 'None yet'}</dd>
            </div>)}
          </dl>
        </section>
      </main>
      {creating && <WorkspaceCreateDialog workspaces={workspaces} sourceId={active.id} onClose={closeDialog} onCreate={createWorkspace} />}
    </div>
  );
}
