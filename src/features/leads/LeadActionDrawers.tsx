import { useState } from 'react';
import { CalendarClock, Save, UserPlus, XCircle } from 'lucide-react';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import {
  leadDisqualifyReasons,
  leadSources,
  type LeadDisqualifyReason,
  type LeadSource,
} from '../../utils/leadQueue';
import { addDaysToBusinessDate, formatSafeBusinessDate, todayDateKey } from '../../utils/safeDate';
import { RecordDrawer } from '../../components/ui/RecordDrawer';
import { Field, SelectField, TextArea } from '../../components/ui/daylightForm';
import { ghostPillClass, primaryPillClass } from '../../components/ui/daylightStyles';
import type { NewLeadInput } from './newLead';

/**
 * The two answers that are not "qualify".
 *
 * Both are deliberately small. Nurturing a lead is one date and, if you want,
 * one sentence; disqualifying is one reason and, if you want, one sentence.
 * Asking for more would be asking a seller to do CRM administration at the exact
 * moment they have decided this conversation is not worth their time - which is
 * how a queue fills with leads nobody will ever close out.
 */

/* ------------------------------------------------------------------ nurture */

/** The shortcuts a distributor actually reaches for. */
const NURTURE_PRESETS: { label: string; days: number }[] = [
  { label: 'In a month', days: 30 },
  { label: 'In a quarter', days: 90 },
  { label: 'In six months', days: 182 },
];

