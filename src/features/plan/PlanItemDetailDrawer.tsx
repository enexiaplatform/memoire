import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Lock, Trash2, X } from 'lucide-react';
import { buildPlanLinkOptions, planLinkKindLabel, type PlanItem, type PlanLinkOption } from '../../utils/weeklyPlan';
import {
  captureEditUnlinksDeal,
  planItemEditChangesAnything,
  planItemEditPolicy,
  type PlanItemEditDraft,
} from '../../utils/planItemEdit';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { SalesActivityRecord } from '../../services/salesActivityStore';
import { formatSafeBusinessDate } from '../../utils/safeDate';
import { sameAccount } from '../../utils/accountIdentity';
import { matchesSearchQuery } from '../../utils/textSearch';

/**
 * One line of the week, opened in full.
 *
 * The board can say what a line is and when it is due. Everything else a line is
 * *about* - which customer, which person, which deal - used to be fixed at the
 * moment it was typed, and correcting any of it meant deleting the line and
 * writing it again with its link and its history thrown away.
 *
 * Which fields are editable is decided by the record behind the line, not by
 * this component: see `planItemEditPolicy`. The drawer's own job is to make that
 * boundary visible rather than mysterious - a field it will not write is shown,
 * greyed, next to the record that owns it and a link to go there.
 */

export type PlanContactOption = {
  name: string;
  roleTitle: string;
  accountName: string;
};

