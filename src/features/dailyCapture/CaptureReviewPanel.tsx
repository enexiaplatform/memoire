import { useMemo, useState } from 'react';
import { Check, ChevronDown, Sparkles } from 'lucide-react';
import {
  factKindLabels,
  type CapturedFact,
  type ReviewableChangeSet,
} from '../../domain/commercialKernel/capturedFacts';
import type { EvidenceDirection } from '../../domain/commercialKernel/commercialEvidence';
import { formatSafeBusinessDate } from '../../utils/safeDate';
import { formatCurrencyAmount } from '../../utils/money';

/**
 * What Memoire understood, before it is allowed to change anything.
 *
 * The shape of this panel is the product argument. It is a list of sentences
 * with tick boxes, not a form: the operator is checking a reading, not filling
 * in a CRM. Anything that turns a row into six labelled inputs has lost the
 * point, which is that capturing a meeting should cost one paragraph and four
 * seconds of confirmation.
 *
 * Three states per row, and no fourth. Ticked saves it, unticked does not, and
 * "already recorded" is shown rather than hidden - a proposal that silently
 * disappears looks like the parser missed it, and the operator then types it in
 * by hand, which is the duplicate the check existed to prevent.
 */

export function CaptureReviewPanel({
  changeSet,
  saving,
  message,
  scopeCandidates = [],
  onSave,
  onDismiss,
}: {
  changeSet: ReviewableChangeSet;
  saving: boolean;
  message: string;
  /**
   * The deals on this customer, so a single fact can be moved to a different
   * one without re-filing the whole note. Almost never needed - the note is
   * usually about one conversation - which is why it lives inside the editor
   * rather than on every row.
   */
  scopeCandidates?: { opportunityId: string; opportunityName: string; isOpen: boolean }[];
  onSave: (accepted: CapturedFact[]) => void;
  onDismiss: () => void;
}) {
  const proposable = useMemo(
    () => changeSet.facts.filter((fact) => fact.status !== 'already_recorded'),
    [changeSet.facts],
  );
  const alreadyRecorded = useMemo(
    () => changeSet.facts.filter((fact) => fact.status === 'already_recorded'),
    [changeSet.facts],
  );

  // Everything starts ticked. The parser only proposes what it can defend, so
  // the common path is "yes, that is what happened" - and a list that starts
  // empty makes the operator do the work twice.
  const [accepted, setAccepted] = useState<string[]>(() => proposable.map((fact) => fact.id));
  const [edits, setEdits] = useState<Record<string, CapturedFact>>({});
  const [expanded, setExpanded] = useState('');

  if (changeSet.facts.length === 0 && changeSet.unsupported.length === 0) return null;

  const factOf = (fact: CapturedFact) => edits[fact.id] || fact;
  const isAccepted = (fact: CapturedFact) => accepted.includes(fact.id);
  const acceptedCount = proposable.filter(isAccepted).length;

  const toggle = (id: string) => setAccepted((current) => (
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  ));

  const edit = (fact: CapturedFact, patch: Partial<CapturedFact>) => {
    setEdits((current) => ({ ...current, [fact.id]: { ...factOf(fact), ...patch } as CapturedFact }));
  };

  const save = () => {
    onSave(proposable.filter(isAccepted).map((fact) => ({ ...factOf(fact), status: 'accepted' as const })));
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-label="What Memoire found in this note">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-blue" aria-hidden="true" />
        <h2 className="text-sm font-bold text-navy">
          {proposable.length === 1
            ? 'Memoire found 1 thing in this note'
            : `Memoire found ${proposable.length} things in this note`}
        </h2>
      </div>
      <p className="mt-0.5 text-xs text-gray-500">
        Untick anything you do not want kept. Nothing is recorded until you save.
      </p>

      <ul className="mt-3 space-y-1.5">
        {proposable.map((original) => {
          const fact = factOf(original);
          const open = expanded === fact.id;
          return (
            <li key={fact.id} className="rounded-lg border border-gray-200">
              <div className="flex items-start gap-2 p-2.5">
                <input
                  type="checkbox"
                  id={`fact-${fact.id}`}
                  checked={isAccepted(original)}
                  onChange={() => toggle(fact.id)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
                />
                <div className="min-w-0 flex-1">
                  <label htmlFor={`fact-${fact.id}`} className="block cursor-pointer">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                      {factKindLabels[fact.kind]}
                      {fact.certainty === 'ambiguous' && (
                        <span className="ml-1 text-amber-700">· check this one</span>
                      )}
                    </span>
                    <span className="block text-sm leading-5 text-gray-900">{summarise(fact)}</span>
                  </label>
                  {/* The operator's own words. This is how "why did Memoire
                      propose this?" is answered without a second screen. */}
                  <p className="mt-0.5 text-[11px] italic leading-4 text-gray-500">“{fact.evidence}”</p>
                  {/* Said out loud on the row it applies to. Being named in a
                      note is not authority, and a product that quietly promoted
                      an attendee to Economic Buyer would be defending forecasts
                      with a person nobody ever confirmed. */}
                  {fact.kind === 'stakeholder' && (
                    <p className="mt-0.5 text-[11px] leading-4 text-gray-500">
                      Role starts as Unknown — Memoire will not auto-assign Champion or Economic Buyer.
                    </p>
                  )}
                </div>
                {isEditable(fact) && (
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? '' : fact.id)}
                    aria-expanded={open}
                    className="inline-flex min-h-[28px] shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                  >
                    Edit
                    <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                )}
              </div>

              {open && (
                <FactEditor
                  fact={fact}
                  scopeCandidates={scopeCandidates}
                  onChange={(patch) => edit(original, patch)}
                />
              )}
            </li>
          );
        })}
      </ul>

      {alreadyRecorded.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Already recorded</p>
          <ul className="mt-1 space-y-0.5">
            {alreadyRecorded.map((fact) => (
              <li key={fact.id} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <Check className="h-3 w-3 shrink-0 text-emerald-600" aria-hidden="true" />
                <span className="min-w-0 truncate">{factKindLabels[fact.kind]}: {summarise(fact)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {changeSet.unsupported.length > 0 && (
        <div className="mt-3">
          {/* Read and not placed. Saying so is more honest than quietly
              dropping it, and this list is what decides what to build next. */}
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
            Read, but nowhere to record it yet
          </p>
          <ul className="mt-1 space-y-0.5">
            {changeSet.unsupported.map((item) => (
              <li key={item.label} className="text-[11px] text-gray-500">
                {item.label} — <span className="italic">“{item.evidence}”</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {message && <p className="mt-3 text-xs font-semibold text-gray-700">{message}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || acceptedCount === 0}
          className="min-h-[36px] rounded-full bg-navy px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : `Save ${acceptedCount} ${acceptedCount === 1 ? 'item' : 'items'}`}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-[36px] rounded-full px-3 text-sm font-semibold text-gray-500 hover:text-gray-800"
        >
          Not now
        </button>
      </div>
    </section>
  );
}

/** One line saying what would be recorded. Never a form. */
function summarise(fact: CapturedFact): string {
  switch (fact.kind) {
    case 'objection':
      return `${fact.objectionType}: ${fact.text}`;
    case 'stakeholder':
      return fact.roleTitle ? `${fact.name} — ${fact.roleTitle}` : fact.name;
    case 'commitment': {
      const owner = fact.party === 'self' ? 'You owe' : `${fact.ownerLabel || 'They'} owes`;
      const when = fact.dueDate ? ` · ${formatSafeBusinessDate(fact.dueDate)}` : ' · no date';
      return `${owner}: ${fact.text}${when}`;
    }
    case 'opportunity_value':
      return `${formatCurrencyAmount(fact.amount, fact.currency)}${fact.approximate ? ' (approximate)' : ''}`;
    case 'scheduled_event':
      return `${fact.label} · ${formatSafeBusinessDate(fact.date)}`;
    case 'commercial_evidence':
      return `${fact.summary} · ${EVIDENCE_DIRECTION_LABELS[fact.direction]}`;
    default:
      return '';
  }
}

/**
 * How a finding is described, in the operator's language rather than the
 * schema's. "positive" is a database word; "reads as positive" is a sentence,
 * and it keeps the direction reviewable rather than authoritative.
 */
const EVIDENCE_DIRECTION_LABELS: Record<EvidenceDirection, string> = {
  positive: 'reads as positive',
  negative: 'reads as negative',
  neutral: 'no verdict yet',
};

function isEditable(fact: CapturedFact): boolean {
  return fact.kind !== 'stakeholder' || Boolean(fact.name);
}

/**
 * The fields this kind of fact actually has.
 *
 * Deliberately few. The point of review is to correct a misreading - a wrong
 * amount, a wrong date, the wrong person - not to complete a record. Anything
 * the operator wants to fill in properly belongs on the record itself, which is
 * one click away once this is saved.
 */
function FactEditor({
  fact,
  scopeCandidates,
  onChange,
}: {
  fact: CapturedFact;
  scopeCandidates: { opportunityId: string; opportunityName: string; isOpen: boolean }[];
  onChange: (patch: Partial<CapturedFact>) => void;
}) {
  const field = 'mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm';
  const label = 'text-[11px] font-bold uppercase tracking-wide text-gray-500';

  return (
    <div className="border-t border-gray-100 bg-gray-50/60 p-2.5">
      <div className="grid gap-2 sm:grid-cols-2">
        {scopeCandidates.length > 0 && (
          <div className="sm:col-span-2">
            <label className={label} htmlFor={`edit-scope-${fact.id}`}>Deal</label>
            <select
              id={`edit-scope-${fact.id}`} className={field} value={fact.target.opportunityId || ''}
              onChange={(event) => onChange({
                target: {
                  ...fact.target,
                  opportunityId: event.target.value || null,
                  opportunityName: scopeCandidates
                    .find((item) => item.opportunityId === event.target.value)?.opportunityName || '',
                },
              } as Partial<CapturedFact>)}
            >
              <option value="">The customer, not a specific deal</option>
              {scopeCandidates.map((candidate) => (
                <option key={candidate.opportunityId} value={candidate.opportunityId}>
                  {candidate.opportunityName}{candidate.isOpen ? '' : ' (closed)'}
                </option>
              ))}
            </select>
          </div>
        )}

        {fact.kind === 'objection' && (
          <div className="sm:col-span-2">
            <label className={label} htmlFor={`edit-text-${fact.id}`}>What they said</label>
            <input
              id={`edit-text-${fact.id}`} className={field} value={fact.text}
              onChange={(event) => onChange({ text: event.target.value } as Partial<CapturedFact>)}
            />
          </div>
        )}

        {fact.kind === 'stakeholder' && (
          <>
            <div>
              <label className={label} htmlFor={`edit-name-${fact.id}`}>Name</label>
              <input
                id={`edit-name-${fact.id}`} className={field} value={fact.name}
                onChange={(event) => onChange({ name: event.target.value } as Partial<CapturedFact>)}
              />
            </div>
            <div>
              <label className={label} htmlFor={`edit-role-${fact.id}`}>Job title</label>
              <input
                id={`edit-role-${fact.id}`} className={field} value={fact.roleTitle}
                onChange={(event) => onChange({ roleTitle: event.target.value } as Partial<CapturedFact>)}
              />
            </div>
          </>
        )}

        {fact.kind === 'commitment' && (
          <>
            <div className="sm:col-span-2">
              <label className={label} htmlFor={`edit-text-${fact.id}`}>What was promised</label>
              <input
                id={`edit-text-${fact.id}`} className={field} value={fact.text}
                onChange={(event) => onChange({ text: event.target.value } as Partial<CapturedFact>)}
              />
            </div>
            <div>
              <label className={label} htmlFor={`edit-owner-${fact.id}`}>Who owes it</label>
              <select
                id={`edit-owner-${fact.id}`} className={field} value={fact.party}
                onChange={(event) => onChange({ party: event.target.value } as Partial<CapturedFact>)}
              >
                <option value="self">You</option>
                <option value="customer">The customer</option>
                <option value="internal">Someone internal</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor={`edit-due-${fact.id}`}>Due</label>
              <input
                id={`edit-due-${fact.id}`} type="date" className={field} value={fact.dueDate}
                onChange={(event) => onChange({ dueDate: event.target.value } as Partial<CapturedFact>)}
              />
            </div>
          </>
        )}

        {fact.kind === 'opportunity_value' && (
          <>
            <div>
              <label className={label} htmlFor={`edit-amount-${fact.id}`}>Amount</label>
              <input
                id={`edit-amount-${fact.id}`} type="number" className={field} value={fact.amount}
                onChange={(event) => onChange({ amount: Number(event.target.value) } as Partial<CapturedFact>)}
              />
            </div>
            <div>
              <label className={label} htmlFor={`edit-currency-${fact.id}`}>Currency</label>
              <input
                id={`edit-currency-${fact.id}`} className={field} value={fact.currency}
                onChange={(event) => onChange({ currency: event.target.value.toUpperCase() } as Partial<CapturedFact>)}
              />
            </div>
          </>
        )}

        {fact.kind === 'commercial_evidence' && (
          <>
            <div>
              <label className={label} htmlFor={`edit-finding-${fact.id}`}>What was found</label>
              <input
                id={`edit-finding-${fact.id}`} className={field} value={fact.summary}
                onChange={(event) => onChange({ summary: event.target.value } as Partial<CapturedFact>)}
              />
            </div>
            <div>
              <label className={label} htmlFor={`edit-direction-${fact.id}`}>How it reads</label>
              <select
                id={`edit-direction-${fact.id}`} className={field} value={fact.direction}
                onChange={(event) => onChange({ direction: event.target.value } as Partial<CapturedFact>)}
              >
                {(Object.keys(EVIDENCE_DIRECTION_LABELS) as EvidenceDirection[]).map((direction) => (
                  <option key={direction} value={direction}>{EVIDENCE_DIRECTION_LABELS[direction]}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-gray-500">
                Memoire never calls a trial accepted from vague wording — set this yourself if the note meant more.
              </p>
            </div>
          </>
        )}

        {fact.kind === 'scheduled_event' && (
          <>
            <div>
              <label className={label} htmlFor={`edit-label-${fact.id}`}>What happens</label>
              <input
                id={`edit-label-${fact.id}`} className={field} value={fact.label}
                onChange={(event) => onChange({ label: event.target.value } as Partial<CapturedFact>)}
              />
            </div>
            <div>
              <label className={label} htmlFor={`edit-date-${fact.id}`}>When</label>
              <input
                id={`edit-date-${fact.id}`} type="date" className={field} value={fact.date}
                onChange={(event) => onChange({ date: event.target.value } as Partial<CapturedFact>)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
