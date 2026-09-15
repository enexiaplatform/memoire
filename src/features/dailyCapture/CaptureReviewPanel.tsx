import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CalendarDays, Check, ChevronDown, Clock, Coins, Lock, Sparkles } from 'lucide-react';
import {
  factKindLabels,
  type CapturedFact,
  type ReviewableChangeSet,
} from '../../domain/commercialKernel/capturedFacts';
import type { EvidenceDirection } from '../../domain/commercialKernel/commercialEvidence';
import { formatSafeBusinessDate } from '../../utils/safeDate';
import { formatCurrencyAmount } from '../../utils/money';
import { TopBar } from '../../components/layout/TopBarSlot';
import { GradientEdge, MicroLabel, MicroPill, Panel, StatusChip } from '../../components/ui/daylight';
import { delay, ghostPillClass, monogramInitials, primaryPillClass, type DaylightTone } from '../../components/ui/daylightStyles';
import {
  describeCaptureConsequences,
  FACT_MARK_KIND,
  markCaptureNote,
  NOTE_MARK_LABELS,
  type NoteMarkKind,
} from '../../utils/captureReview';

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
 *
 * Daylight (2026-09-14) lays it out as the mock drew it: the note as written on
 * the left, with the words each proposal came from marked in place; the
 * proposals on the right as tinted rows; and one plain statement of what saving
 * will change underneath. Save lives in the top bar while the review is open.
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

  const factOf = (fact: CapturedFact) => edits[fact.id] || fact;
  const isAccepted = (fact: CapturedFact) => accepted.includes(fact.id);

  const segments = useMemo(() => markCaptureNote(changeSet.rawCapture, [
    ...changeSet.facts.map((fact) => ({ text: fact.evidence, kind: FACT_MARK_KIND[fact.kind] })),
    ...(changeSet.target.accountName ? [{ text: changeSet.target.accountName, kind: 'account' as NoteMarkKind }] : []),
  ]), [changeSet.facts, changeSet.rawCapture, changeSet.target.accountName]);

  if (changeSet.facts.length === 0 && changeSet.unsupported.length === 0) return null;

  const acceptedFacts = proposable.filter(isAccepted).map(factOf);
  const acceptedCount = acceptedFacts.length;
  const consequences = describeCaptureConsequences(acceptedFacts);
  const markedKinds = Array.from(new Set(segments.map((segment) => segment.kind).filter((kind): kind is NoteMarkKind => Boolean(kind))));

  const toggle = (id: string) => setAccepted((current) => (
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  ));

  const edit = (fact: CapturedFact, patch: Partial<CapturedFact>) => {
    setEdits((current) => ({ ...current, [fact.id]: { ...factOf(fact), ...patch } as CapturedFact }));
  };

  const save = () => {
    onSave(proposable.filter(isAccepted).map((fact) => ({ ...factOf(fact), status: 'accepted' as const })));
  };

  const saveLabel = saving ? 'Saving…' : `Save ${acceptedCount} ${acceptedCount === 1 ? 'item' : 'items'}`;

  return (
    <>
      <TopBar
        lead={<CaptureBarLead />}
        status={<StatusChip tone="neutral" icon={<Lock className="h-3.5 w-3.5" aria-hidden="true" />} className="hidden md:inline-flex">No CRM writeback</StatusChip>}
        actions={(
          <>
            <button type="button" onClick={onDismiss} className={`${ghostPillClass} hidden sm:inline-flex`}>Not now</button>
            <button type="button" onClick={save} disabled={saving || acceptedCount === 0} className={`${primaryPillClass} hidden sm:inline-flex`}>
              <Check className="h-4 w-4" strokeWidth={2.4} />
              {saveLabel}
            </button>
          </>
        )}
        ownsPrimary
      />

      <section className="grid items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]" aria-label="What Memoire found in this note">
        <Panel as="div" className="flex animate-rise flex-col overflow-hidden" style={delay(60)}>
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 pb-[13px] pt-4">
            <h2 className="font-display text-[15px] font-bold text-ink">Raw note</h2>
            <MicroPill tone="neutral" className="!normal-case !tracking-normal !text-[11px]">Kept exactly as written</MicroPill>
          </div>
          <p className="whitespace-pre-wrap px-5 py-[18px] text-sm leading-[1.75] text-ink [text-wrap:pretty]">
            {segments.map((segment, index) => (
              segment.kind ? (
                <mark key={index} className={`rounded px-[3px] py-px text-ink ${MARK_GROUND[segment.kind]}`} title={NOTE_MARK_LABELS[segment.kind]}>
                  {segment.text}
                </mark>
              ) : (
                <span key={index}>{segment.text}</span>
              )
            ))}
          </p>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-[13px]">
            <span className="text-[11.5px] text-muted">{changeSet.rawCapture.length} characters · parsed on this device</span>
            {markedKinds.length > 0 && (
              <span className="flex flex-wrap gap-x-3.5 gap-y-1">
                {markedKinds.map((kind) => (
                  <span key={kind} className="inline-flex items-center gap-1.5 text-[11.5px] text-tint-neutral-ink">
                    <span aria-hidden="true" className={`h-[9px] w-[9px] rounded-[3px] ${MARK_GROUND[kind]}`} />
                    {NOTE_MARK_LABELS[kind]}
                  </span>
                ))}
              </span>
            )}
          </div>
        </Panel>

        <div className="flex min-w-0 flex-col gap-3.5">
          <Panel as="div" className="animate-rise px-5 py-[18px]" style={delay(100)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-[15px] font-bold text-ink">
                <Sparkles className="h-4 w-4 text-brand-blue" aria-hidden="true" />
                {proposable.length === 1
                  ? 'Memoire found 1 thing in this note'
                  : `Memoire found ${proposable.length} things in this note`}
              </h2>
              <MicroPill tone="green" className="!normal-case !tracking-normal !text-[11px]">
                {proposable.length} {proposable.length === 1 ? 'item' : 'items'} · all editable
              </MicroPill>
            </div>
            <p className="mt-1 text-xs text-muted">
              Untick anything you do not want kept. Nothing is recorded until you save.
            </p>

            <ul className="mt-3.5 flex flex-col gap-[9px]">
              {proposable.map((original) => {
                const fact = factOf(original);
                const open = expanded === fact.id;
                const look = FACT_LOOK[fact.kind];
                const ticked = isAccepted(original);
                return (
                  <li key={fact.id} className={`rounded-xl transition-opacity ${look.ground} ${ticked ? '' : 'opacity-60'}`}>
                    <div className="flex items-start gap-3 px-[13px] py-[11px]">
                      <input
                        type="checkbox"
                        id={`fact-${fact.id}`}
                        checked={ticked}
                        onChange={() => toggle(fact.id)}
                        className="mt-2 h-4 w-4 shrink-0 rounded border-gray-300"
                      />
                      <FactTile fact={fact} />
                      <div className="min-w-0 flex-1">
                        <label htmlFor={`fact-${fact.id}`} className="block cursor-pointer">
                          <span className="block text-[13px] font-semibold leading-snug text-ink">{summarise(fact)}</span>
                          <span className={`mt-0.5 block text-[11.5px] leading-4 ${look.ink}`}>
                            {whatItDoes(fact)}
                            {fact.certainty === 'ambiguous' && <span className="font-semibold"> · check this one</span>}
                          </span>
                        </label>
                        {/* The operator's own words. This is how "why did Memoire
                            propose this?" is answered without a second screen. */}
                        <p className="mt-1 text-[11px] italic leading-4 text-muted">“{fact.evidence}”</p>
                        {/* Said out loud on the row it applies to. Being named in a
                            note is not authority, and a product that quietly promoted
                            an attendee to Economic Buyer would be defending forecasts
                            with a person nobody ever confirmed. */}
                        {fact.kind === 'stakeholder' && (
                          <p className="mt-0.5 text-[11px] leading-4 text-muted">
                            Role starts as Unknown — Memoire will not auto-assign Champion or Economic Buyer.
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <MicroPill tone={look.tone} solid={look.solid}>{factKindLabels[fact.kind]}</MicroPill>
                        {isEditable(fact) && (
                          <button
                            type="button"
                            onClick={() => setExpanded(open ? '' : fact.id)}
                            aria-expanded={open}
                            className="inline-flex min-h-[26px] items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-tint-neutral-ink hover:bg-white hover:text-ink"
                          >
                            Edit
                            <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                          </button>
                        )}
                      </div>
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
              <div className="mt-3.5">
                <MicroLabel as="p">Already recorded</MicroLabel>
                <ul className="mt-1.5 space-y-0.5">
                  {alreadyRecorded.map((fact) => (
                    <li key={fact.id} className="flex items-center gap-1.5 text-[11.5px] text-muted">
                      <Check className="h-3 w-3 shrink-0 text-tint-green-solid" aria-hidden="true" />
                      <span className="min-w-0 truncate">{factKindLabels[fact.kind]}: {summarise(fact)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {changeSet.unsupported.length > 0 && (
              <div className="mt-3.5">
                {/* Read and not placed. Saying so is more honest than quietly
                    dropping it, and this list is what decides what to build next. */}
                <MicroLabel as="p">Read, but nowhere to record it yet</MicroLabel>
                <ul className="mt-1.5 space-y-0.5">
                  {changeSet.unsupported.map((item) => (
                    <li key={item.label} className="text-[11.5px] text-muted">
                      {item.label} — <span className="italic">“{item.evidence}”</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {message && <p className="mt-3 text-xs font-semibold text-ink">{message}</p>}

            {/* The bar carries Save from `sm` up; on a phone the bar has no room
                for it, so the same two buttons sit at the end of the list. */}
            <div className="mt-3.5 flex flex-wrap items-center gap-2 sm:hidden">
              <button type="button" onClick={save} disabled={saving || acceptedCount === 0} className={primaryPillClass}>
                {saveLabel}
              </button>
              <button type="button" onClick={onDismiss} className={ghostPillClass}>
                Not now
              </button>
            </div>
          </Panel>

          <GradientEdge className="animate-rise" innerClassName="px-[18px] py-4" style={delay(160)}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-[15px] w-[15px] text-brand-blue" aria-hidden="true" />
              <h3 className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-brand-blue">What this changes</h3>
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {consequences.map((sentence) => (
                <li key={sentence} className="text-[13px] leading-[1.6] text-ink [text-wrap:pretty]">{sentence}</li>
              ))}
            </ul>
          </GradientEdge>
        </div>
      </section>
    </>
  );
}

/** The left half of the top bar while Capture is open: a way back, and what this is. */
export function CaptureBarLead() {
  return (
    <>
      <Link
        to="/app/today"
        className="inline-flex shrink-0 items-center gap-2 rounded-full bg-chip px-3.5 py-2 text-[12.5px] font-semibold text-tint-neutral-ink transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-[15px] w-[15px]" />
        Back to Today
      </Link>
      <span className="hidden truncate text-[12.5px] text-muted xl:inline">Quick Capture · parses on this device, no AI service</span>
    </>
  );
}

const MARK_GROUND: Record<NoteMarkKind, string> = {
  account: 'bg-tint-blue-bg',
  person: 'bg-tint-violet-bg',
  promise: 'bg-tint-green-pill',
  risk: 'bg-tint-red-bg',
  value: 'bg-tint-cyan-bg',
  event: 'bg-tint-amber-pill',
  finding: 'bg-chip',
};

/** How each kind of proposal wears its row: the ground, the sub-line ink and the pill. */
const FACT_LOOK: Record<CapturedFact['kind'], { ground: string; ink: string; tone: DaylightTone; solid: boolean }> = {
  commitment: { ground: 'bg-tint-green-bg', ink: 'text-tint-green-ink', tone: 'green', solid: true },
  objection: { ground: 'bg-tint-amber-bg', ink: 'text-tint-amber-ink', tone: 'amber', solid: true },
  stakeholder: { ground: 'bg-tint-neutral-bg', ink: 'text-tint-neutral-ink', tone: 'violet', solid: false },
  opportunity_value: { ground: 'bg-tint-neutral-bg', ink: 'text-tint-neutral-ink', tone: 'cyan', solid: false },
  scheduled_event: { ground: 'bg-tint-neutral-bg', ink: 'text-tint-neutral-ink', tone: 'amber', solid: false },
  commercial_evidence: { ground: 'bg-tint-blue-bg', ink: 'text-tint-blue-ink', tone: 'blue', solid: false },
};

function FactTile({ fact }: { fact: CapturedFact }) {
  const tile = (className: string, children: ReactNode, style?: React.CSSProperties) => (
    <span
      aria-hidden="true"
      className={`inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] text-white ${className}`}
      style={style}
    >
      {children}
    </span>
  );
  switch (fact.kind) {
    case 'stakeholder':
      return tile('font-display text-[11px] font-bold', monogramInitials(fact.name || '?'), { background: 'linear-gradient(135deg,#7B1FA2,#C2185B)' });
    case 'commitment':
      return tile('bg-tint-green-solid', <Clock className="h-[15px] w-[15px]" strokeWidth={2.4} />);
    case 'objection':
      return tile('bg-tint-amber-solid', <AlertTriangle className="h-[15px] w-[15px]" strokeWidth={2.4} />);
    case 'opportunity_value':
      return tile('bg-tint-cyan-ink', <Coins className="h-[15px] w-[15px]" strokeWidth={2.4} />);
    case 'scheduled_event':
      return tile('bg-tint-amber-solid', <CalendarDays className="h-[15px] w-[15px]" strokeWidth={2.4} />);
    case 'commercial_evidence':
    default:
      return tile('bg-brand-blue', <Sparkles className="h-[15px] w-[15px]" strokeWidth={2.4} />);
  }
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
 * The record each proposal would write, in words - the "what it did to the
 * record" half of a row, named after the destination `commitCapturedFacts`
 * actually sends it to.
 */
function whatItDoes(fact: CapturedFact): string {
  const where = fact.target.opportunityName || fact.target.accountName || 'this customer';
  switch (fact.kind) {
    case 'objection':
      return `Opens on the objection ledger · ${where}`;
    case 'stakeholder':
      return `New person at ${fact.target.accountName || 'this customer'}`;
    case 'commitment':
      return fact.party === 'self' ? 'Joins your commitments' : 'Tracked as something you are waiting for';
    case 'opportunity_value':
      return fact.target.opportunityName ? `Sets the value of ${fact.target.opportunityName}` : 'Needs a deal before it can be saved';
    case 'scheduled_event':
      return 'Goes on your Plan for that day';
    case 'commercial_evidence':
      return `Recorded as evidence · ${where}`;
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
  const field = 'mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm';
  const label = 'text-[11px] font-bold uppercase tracking-wide text-muted';

  return (
    <div className="mx-[13px] mb-[11px] rounded-[11px] bg-white/80 p-2.5">
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
              <p className="mt-1 text-[11px] text-muted">
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