export function PlanItemDetailDrawer({
  item,
  draft,
  onDraftChange,
  opportunities,
  activities,
  accountNames,
  brands,
  contacts,
  saving,
  error,
  onSave,
  onDelete,
  onClose,
}: {
  item: PlanItem;
  draft: PlanItemEditDraft;
  onDraftChange: (next: PlanItemEditDraft) => void;
  opportunities: CrmLiteOpportunity[];
  activities: SalesActivityRecord[];
  accountNames: string[];
  brands: string[];
  contacts: PlanContactOption[];
  saving: boolean;
  error: string;
  onSave: () => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [opened] = useState(() => draft);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [contactMenuOpen, setContactMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const policy = planItemEditPolicy(item);
  const set = (patch: Partial<PlanItemEditDraft>) => onDraftChange({ ...draft, ...patch });

  const accountOptions = useMemo(() => (
    policy.fields.account
      ? buildPlanLinkOptions({ draft: draft.accountName, opportunities, accountNames, brands })
      : []
  ), [accountNames, brands, draft.accountName, opportunities, policy.fields.account]);

  /**
   * The people this customer is already known to have, then everybody else.
   *
   * A contact list that ignores the account on the line is a list of every
   * person in the book, which on a real workspace is hundreds - and the three
   * that matter are the ones who work at the company the line names.
   */
  const contactOptions = useMemo(() => {
    if (!policy.fields.contact) return [];
    const scoped = contacts.filter((contact) => (
      !draft.accountName.trim() || sameAccount(contact.accountName, draft.accountName)
    ));
    const pool = scoped.length > 0 ? scoped : contacts;
    // Folded, not lowercased: half the people in this book are spelled with
    // diacritics and typed without them, and a raw lowercase match hides
    // "Nguyễn" from somebody typing "nguyen".
    return pool.filter((contact) => matchesSearchQuery(contact.name, draft.contactName)).slice(0, 6);
  }, [contacts, draft.accountName, draft.contactName, policy.fields.contact]);

  const linkedActivity = item.kind === 'capture'
    ? activities.find((candidate) => item.id.startsWith(`capture-${candidate.id}-`))
    : undefined;
  const willUnlink = Boolean(linkedActivity && captureEditUnlinksDeal(linkedActivity, draft));
  const dirty = planItemEditChangesAnything(opened, draft);
  const editable = policy.fields.label || policy.fields.date || policy.fields.account || policy.fields.contact;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close plan item detail"
        onClick={onClose}
        className="absolute inset-0 bg-navy/40"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Plan item detail"
        className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-blue">{kindEyebrow(item)}</p>
            <h2 className="mt-1 break-words text-lg font-bold leading-6 text-navy">{item.label}</h2>
            <p className="mt-1 text-xs font-semibold text-gray-500">
              {formatSafeBusinessDate(item.date)}
              {item.carriedFrom && ` · carried from ${formatSafeBusinessDate(item.carriedFrom)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-navy"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(event) => { event.preventDefault(); onSave(); }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {/* Only where there is something to save. On an obligation this
                promised a write the drawer cannot make, which is worse than
                saying nothing - the locked note below is the honest answer. */}
            {editable && (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-600 ring-1 ring-gray-100">
                Saving writes into {policy.ownerLabel}, not onto a copy of it — so Timeline, Activity and the rest of
                Memoire say the same thing the moment you close this.
              </p>
            )}

            {editable && (
              <>
                <label className="block">
                  <span className="text-sm font-bold text-navy">What you will do</span>
                  <textarea
                    value={draft.label}
                    rows={2}
                    autoFocus
                    disabled={!policy.fields.label}
                    onChange={(event) => set({ label: event.target.value })}
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-navy">Day</span>
                  <input
                    type="date"
                    value={draft.date}
                    disabled={!policy.fields.date}
                    onChange={(event) => set({ date: event.target.value })}
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                  <span className="mt-1 block text-[11px] font-semibold text-gray-500">
                    Moving the day here is the same write as dragging the card to another column.
                  </span>
                </label>
              </>
            )}

            {policy.fields.account ? (
              <div className="relative">
                <label className="block">
                  <span className="text-sm font-bold text-navy">Customer or line</span>
                  <input
                    type="text"
                    value={draft.accountName}
                    autoComplete="off"
                    placeholder="Who is this work for?"
                    onChange={(event) => {
                      // Typing over a picked name un-picks it. Keeping the old
                      // resolution would file the line under a customer whose
                      // name is no longer on screen.
                      set({ accountName: event.target.value, accountKind: '', opportunityId: '', opportunityName: '' });
                      setAccountMenuOpen(true);
                    }}
                    onFocus={() => setAccountMenuOpen(true)}
                    onBlur={() => setAccountMenuOpen(false)}
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
                  />
                </label>
                {draft.accountKind ? (
                  <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-brand-blue">
                    Linked to {planLinkKindLabel(draft.accountKind).toLowerCase()}
                    {draft.opportunityName ? `: ${draft.opportunityName}` : ''}
                  </span>
                ) : draft.accountName.trim() && (
                  <span className="mt-1.5 block text-[11px] font-semibold text-gray-500">
                    Not a customer Memoire knows yet. It stays as a tag, and the panel under the board can turn it into
                    a real account.
                  </span>
                )}
                {accountMenuOpen && accountOptions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                    {accountOptions.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => { pickAccount(option, set); setAccountMenuOpen(false); }}
                        className="flex w-full items-start gap-1.5 px-3 py-1.5 text-left text-xs font-semibold text-navy hover:bg-blue-50"
                      >
                        <span className={`mt-px shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${
                          option.kind === 'deal'
                            ? 'bg-blue-50 text-brand-blue'
                            : option.kind === 'brand'
                              ? 'bg-violet-50 text-violet-700'
                              : 'bg-sky-50 text-sky-700'
                        }`}>
                          {planLinkKindLabel(option.kind)}
                        </span>
                        <span className="min-w-0 flex-1 whitespace-normal break-words leading-4">{option.display}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* An obligation's counterparty is a vendor or a principal, never a
                 customer, and calling it one on a payment you owe reads as a
                 mistake in the data rather than a label. */
              <LockedField label={item.kind === 'obligation' ? 'Owed to' : 'Customer'} value={item.tag} />
            )}

            {policy.fields.contact ? (
              <div className="relative">
                <label className="block">
                  <span className="text-sm font-bold text-navy">Who it is with</span>
                  <input
                    type="text"
                    value={draft.contactName}
                    autoComplete="off"
                    placeholder="Mr. Phuoc"
                    onChange={(event) => { set({ contactName: event.target.value }); setContactMenuOpen(true); }}
                    onFocus={() => setContactMenuOpen(true)}
                    onBlur={() => setContactMenuOpen(false)}
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
                  />
                </label>
                {contactMenuOpen && contactOptions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                    {contactOptions.map((contact) => (
                      <button
                        key={`${contact.accountName}-${contact.name}`}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          set({ contactName: contact.name, contactRole: contact.roleTitle || draft.contactRole });
                          setContactMenuOpen(false);
                        }}
                        className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-xs font-semibold text-navy hover:bg-blue-50"
                      >
                        <span className="truncate">{contact.name}</span>
                        <span className="shrink-0 text-[11px] font-semibold text-gray-400">
                          {contact.roleTitle || contact.accountName}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {item.kind === 'capture' && (
                  <label className="mt-3 block">
                    <span className="text-sm font-bold text-navy">Their role</span>
                    <input
                      type="text"
                      value={draft.contactRole}
                      placeholder="Purchasing manager"
                      onChange={(event) => set({ contactRole: event.target.value })}
                      className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
                    />
                  </label>
                )}
              </div>
            ) : (
              <LockedField label="Who it is with" value={item.contactName || 'Not recorded'} />
            )}

            {policy.lockedReason && (
              <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900 ring-1 ring-amber-100">
                <p className="flex items-start gap-1.5 font-semibold">
                  <Lock className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>{policy.lockedReason}</span>
                </p>
                {policy.ownerHref && (
                  <Link
                    to={policy.ownerHref}
                    onClick={onClose}
                    className="mt-1.5 inline-block font-bold text-amber-900 underline underline-offset-2"
                  >
                    Open the record
                  </Link>
                )}
              </div>
            )}

            {willUnlink && (
              <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-5 font-semibold text-amber-900 ring-1 ring-amber-100">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>
                  This touch is linked to {linkedActivity?.linkedOpportunityName || 'a deal'}. Saving a different
                  customer unlinks it, because the old link would keep overruling the name you just typed.
                </span>
              </p>
            )}

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2.5 text-xs font-semibold leading-5 text-red-800 ring-1 ring-red-100">
                {error}
              </p>
            )}
          </div>

          {/* Pinned, not scrolled past. A Save that sits at the bottom of a form
              taller than the screen is a Save the operator has to go looking for. */}
          <div className="flex items-center gap-2 border-t border-gray-100 bg-white px-5 py-3">
            {editable && (
              <button
                type="submit"
                disabled={saving || !dirty}
                className="rounded-full bg-brand-blue px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-gray-200 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50"
            >
              {editable ? 'Cancel' : 'Close'}
            </button>
            {policy.deletable && onDelete && (
              <button
                type="button"
                onClick={() => { if (confirmingDelete) onDelete(); else setConfirmingDelete(true); }}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                {confirmingDelete ? 'Delete for good?' : 'Delete'}
              </button>
            )}
          </div>
        </form>
      </aside>
    </div>
  );
}

function pickAccount(option: PlanLinkOption, set: (patch: Partial<PlanItemEditDraft>) => void) {
  if (option.kind === 'brand') {
    set({ accountName: option.brand || option.display, accountKind: 'brand', opportunityId: '', opportunityName: '' });
    return;
  }
  if (option.kind === 'deal') {
    set({
      accountName: option.accountName,
      accountKind: 'deal',
      opportunityId: option.opportunityId || '',
      // The display is "Account / Deal"; the deal's own half is what names it.
      opportunityName: option.display.split(' / ').slice(1).join(' / '),
    });
    return;
  }
  set({ accountName: option.accountName, accountKind: 'account', opportunityId: '', opportunityName: '' });
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-sm font-bold text-gray-400">{label}</span>
      <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-500">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 break-words">{value}</span>
      </p>
    </div>
  );
}

function kindEyebrow(item: PlanItem) {
  if (item.kind === 'personal') return 'Plan · your own line';
  if (item.kind === 'capture') return 'Plan · from a capture';
  if (item.kind === 'deal') return 'Plan · deal next action';
  return 'Plan · something you owe';
}
