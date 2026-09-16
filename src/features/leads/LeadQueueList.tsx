import { ArrowRight, CalendarClock, XCircle } from 'lucide-react';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { LeadEvidenceItem, LeadQueueState, LeadRow } from '../../utils/leadQueue';
import { leadQueueStateLabels } from '../../utils/leadQueue';
import { formatCurrencyAmount } from '../../utils/money';
import { formatSafeBusinessDate, isBusinessDateOverdue } from '../../utils/safeDate';
import { MicroPill, Monogram, Panel, SegmentMeter } from '../../components/ui/daylight';
import { ghostPillClass, primaryPillClass, type DaylightTone } from '../../components/ui/daylightStyles';

/**
 * The lead queue, as rows of work.
 *
 * Not a CRM list. Every column answers something the operator has to decide
 * with - where it came from, whether anybody has spoken to them, what evidence
 * exists, what is scheduled - and the three things you can do with a lead are
 * on the row rather than two clicks inside it.
 *
 * ## The desktop table and the phone cards
 *
 * One component, two renderings, one semantic hierarchy. The table is the
 * existing Daylight record table, unchanged in language from Accounts and
 * Opportunities. Below `lg` it becomes a list of cards that say the same things
 * in the same order with the same tokens - account, what it is, who, state,
 * evidence, next step, actions - because a 980px table on a 390px screen is a
 * horizontal scrollbar pretending to be a design.
 *
 * Both are rendered from the same `rows`, so they can never disagree. This is
 * deliberately not extracted into a shared primitive yet: it is the first dense
 * list in the product to need it, and one use is not a pattern. If a second
 * list adopts it, this is the shape to lift into Daylight.
 */

const STATE_TONE: Record<LeadQueueState, DaylightTone> = {
  new: 'blue',
  'needs-action': 'amber',
  'going-quiet': 'red',
  ready: 'green',
  nurture: 'neutral',
};

export type LeadQueueActions = {
  onOpen: (opportunity: CrmLiteOpportunity) => void;
  onQualify: (opportunity: CrmLiteOpportunity) => void;
  onNurture: (opportunity: CrmLiteOpportunity) => void;
  onDisqualify: (opportunity: CrmLiteOpportunity) => void;
  /** The lead whose qualify is being saved, so its button can say so. */
  busyId: string;
};

