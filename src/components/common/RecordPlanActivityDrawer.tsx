import { useMemo, useState } from 'react';
import { Building2, NotebookPen, UserPlus, Users } from 'lucide-react';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { PlanItem } from '../../utils/weeklyPlan';
import {
  ACTIVITY_CHANNELS,
  activityChannelSpec,
  isOutOfOfficeChannel,
  normalizeActivityChannel,
  type ActivityChannel,
} from '../../utils/activityChannel';
import {
  peopleForPlanAccount,
  planCompletionActivityDate,
  planCompletionNeedsPerson,
  planCompletionProblems,
  planItemAccountName,
  type PlanCompletionPerson,
} from '../../utils/planCompletionLog';
import { formatSafeBusinessDate, todayDateKey } from '../../utils/safeDate';
import { RecordDrawer } from '../ui/RecordDrawer';
import { Monogram } from '../ui/daylight';
import { ghostPillClass, primaryPillClass } from '../ui/daylightStyles';

export type PlanPersonOption = { name: string; roleTitle: string; accountName: string };

export type RecordPlanActivityValues = {
  note: string;
  channel: ActivityChannel | '';
  person: PlanCompletionPerson | null;
  /** The person is not a stakeholder yet and is added to the customer as one. */
  personIsNew: boolean;
};

const NEW_PERSON = '__new__';

/**
 * Finishing a plan item, as the record of what happened.
 *
 * The box on the board used to mark the line done and then offer - unchecked -
 * to write something down. Now the box opens this, and the line is done when
 * this is saved: how it happened, who it was with, and what they said. A touch
 * on a customer has to name a person at that customer, picked from the people
 * already on the record or added to it here, so every visit and call on the
 * plan lands on Activity, on the account and on the stakeholder it was with.
 */