export function NurtureLeadDrawer({
  opportunity,
  saving,
  onClose,
  onSave,
}: {
  opportunity: CrmLiteOpportunity;
  saving: boolean;
  onClose: () => void;
  onSave: (input: { nurturedUntil: string; nurtureReason: string }) => void;
}) {
  const [revisitDate, setRevisitDate] = useState(
    () => opportunity.nurturedUntil || addDaysToBusinessDate(todayDateKey(), 90),
  );
  const [reason, setReason] = useState(opportunity.nurtureReason || '');

  const name = opportunity.accountName || opportunity.opportunityName || 'this lead';

  return (
    <RecordDrawer
      eyebrow="Leads"
      title={`Park ${name} until a date`}
      label={`Nurture ${name}`}
      onClose={onClose}
      footer={(
        <>
          <button
            type="button"
            onClick={() => onSave({ nurturedUntil: revisitDate, nurtureReason: reason.trim() })}
            disabled={saving || !revisitDate}
            className={primaryPillClass}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? 'Saving…' : 'Nurture'}
          </button>
          {opportunity.nurturedUntil && (
            <button
              type="button"
              onClick={() => onSave({ nurturedUntil: '', nurtureReason: '' })}
              disabled={saving}
              className={ghostPillClass}
            >
              Bring it back now
            </button>
          )}
          <button type="button" onClick={onClose} className={ghostPillClass}>Cancel</button>
        </>
      )}
    >
      <p className="rounded-[13px] bg-tint-blue-bg px-4 py-3 text-[13px] leading-6 text-tint-blue-ink">
        Nurture is for a good prospect whose timing is wrong. The lead stays exactly as it is - nothing recorded on it is
        lost - and it leaves the working queue until the date you choose, then comes back on its own a few days early.
      </p>

      <div>
        <p className="text-[12.5px] font-bold text-ink">Come back to it</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {NURTURE_PRESETS.map((preset) => {
            const date = addDaysToBusinessDate(todayDateKey(), preset.days);
            const active = date === revisitDate;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => setRevisitDate(date)}
                aria-pressed={active}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  active ? 'bg-ink text-white' : 'bg-chip text-tint-neutral-ink hover:text-ink'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <Field label="Revisit date" type="date" value={revisitDate} onChange={setRevisitDate} required />
      {revisitDate && (
        <p className="-mt-2 text-[11.5px] text-muted">
          It returns to the queue around {formatSafeBusinessDate(revisitDate)}.
        </p>
      )}

      <TextArea
        label="Why now is wrong"
        value={reason}
        onChange={setReason}
        rows="min-h-[72px]"
        hint="Optional, and worth one line - it is what you will read when it comes back."
        placeholder="What has to be true before this is worth picking up again"
      />
    </RecordDrawer>
  );
}

/* --------------------------------------------------------------- disqualify */

export function DisqualifyLeadDrawer({
  opportunity,
  saving,
  onClose,
  onSave,
}: {
  opportunity: CrmLiteOpportunity;
  saving: boolean;
  onClose: () => void;
  onSave: (input: { reason: LeadDisqualifyReason; note: string }) => void;
}) {
  const [reason, setReason] = useState<LeadDisqualifyReason | ''>('');
  const [note, setNote] = useState('');
  const name = opportunity.accountName || opportunity.opportunityName || 'this lead';

  return (
    <RecordDrawer
      eyebrow="Leads"
      title={`Why is ${name} out?`}
      label={`Disqualify ${name}`}
      onClose={onClose}
      footer={(
        <>
          <button
            type="button"
            onClick={() => reason && onSave({ reason, note: note.trim() })}
            disabled={saving || !reason}
            className={primaryPillClass}
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
            {saving ? 'Saving…' : 'Disqualify'}
          </button>
          <button type="button" onClick={onClose} className={ghostPillClass}>Cancel</button>
        </>
      )}
    >
      <p className="rounded-[13px] bg-tint-neutral-bg px-4 py-3 text-[13px] leading-6 text-tint-neutral-ink">
        The reason is the point. A lead closed without one teaches the book nothing about which leads are worth having -
        and "which source keeps producing leads with no project" is a question Review can only answer from these.
      </p>

      <fieldset>
        <legend className="text-[12.5px] font-bold text-ink">Reason *</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {leadDisqualifyReasons.map((option) => {
            const active = option === reason;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setReason(option)}
                aria-pressed={active}
                className={`rounded-xl px-3 py-2 text-left text-[13px] font-semibold transition ${
                  active
                    ? 'bg-ink text-white'
                    : 'bg-chip text-tint-neutral-ink hover:text-ink'
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </fieldset>

      <TextArea
        label="Anything worth remembering"
        value={note}
        onChange={setNote}
        rows="min-h-[72px]"
        hint="Optional. It is saved on the close-out with the reason, and it is what you will read if they come back."
        placeholder="What you learned, and what would have to change"
      />

      <p className="text-[11.5px] leading-5 text-muted">
        The record is kept. It is closed as Lost with this reason, so it leaves the queue, stays searchable, and counts
        in Review's lead learning.
      </p>
    </RecordDrawer>
  );
}

/* ----------------------------------------------------------------- add lead */

/**
 * A new lead, in eight short fields and no more.
 *
 * Everything here is either identity or the thing that makes the lead come back
 * to you. Only the customer is required. There is no value, no close date, no stage, no forecast category: a
 * lead that has not shown a need cannot honestly carry any of them, and asking
 * for them at the door is how a queue ends up full of invented numbers.
 */
export function AddLeadDrawer({
  form,
  saving,
  message,
  accountOptions,
  onChange,
  onClose,
  onSave,
}: {
  form: NewLeadInput;
  saving: boolean;
  message: string;
  accountOptions: string[];
  onChange: (next: NewLeadInput) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const update = <Key extends keyof NewLeadInput>(key: Key, value: NewLeadInput[Key]) => (
    onChange({ ...form, [key]: value })
  );

  return (
    <RecordDrawer
      eyebrow="Leads"
      title="New lead"
      label="Add a lead"
      onClose={onClose}
      footer={(
        <>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !form.accountName.trim()}
            className={primaryPillClass}
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {saving ? 'Saving…' : 'Add lead'}
          </button>
          <button type="button" onClick={onClose} className={ghostPillClass}>Cancel</button>
          {message && <span className="text-[12.5px] font-semibold text-tint-neutral-ink">{message}</span>}
        </>
      )}
    >
      <datalist id="lead-account-options">
        {accountOptions.map((option) => <option key={option} value={option} />)}
      </datalist>

      <Field
        label="Customer"
        value={form.accountName}
        onChange={(value) => update('accountName', value)}
        listId="lead-account-options"
        required
        autoFocus
        hint="The company. Type to match one you already have, or write a new one."
      />
      <Field
        label="What it could be about"
        value={form.opportunityName}
        onChange={(value) => update('opportunityName', value)}
        placeholder="The project, line or need in a few words"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Who you spoke to"
          value={form.contactName}
          onChange={(value) => update('contactName', value)}
          hint="Saved as a person on the lead, with no role assumed."
        />
        <Field
          label="Their job"
          value={form.contactRole}
          onChange={(value) => update('contactRole', value)}
          placeholder="As they described it"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectField
          label="Source"
          value={form.leadSource}
          options={leadSources}
          onChange={(value) => update('leadSource', value as LeadSource | '')}
          placeholderOption="Not stated"
        />
        <Field
          label="Source detail"
          value={form.leadSourceDetail}
          onChange={(value) => update('leadSourceDetail', value)}
          placeholder="The event, the person who referred, the tender number"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Next step"
          value={form.nextAction}
          onChange={(value) => update('nextAction', value)}
          placeholder="What you said you would do"
        />
        <Field
          label="By when"
          type="date"
          value={form.nextActionDate}
          onChange={(value) => update('nextActionDate', value)}
        />
      </div>

      <p className="flex items-start gap-2 rounded-[13px] bg-tint-neutral-bg px-4 py-3 text-[12.5px] leading-5 text-tint-neutral-ink">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        A lead with nothing scheduled will go quiet, and the queue will tell you so. A next step is the one field worth
        filling in now.
      </p>
    </RecordDrawer>
  );
}