export function LeadQueueList({
  rows,
  caption,
  actions,
}: {
  rows: LeadRow[];
  /** What the list is showing, under the heading. One sentence. */
  caption: string;
  actions: LeadQueueActions;
}) {
  return (
    <Panel className="min-w-0 overflow-hidden" aria-label="Leads">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-bold text-ink">Leads to work</h2>
          <p className="mt-0.5 text-xs text-muted">{caption}</p>
        </div>
        <span className="font-mono text-xs text-tint-neutral-ink">
          {rows.length} {rows.length === 1 ? 'lead' : 'leads'}
        </span>
      </div>

      {/* Desktop: the record table language every other book in the product
          uses. `lg` rather than `md`, because eight columns need the room. */}
      <div className="record-table-scroller hidden lg:block">
        <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 bg-bar text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted">
            <tr>
              <th scope="col" className="border-b border-line px-5 py-2.5">Lead</th>
              <th scope="col" className="border-b border-line px-3 py-2.5">State</th>
              <th scope="col" className="border-b border-line px-3 py-2.5">Source</th>
              <th scope="col" className="border-b border-line px-3 py-2.5">Last touch</th>
              <th scope="col" className="border-b border-line px-3 py-2.5">Evidence</th>
              <th scope="col" className="border-b border-line px-3 py-2.5">Next step</th>
              <th scope="col" className="border-b border-line px-3 py-2.5 text-right">Value</th>
              <th scope="col" className="border-b border-line px-5 py-2.5 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {rows.map((row) => (
              <LeadTableRow key={row.opportunity.id} row={row} actions={actions} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone and tablet: the same fields, stacked. */}
      <ul className="divide-y divide-line-soft lg:hidden">
        {rows.map((row) => (
          <li key={row.opportunity.id}>
            <LeadCard row={row} actions={actions} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function LeadTableRow({ row, actions }: { row: LeadRow; actions: LeadQueueActions }) {
  const { opportunity } = row;
  return (
    <tr
      onClick={() => actions.onOpen(opportunity)}
      className="group cursor-pointer align-top transition hover:bg-canvas"
    >
      <td className="px-5 py-3">
        {/* The name is a real button so the row is reachable from a keyboard;
            the row click is the pointer shortcut for the same thing. */}
        <LeadIdentity row={row} onOpen={() => actions.onOpen(opportunity)} />
      </td>
      <td className="px-3 py-3">
        <LeadStateCell row={row} />
      </td>
      <td className="px-3 py-3">
        <LeadSourceCell row={row} />
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <LeadTouchCell row={row} />
      </td>
      <td className="px-3 py-3">
        <LeadEvidenceCell row={row} />
      </td>
      <td className="px-3 py-3">
        <LeadNextStepCell row={row} />
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs font-bold text-ink">
        {opportunity.estimatedValue
          ? formatCurrencyAmount(opportunity.estimatedValue, opportunity.currency)
          : <span className="text-muted">Not sized</span>}
      </td>
      <td className="px-5 py-3 text-right">
        <LeadRowActions row={row} actions={actions} align="end" />
      </td>
    </tr>
  );
}

/**
 * One lead on a phone.
 *
 * Not one big button: a button may only contain phrasing content, and wrapping a
 * definition list in one produced markup a screen reader flattens into a single
 * run-on label. The customer name is the link into the record, the fields are
 * a plain list, and the actions sit underneath - the same three things the
 * table row offers, in the same order.
 */
function LeadCard({ row, actions }: { row: LeadRow; actions: LeadQueueActions }) {
  const { opportunity } = row;
  return (
    <div className="px-4 py-4">
      <div>
        <LeadIdentity row={row} onOpen={() => actions.onOpen(opportunity)} />
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <LeadStateCell row={row} />
        </div>
        <p className="mt-2 text-xs leading-5 text-tint-neutral-ink">{row.stateReason}</p>
        <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
          <div className="min-w-0">
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Source</dt>
            <dd className="mt-0.5"><LeadSourceCell row={row} /></dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Last touch</dt>
            <dd className="mt-0.5"><LeadTouchCell row={row} /></dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Evidence</dt>
            <dd className="mt-1"><LeadEvidenceCell row={row} /></dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Next step</dt>
            <dd className="mt-0.5"><LeadNextStepCell row={row} /></dd>
          </div>
        </dl>
      </div>
      <LeadRowActions row={row} actions={actions} align="start" className="mt-3" />
    </div>
  );
}

function LeadIdentity({ row, onOpen }: { row: LeadRow; onOpen?: () => void }) {
  const { opportunity } = row;
  const accountLabel = opportunity.accountName || 'No account named';
  return (
    <div className="flex items-start gap-3">
      <Monogram name={opportunity.accountName || opportunity.opportunityName || '?'} size={32} />
      <div className="min-w-0">
        {onOpen ? (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onOpen(); }}
            className="block max-w-full truncate text-left lg:max-w-[240px] font-bold text-ink underline-offset-2 hover:underline"
            title={opportunity.accountName}
          >
            {accountLabel}
          </button>
        ) : (
          <p className="truncate font-bold text-ink lg:max-w-[240px]" title={opportunity.accountName}>
            {accountLabel}
          </p>
        )}
        <p className="truncate text-xs text-tint-neutral-ink lg:max-w-[240px]" title={opportunity.opportunityName}>
          {opportunity.opportunityName || 'Untitled'}
        </p>
        <p className={`text-[11px] ${row.contactName ? 'text-muted' : 'font-semibold text-tint-amber-solid'}`}>
          {row.contactName || 'Nobody named yet'}
        </p>
        {row.closed && (
          <p className="text-[11px] font-semibold text-muted">
            {opportunity.status === 'Lost' ? 'Disqualified' : opportunity.status}
          </p>
        )}
      </div>
    </div>
  );
}

function LeadStateCell({ row }: { row: LeadRow }) {
  return (
    <>
      <MicroPill tone={STATE_TONE[row.state]}>{leadQueueStateLabels[row.state]}</MicroPill>
      {/* The reason sits under the pill on desktop and beside it on a card, so
          colour is never the only thing carrying the state. */}
      <p className="mt-1 hidden max-w-[190px] text-[11px] leading-4 text-muted lg:block">{row.stateReason}</p>
    </>
  );
}

function LeadSourceCell({ row }: { row: LeadRow }) {
  if (!row.source.label) {
    return <span className="text-xs italic text-muted">Not recorded</span>;
  }
  return (
    <>
      <span className="inline-block rounded-full bg-chip px-2 py-[3px] text-[11px] font-semibold text-tint-neutral-ink">
        {row.source.label}
      </span>
      {row.source.detail && (
        <p className="mt-0.5 max-w-[170px] truncate text-[11px] text-muted" title={row.source.detail}>
          {row.source.detail}
        </p>
      )}
    </>
  );
}

function LeadTouchCell({ row }: { row: LeadRow }) {
  const quiet = row.silence.status === 'silent' || row.silence.status === 'at-risk';
  return (
    <>
      <p className={`text-xs font-semibold ${row.lastTouchDate ? 'text-ink' : 'text-tint-amber-solid'}`}>
        {row.lastTouchDate ? formatSafeBusinessDate(row.lastTouchDate) : 'No touch yet'}
      </p>
      {quiet && row.silence.daysQuiet !== null && (
        <p className={`text-[11px] font-bold ${row.silence.status === 'silent' ? 'text-tint-red-solid' : 'text-tint-amber-solid'}`}>
          Quiet {row.silence.daysQuiet}d
        </p>
      )}
      {!row.lastTouchDate && row.ageDays !== null && (
        <p className="text-[11px] text-muted">
          {row.ageDays === 0 ? 'Added today' : `Added ${row.ageDays}d ago`}
        </p>
      )}
    </>
  );
}

/**
 * Five cells, one per piece of evidence, lit where the evidence exists.
 *
 * `SegmentMeter` rather than a number, and the reason is the product argument:
 * "how much of a known set" is exactly what this is, and a score out of 100
 * would invite sorting on a calibration nobody has. The title lists the five by
 * name so the meter is readable without hovering every row.
 */
function LeadEvidenceCell({ row }: { row: LeadRow }) {
  const { qualification } = row;
  const tone = qualification.readiness === 'Ready to qualify'
    ? 'green'
    : qualification.readiness === 'Engaged' ? 'amber' : 'red';
  return (
    <span title={qualification.evidence.map(describeEvidence).join('\n')}>
      <SegmentMeter
        total={qualification.total}
        filled={qualification.present}
        filledCells={qualification.evidence.map((item) => item.present)}
        tone={tone}
        label={`${qualification.present} of ${qualification.total} - ${qualification.evidence.filter((item) => item.present).map((item) => item.label).join(', ') || 'nothing recorded yet'}`}
      />
      <span className="mt-1 block text-[11px] font-semibold text-tint-neutral-ink">
        {qualification.readiness}
      </span>
    </span>
  );
}

function describeEvidence(item: LeadEvidenceItem) {
  return `${item.present ? '✓' : '—'} ${item.label}: ${item.detail}`;
}

function LeadNextStepCell({ row }: { row: LeadRow }) {
  const { opportunity } = row;
  if (row.nurture.nurturing) {
    return (
      <>
        <p className="flex items-center gap-1 text-xs font-semibold text-ink">
          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
          Revisit {formatSafeBusinessDate(row.nurture.revisitDate)}
        </p>
        {row.nurture.reason && (
          <p className="max-w-[200px] truncate text-[11px] text-muted" title={row.nurture.reason}>
            {row.nurture.reason}
          </p>
        )}
      </>
    );
  }
  return (
    <>
      <p
        className={`line-clamp-2 text-xs font-semibold lg:max-w-[200px] ${opportunity.nextAction ? 'text-ink' : 'text-tint-amber-solid'}`}
        title={opportunity.nextAction}
      >
        {opportunity.nextAction || 'No next step'}
      </p>
      {opportunity.nextActionDate && (
        <p className={`text-[11px] ${isBusinessDateOverdue(opportunity.nextActionDate) ? 'font-bold text-tint-red-solid' : 'text-muted'}`}>
          {formatSafeBusinessDate(opportunity.nextActionDate)}
          {isBusinessDateOverdue(opportunity.nextActionDate) ? ' · overdue' : ''}
        </p>
      )}
    </>
  );
}

/**
 * The three answers a lead needs, on the row.
 *
 * Qualify is the primary because it is the outcome the whole queue is for.
 * Nurture and Disqualify are quiet pills - they are both "not now", and giving
 * either of them weight would make parking a lead look like an achievement.
 */
function LeadRowActions({
  row,
  actions,
  align,
  className = '',
}: {
  row: LeadRow;
  actions: LeadQueueActions;
  align: 'start' | 'end';
  className?: string;
}) {
  if (row.closed) return null;
  const { opportunity } = row;
  const busy = actions.busyId === opportunity.id;
  const name = opportunity.accountName || opportunity.opportunityName || 'this lead';

  return (
    <div
      className={`flex flex-wrap gap-2 ${align === 'end' ? 'justify-end' : 'justify-start'} ${className}`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => actions.onQualify(opportunity)}
        disabled={busy}
        className={`${primaryPillClass} px-3.5 py-1.5 text-xs`}
        title="Move it to Discovery. Everything recorded on it comes with it."
      >
        {busy ? 'Moving…' : 'Qualify'}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">{name}</span>
      </button>
      <button
        type="button"
        onClick={() => actions.onNurture(opportunity)}
        className={`${ghostPillClass} px-3 py-1.5 text-xs`}
        title="Park it until a date. It comes back on its own."
      >
        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
        {row.nurture.nurturing ? 'Reschedule' : 'Nurture'}
        <span className="sr-only">{name}</span>
      </button>
      <button
        type="button"
        onClick={() => actions.onDisqualify(opportunity)}
        className={`${ghostPillClass} px-3 py-1.5 text-xs`}
        title="Close it, with the reason."
      >
        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Disqualify
        <span className="sr-only">{name}</span>
      </button>
    </div>
  );
}
