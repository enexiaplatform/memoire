import { useEffect, useMemo, useState } from 'react';
import { Check, Factory, Plus, Trash2, X } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import {
  deleteSupplierCommitment,
  loadSupplierCommitmentsForWorkspace,
  saveSupplierCommitment,
} from '../../services/supplierCommitmentStore';
import {
  buildSupplierCommitments,
  createSupplierCommitmentRecord,
  defaultPartyForKind,
  supplierCommitmentKinds,
  type SupplierCommitmentKind,
  type SupplierCommitmentParty,
  type SupplierCommitmentRecord,
  type SupplierCommitmentView,
} from '../../utils/supplierCommitments';
import { formatSafeBusinessDate, todayDateKey } from '../../utils/safeDate.ts';

/**
 * Your principals, and what is owed in each direction.
 *
 * This sits on Orders & Cash because it answers the same question the page
 * asks - why is this order not money yet - from the side the customer cannot
 * see. A quote that cannot be sent until the brand confirms a price is stuck
 * for a supply reason, and chasing the customer will not move it.
 */
export function SupplierCommitmentsPanel({ opportunities }: { opportunities: CrmLiteOpportunity[] }) {
  const { user } = useAuthContext();
  const [records, setRecords] = useState<SupplierCommitmentRecord[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  useEffect(() => {
    let cancelled = false;
    void loadSupplierCommitmentsForWorkspace(dataUserId, sampleDataActive).then((loaded) => {
      if (!cancelled) setRecords(loaded);
    });
    return () => { cancelled = true; };
  }, [dataUserId, sampleDataActive]);

  const model = useMemo(() => buildSupplierCommitments({ records }), [records]);

  // The brands the workspace already knows, so a principal is picked rather
  // than retyped - the same reason Capture stopped making people spell out
  // customers it already had.
  const knownBrands = useMemo(
    () => Array.from(new Set(
      opportunities.map((opportunity) => (opportunity.brand || '').trim()).filter(Boolean),
    )).sort((a, b) => a.localeCompare(b)),
    [opportunities],
  );

  const markDone = (view: SupplierCommitmentView) => {
    setRecords(saveSupplierCommitment({ ...view, status: 'done', doneAt: new Date().toISOString() }));
  };

  const remove = (view: SupplierCommitmentView) => {
    setRecords(deleteSupplierCommitment(view.id));
  };

  const add = (input: {
    brand: string;
    party: SupplierCommitmentParty;
    kind: SupplierCommitmentKind;
    label: string;
    dueDate: string;
  }) => {
    setRecords(saveSupplierCommitment(createSupplierCommitmentRecord({
      ...input,
      source: sampleDataActive ? 'demo' : 'user',
      isSample: sampleDataActive,
    })));
    setComposerOpen(false);
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Factory className="h-4 w-4 text-brand-blue" />
            <h2 className="text-lg font-bold text-navy">Your principals</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            The supply side of the same order. What you owe the brand - forecasts, POs, payment - and what the brand owes
            you: pricing, samples, documents, a ship date. A deal waiting on a principal is not a customer problem.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {model.overdueCount > 0 && (
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">{model.overdueCount} overdue</span>
          )}
          <button
            type="button"
            onClick={() => setComposerOpen((open) => !open)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-navy px-3 py-2 text-sm font-bold text-white hover:bg-navy/90"
          >
            <Plus className="h-4 w-4" />
            Record
          </button>
        </div>
      </div>

      {composerOpen && <Composer knownBrands={knownBrands} onAdd={add} onCancel={() => setComposerOpen(false)} />}

      {model.groups.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
          Nothing recorded with a principal yet. Record the forecast you owe them, or the price you are waiting on, and it
          joins your week like any other commitment.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {model.groups.map((group) => (
            <div key={group.brand} className={`rounded-lg border p-3.5 ${group.overdueCount > 0 ? 'border-red-200 bg-red-50/30' : 'border-gray-100 bg-gray-50/50'}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-bold text-navy">{group.brand}</p>
                <p className="text-xs font-semibold text-gray-500">
                  {group.openCount} open
                  {group.overdueCount > 0 ? ` · ${group.overdueCount} overdue` : ''}
                </p>
              </div>

              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <Column
                  title="You owe them"
                  emptyMessage="Nothing you owe this principal."
                  views={group.iOwe}
                  tone="blue"
                  onDone={markDone}
                  onDelete={remove}
                />
                <Column
                  title="They owe you"
                  emptyMessage="Nothing outstanding from this principal."
                  views={group.theyOwe}
                  tone="amber"
                  onDone={markDone}
                  onDelete={remove}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {model.waitingOnSuppliers.length > 0 && (
        <p className="mt-3 text-xs leading-5 text-gray-400">
          Items you owe a principal appear on your week in Timeline, alongside every other commitment. What a principal
          owes you stays here - it is chasing, not delivering, so counting it as your own obligation would make that
          number a lie.
        </p>
      )}
    </section>
  );
}

function Column({
  title,
  emptyMessage,
  views,
  tone,
  onDone,
  onDelete,
}: {
  title: string;
  emptyMessage: string;
  views: SupplierCommitmentView[];
  tone: 'blue' | 'amber';
  onDone: (view: SupplierCommitmentView) => void;
  onDelete: (view: SupplierCommitmentView) => void;
}) {
  const headingTone = tone === 'blue' ? 'text-brand-blue' : 'text-amber-700';

  return (
    <div>
      <p className={`text-[11px] font-bold uppercase tracking-wide ${headingTone}`}>{title}</p>
      {views.length === 0 ? (
        <p className="mt-1 text-xs text-gray-400">{emptyMessage}</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {views.map((view) => (
            <li
              key={view.id}
              className={`group flex items-start gap-2 rounded-md border bg-white px-2.5 py-1.5 text-xs ${
                view.overdue ? 'border-red-200' : 'border-gray-100'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">
                  <span className="mr-1.5 rounded bg-gray-100 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    {view.kind}
                  </span>
                  {view.label}
                </p>
                <p className="mt-0.5 font-semibold text-gray-500">
                  {view.dueDate ? formatSafeBusinessDate(view.dueDate) : 'No date agreed'}
                  {view.overdue && view.daysUntilDue !== null ? ` · ${Math.abs(view.daysUntilDue)}d overdue` : ''}
                  {!view.overdue && view.dueSoon ? ' · due soon' : ''}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Mark "${view.label}" done`}
                onClick={() => onDone(view)}
                className="shrink-0 rounded-full p-1 text-gray-300 transition hover:bg-emerald-50 hover:text-emerald-700 group-hover:text-gray-500"
                title="Done"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Delete "${view.label}"`}
                onClick={() => onDelete(view)}
                className="shrink-0 rounded-full p-1 text-gray-300 transition hover:bg-red-50 hover:text-red-600 group-hover:text-gray-500"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Composer({
  knownBrands,
  onAdd,
  onCancel,
}: {
  knownBrands: string[];
  onAdd: (input: {
    brand: string;
    party: SupplierCommitmentParty;
    kind: SupplierCommitmentKind;
    label: string;
    dueDate: string;
  }) => void;
  onCancel: () => void;
}) {
  const [brand, setBrand] = useState(knownBrands[0] || '');
  const [kind, setKind] = useState<SupplierCommitmentKind>('Pricing');
  const [party, setParty] = useState<SupplierCommitmentParty>(defaultPartyForKind.Pricing);
  const [label, setLabel] = useState('');
  const [dueDate, setDueDate] = useState(todayDateKey());

  // Changing the kind moves the party to the likely side - a sample is almost
  // always theirs, a forecast almost always yours - without locking it, because
  // the exception is real and the operator knows which one they are in.
  const selectKind = (next: SupplierCommitmentKind) => {
    setKind(next);
    setParty(defaultPartyForKind[next]);
  };

  const canSave = brand.trim().length > 0 && label.trim().length > 0;

  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-gray-500">
          Principal
          <input
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
            list="supplier-brand-options"
            placeholder="e.g. Sartorius"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-navy outline-none focus:border-brand-blue"
          />
          <datalist id="supplier-brand-options">
            {knownBrands.map((option) => <option key={option} value={option} />)}
          </datalist>
        </label>

        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-gray-500">
          What
          <select
            value={kind}
            onChange={(event) => selectKind(event.target.value as SupplierCommitmentKind)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-navy outline-none focus:border-brand-blue"
          >
            {supplierCommitmentKinds.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-gray-500">
          Direction
          <select
            value={party}
            onChange={(event) => setParty(event.target.value as SupplierCommitmentParty)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-navy outline-none focus:border-brand-blue"
          >
            <option value="self">I owe them</option>
            <option value="supplier">They owe me</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-gray-500">
          Due
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-navy outline-none focus:border-brand-blue"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-gray-500 md:col-span-2 xl:col-span-3">
          Detail
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSave) onAdd({ brand, party, kind, label, dueDate });
              if (event.key === 'Escape') onCancel();
            }}
            placeholder="e.g. Special price for Conda tender"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-navy outline-none focus:border-brand-blue"
          />
        </label>

        <div className="flex items-end gap-2">
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onAdd({ brand, party, kind, label, dueDate })}
            className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
