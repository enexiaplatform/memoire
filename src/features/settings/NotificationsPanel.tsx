import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { isSupabaseConfigured } from '../../lib/demoMode';

/**
 * Where the operator decides what reaches them when the app is closed.
 *
 * Both are off by default and stay off until somebody asks. A product that
 * starts emailing on signup has decided on the user's behalf that its own
 * output is worth their inbox, and the first thing an unasked-for email costs
 * is the credibility of the one that mattered.
 *
 * The send hour is local. It is stored as a plain UTC offset taken from this
 * browser rather than a timezone name, because that is what the scheduler can
 * do arithmetic with, and because "7am" has to mean 7am where the operator is -
 * a distributor in UTC+7 reading a digest at midnight is not being served.
 */

type Preferences = {
  daily: boolean;
  weekly: boolean;
  hour: number;
  offsetMinutes: number;
};

const DEFAULTS: Preferences = { daily: false, weekly: false, hour: 7, offsetMinutes: 0 };

export function NotificationsPanel() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const browserOffset = -new Date().getTimezoneOffset();

  useEffect(() => {
    let active = true;
    if (!user || !isSupabaseConfigured) {
      setLoading(false);
      return () => { active = false; };
    }

    void supabase
      .from('user_profiles')
      .select('daily_digest_enabled, weekly_review_enabled, digest_send_hour, digest_utc_offset_minutes')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError('Could not read your notification settings.');
        if (data) {
          setPreferences({
            daily: Boolean(data.daily_digest_enabled),
            weekly: Boolean(data.weekly_review_enabled),
            hour: typeof data.digest_send_hour === 'number' ? data.digest_send_hour : 7,
            offsetMinutes: typeof data.digest_utc_offset_minutes === 'number' ? data.digest_utc_offset_minutes : browserOffset,
          });
        }
        setLoading(false);
      });

    return () => { active = false; };
  }, [browserOffset, user]);

  const save = async (next: Preferences) => {
    setPreferences(next);
    setMessage('');
    setError('');
    if (!user) return;

    // The offset is always taken from the browser on save rather than kept from
    // whatever it was: somebody who moved country should get their new morning,
    // and nobody is going to come here to update a number.
    const { error: saveError } = await supabase
      .from('user_profiles')
      .update({
        daily_digest_enabled: next.daily,
        weekly_review_enabled: next.weekly,
        digest_send_hour: next.hour,
        digest_utc_offset_minutes: browserOffset,
      })
      .eq('id', user.id);

    if (saveError) {
      setError('That did not save. Your notification settings are unchanged.');
      return;
    }
    setMessage(next.daily || next.weekly
      ? `Saved. Sending at ${formatHour(next.hour)} your time.`
      : 'Saved. Memoire will not email you.');
  };

  if (!isSupabaseConfigured || !user) {
    return (
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-start gap-2.5">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
          <div>
            <p className="text-sm font-semibold text-navy">Email reminders</p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
              Memoire can send a short morning digest of what is overdue, what has gone quiet and where money is
              stuck - and a Monday note on what last week produced. Both need an account, because both are sent from
              the records in it. Sign in to turn them on.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-2.5">
        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy">Email reminders</p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
            Memoire only reaches you when you open it. These two emails are the exception, and they only arrive when
            there is something to say - a morning with nothing overdue sends nothing.
          </p>

          <div className="mt-4 space-y-3">
            <Toggle
              label="Daily digest"
              description="What is past due, which live deals have gone quiet, and which quotes are past a promised date."
              checked={preferences.daily}
              disabled={loading}
              onChange={(checked) => save({ ...preferences, daily: checked })}
            />
            <Toggle
              label="Monday review"
              description="What closed last week and what is still open, so the week starts against a number rather than a feeling."
              checked={preferences.weekly}
              disabled={loading}
              onChange={(checked) => save({ ...preferences, weekly: checked })}
            />
          </div>

          {(preferences.daily || preferences.weekly) && (
            <label className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-navy">Send at</span>
              <select
                value={preferences.hour}
                disabled={loading}
                onChange={(event) => save({ ...preferences, hour: Number(event.target.value) })}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm font-semibold text-navy"
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>{formatHour(hour)}</option>
                ))}
              </select>
              <span className="text-gray-500">
                your time ({formatOffset(browserOffset)})
              </span>
            </label>
          )}

          {message && <p className="mt-3 text-sm font-semibold text-emerald-700">{message}</p>}
          {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}

          <p className="mt-3 text-xs leading-5 text-gray-400">
            Every email carries a one-click way to stop it, and neither one contains a tracking pixel. What they say
            is built from your own records when they are sent.
          </p>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-brand-blue"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-navy">{label}</span>
        <span className="block text-xs leading-5 text-gray-500">{description}</span>
      </span>
    </label>
  );
}

function formatHour(hour: number) {
  const suffix = hour < 12 ? 'am' : 'pm';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${suffix}`;
}

function formatOffset(minutes: number) {
  const sign = minutes >= 0 ? '+' : '-';
  const absolute = Math.abs(minutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const rest = String(absolute % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${rest}`;
}