export function RecordPlanActivityDrawer({
  item,
  opportunities,
  people,
  saving,
  error,
  onSave,
  onClose,
}: {
  item: PlanItem;
  opportunities: CrmLiteOpportunity[];
  /** Everyone the workspace can name, with the customer they belong to. */
  people: PlanPersonOption[];
  saving: boolean;
  error: string;
  onSave: (values: RecordPlanActivityValues) => void;
  onClose: () => void;
}) {
  const accountName = planItemAccountName(item, opportunities);
  const candidates = useMemo(
    () => peopleForPlanAccount(people, accountName, item.contactName || ''),
    [accountName, item.contactName, people],
  );
  const [channel, setChannel] = useState<ActivityChannel | ''>(normalizeActivityChannel(item.channel));
  const [note, setNote] = useState('');
  // The person already named on the line is who it was most likely with.
  const [choice, setChoice] = useState(() => {
    const named = candidates.find((person) => person.name === item.contactName);
    if (named) return named.name;
    return candidates.length === 0 ? NEW_PERSON : '';
  });
  const [newName, setNewName] = useState(() => (
    candidates.some((person) => person.name === item.contactName) ? '' : (item.contactName || '')
  ));
  const [newRoleTitle, setNewRoleTitle] = useState('');

  const activityDate = planCompletionActivityDate(item, todayDateKey());
  const needsPerson = planCompletionNeedsPerson(item, opportunities, channel);
  const dayOff = isOutOfOfficeChannel(channel);
  const chosen = choice === NEW_PERSON ? null : candidates.find((person) => person.name === choice) || null;
  const person: PlanCompletionPerson | null = !needsPerson
    ? null
    : choice === NEW_PERSON
      ? (newName.trim() ? { name: newName.trim(), roleTitle: newRoleTitle.trim() } : null)
      : chosen ? { name: chosen.name, roleTitle: chosen.roleTitle } : null;
  const problems = planCompletionProblems({ item, note, channel, person, opportunities, activityDate: item.date });

  const save = () => {
    if (problems.length > 0 || saving) return;
    onSave({ note: note.trim(), channel, person, personIsNew: needsPerson && choice === NEW_PERSON });
  };

  return (
    <RecordDrawer
      eyebrow="Record the activity"
      title={item.label}
      label={`Record ${item.label}`}
      onClose={onClose}
      meta={(
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>{formatSafeBusinessDate(item.date)}</span>
          {accountName && !dayOff && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-semibold text-tint-neutral-ink">
                <Building2 className="h-3.5 w-3.5" /> {accountName}
              </span>
            </>
          )}
        </p>
      )}
      footer={(
        <>
          <button type="button" onClick={save} disabled={problems.length > 0 || saving} className={primaryPillClass}>
            <NotebookPen className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save and mark done'}
          </button>
          <button type="button" onClick={onClose} className={ghostPillClass}>Not now</button>
          {problems.length > 0 && (
            <p className="w-full text-xs text-muted">Still needed: {problems.join(' ')}</p>
          )}
          {error && <p role="alert" className="w-full text-xs font-semibold text-tint-red-solid">{error}</p>}
        </>
      )}
    >
      <label className="block">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">How it happened</span>
        <select
          value={channel}
          onChange={(event) => setChannel((event.target.value || '') as ActivityChannel | '')}
          className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-ink outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
        >
          <option value="">Not stated</option>
          {ACTIVITY_CHANNELS.map((spec) => (
            <option key={spec.channel} value={spec.channel}>{spec.channel}</option>
          ))}
        </select>
        {activityChannelSpec(channel) && (
          <span className="mt-1 block text-xs leading-5 text-muted">{activityChannelSpec(channel)?.hint}</span>
        )}
      </label>

      {needsPerson ? (
        <fieldset>
          <legend className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">Who it was with at {accountName}</legend>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {candidates.map((candidate) => (
              <label
                key={candidate.name}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition focus-within:ring-2 focus-within:ring-brand-blue ${
                  choice === candidate.name ? 'bg-tint-blue-bg ring-1 ring-brand-blue/40' : 'bg-canvas hover:bg-line-soft'
                }`}
              >
                <input
                  type="radio"
                  name="plan-person"
                  checked={choice === candidate.name}
                  onChange={() => setChoice(candidate.name)}
                  className="sr-only"
                />
                <Monogram name={candidate.name} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{candidate.name}</span>
                  <span className="block truncate text-xs text-muted">{candidate.roleTitle || 'Role title not recorded'}</span>
                </span>
              </label>
            ))}
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition focus-within:ring-2 focus-within:ring-brand-blue ${
                choice === NEW_PERSON ? 'bg-tint-blue-bg ring-1 ring-brand-blue/40' : 'bg-canvas hover:bg-line-soft'
              }`}
            >
              <input type="radio" name="plan-person" checked={choice === NEW_PERSON} onChange={() => setChoice(NEW_PERSON)} className="sr-only" />
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-white text-brand-blue-dark">
                <UserPlus className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-ink">
                {candidates.length === 0 ? `Nobody is on record at ${accountName} yet - add who it was` : 'Someone not on record yet'}
              </span>
            </label>
          </div>
          {choice === NEW_PERSON && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-tint-neutral-ink">Name</span>
                <input
                  type="text"
                  value={newName}
                  autoFocus
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="As they introduce themselves"
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-tint-neutral-ink">Role title</span>
                <input
                  type="text"
                  value={newRoleTitle}
                  onChange={(event) => setNewRoleTitle(event.target.value)}
                  placeholder="Their job title, if you know it"
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
                />
              </label>
              <p className="text-xs leading-5 text-muted sm:col-span-2">
                Added to {accountName} as a stakeholder with the buying role left Unknown - Memoire does not guess who is Champion or Economic Buyer.
              </p>
            </div>
          )}
        </fieldset>
      ) : (
        <p className="flex items-start gap-2.5 rounded-xl bg-canvas px-3.5 py-3 text-xs leading-5 text-tint-neutral-ink">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          {dayOff
            ? 'A day out of the office reaches no customer, so there is nobody to name and no customer clock moves.'
            : 'Internal work - this line names no customer, so there is nobody to name and no deal moves.'}
        </p>
      )}

      <label className="block">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">What happened</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={5}
          placeholder="What was said, what they asked for next, and anything that changes the deal."
          className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm leading-6 text-ink outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
        />
      </label>

      {needsPerson && (
        <p className="text-xs leading-5 text-muted">
          Saved as a touch on {accountName}{person ? ` with ${person.name}` : ''}, dated {formatSafeBusinessDate(activityDate)}
          {activityDate === item.date ? ' - the day it sat on the plan' : ' - today, because it was finished ahead of its day'}
          {' '}- so the going-silent watch and the stakeholder&apos;s last interaction both move.
        </p>
      )}
    </RecordDrawer>
  );
}
