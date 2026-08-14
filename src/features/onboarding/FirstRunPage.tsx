import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, FileSpreadsheet, PenLine, Sparkles } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { NoIndex } from '../../components/marketing/PageSeo';
import { BrandWordmark } from '../../components/brand/BrandWordmark';
import { CURRENCY_NAMES, SUPPORTED_CURRENCIES, getReportingCurrency } from '../../utils/money';
import { saveReportingCurrencyPreference } from '../../services/workspacePreferences';
import { loadSampleDataset } from '../../utils/sampleData';
import { trackProductEvent } from '../../utils/productAnalytics';
import { buildFirstWeekPath } from '../../utils/firstWeekPath';
import { completeFirstRun, firstRunUserKey, markFirstRunStarted, type FirstRunChoice } from '../../utils/firstRun';

/**
 * The first sixty seconds.
 *
 * This screen exists because the product had no answer to "what is this and
 * what do you want from me". A new account went from the verify-email page to a
 * Today built for a workspace that has records, and the only guidance - the
 * First Week Path strip - was gated on already having some. The welcome that
 * was supposed to cover the gap (`OnboardingModal`) mounted inactive and could
 * only be woken from Settings, and the tour it then ran walked through routes
 * that had since been retired.
 *
 * Three things happen here and nothing else:
 *
 *   1. The loop, named. Five beats, in the operator's language, so the shape of
 *      the product is known before any of it is touched.
 *   2. One question with a visible consequence. Reporting currency changes every
 *      number on every screen and cannot be inferred; nothing else asked here
 *      would earn its screen. There is deliberately no "what is your role", no
 *      team size, no goals - a survey that changes nothing is a toll booth.
 *   3. A door. Real work, a sample workspace, or a CSV the operator already has.
 *
 * Every act is skippable and the whole thing is one keystroke from over, because
 * the cost of a welcome nobody can leave is far higher than the cost of one
 * somebody skips. Settings can bring it back.
 *
 * The five beats are read from `buildFirstWeekPath` rather than written out
 * here. The welcome, the strip on Today and the coach are then physically
 * incapable of describing three different first weeks.
 */

type Act = 'loop' | 'currency' | 'door';

const ACTS: Act[] = ['loop', 'currency', 'door'];

export function FirstRunPage() {
  useDocumentTitle('Welcome to Memoire');
  const { user } = useAuth();
  const navigate = useNavigate();
  const userKey = firstRunUserKey(user);

  const [act, setAct] = useState<Act>('loop');
  const [currency, setCurrency] = useState(() => getReportingCurrency());
  const [busy, setBusy] = useState(false);

  const loop = useMemo(() => buildFirstWeekPath({ activities: [], opportunities: [], briefs: [] }).steps, []);
  const actIndex = ACTS.indexOf(act);

  useEffect(() => {
    markFirstRunStarted(userKey);
  }, [userKey]);

  const finish = (choice: FirstRunChoice, destination: string) => {
    completeFirstRun(userKey, choice);
    navigate(destination, { replace: true });
  };

  const skip = () => finish('skipped', '/app/today');

  const chooseSample = () => {
    setBusy(true);
    loadSampleDataset();
    trackProductEvent('demo_started', 'demo-local');
    finish('sample-workspace', '/app/today');
  };

  const advance = async () => {
    if (act === 'currency') {
      setBusy(true);
      // The browser copy is written synchronously inside this, so the next
      // screen already formats in the chosen currency even if the account write
      // is still in flight or the account is offline.
      await saveReportingCurrencyPreference(currency, user?.id).catch(() => undefined);
      setBusy(false);
    }
    const next = ACTS[actIndex + 1];
    if (next) setAct(next);
  };

  return (
    <>
      <NoIndex />
      <div className="min-h-screen bg-page">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-8 sm:px-8 sm:py-12">
          <header className="flex items-center justify-between gap-4">
            <BrandWordmark className="text-xl" />
            <button
              type="button"
              onClick={skip}
              className="rounded-full px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-white hover:text-navy"
            >
              Skip for now
            </button>
          </header>

          {/* Three segments, so the end is visible from the start. A welcome
              whose length is unknown is one people leave. */}
          <div className="mt-6 flex gap-1.5" aria-hidden="true">
            {ACTS.map((step, index) => (
              <span
                key={step}
                className={`h-1 flex-1 rounded-full transition-colors ${index <= actIndex ? 'bg-brand-blue' : 'bg-gray-200'}`}
              />
            ))}
          </div>
          <p className="sr-only" aria-live="polite">Step {actIndex + 1} of {ACTS.length}</p>

          <main className="flex flex-1 flex-col justify-center py-10">
            {act === 'loop' && (
              <section aria-labelledby="first-run-loop-heading">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Welcome to Memoire</p>
                <h1 id="first-run-loop-heading" className="mt-3 font-display text-3xl font-black leading-tight tracking-tight text-navy sm:text-4xl">
                  Record it once. Nothing goes quiet after that.
                </h1>
                <p className="mt-4 max-w-xl text-[15px] leading-7 text-gray-600">
                  Memoire is a personal commercial control tower. You write down what happened with a customer one
                  time, and it becomes that account&rsquo;s memory, the next commitment you owe, and the warning when
                  that commitment is about to be forgotten.
                </p>

                <ol className="mt-8 space-y-3">
                  {loop.map((step, index) => (
                    <li key={step.id} className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-[11px] font-black text-white">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-navy">{step.label}</p>
                        <p className="mt-0.5 text-[13px] leading-6 text-gray-500">{step.hint}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                <p className="mt-6 text-[13px] leading-6 text-gray-500">
                  That is the whole product. There is no system to set up first, and nothing on this screen is
                  configuration you will have to maintain.
                </p>
              </section>
            )}

            {act === 'currency' && (
              <section aria-labelledby="first-run-currency-heading">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">One question</p>
                <h1 id="first-run-currency-heading" className="mt-3 font-display text-3xl font-black leading-tight tracking-tight text-navy sm:text-4xl">
                  Which currency should Memoire report in?
                </h1>
                <p className="mt-4 max-w-xl text-[15px] leading-7 text-gray-600">
                  Record a deal, a quote or a cost in whatever currency it was agreed in. This is the one every total,
                  forecast and margin is shown back to you in. You can change it in Settings whenever you like.
                </p>

                <label className="mt-8 block max-w-sm">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Reporting currency</span>
                  <select
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value as typeof currency)}
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-[15px] font-semibold text-navy outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
                  >
                    {SUPPORTED_CURRENCIES.map((option) => (
                      <option key={option} value={option}>{option} — {CURRENCY_NAMES[option]}</option>
                    ))}
                  </select>
                </label>
              </section>
            )}

            {act === 'door' && (
              <section aria-labelledby="first-run-door-heading">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Where to start</p>
                <h1 id="first-run-door-heading" className="mt-3 font-display text-3xl font-black leading-tight tracking-tight text-navy sm:text-4xl">
                  Pick the one that matches your desk right now.
                </h1>
                <p className="mt-4 max-w-xl text-[15px] leading-7 text-gray-600">
                  Whichever you choose, a guide stays in the corner of the screen and tracks the five steps above as you
                  actually complete them.
                </p>

                <div className="mt-8 space-y-3">
                  <DoorCard
                    icon={<PenLine className="h-5 w-5" />}
                    title="Start with something real"
                    body="Capture one customer conversation you had this week. A pasted email, a call note, a line of text - about sixty seconds, and the loop is running on your own book."
                    action="Open Capture"
                    recommended
                    disabled={busy}
                    onClick={() => finish('real-work', '/app/capture')}
                  />
                  <DoorCard
                    icon={<Sparkles className="h-5 w-5" />}
                    title="Look around a worked example first"
                    body="A sample workspace with deals, orders and a week of history, so you can see a running control tower before you type anything. It is clearly labelled everywhere it appears, it never reaches your account, and one click clears it."
                    action="Load the sample workspace"
                    disabled={busy}
                    onClick={chooseSample}
                  />
                  <DoorCard
                    icon={<FileSpreadsheet className="h-5 w-5" />}
                    title="I already have a pipeline"
                    body="Bring accounts and opportunities in from a CSV export, then capture on top of what is already there."
                    action="Import a CSV"
                    disabled={busy}
                    onClick={() => finish('import-csv', '/app/opportunities?import=csv')}
                  />
                </div>
              </section>
            )}
          </main>

          <footer className="flex items-center justify-between gap-3 border-t border-gray-200 pt-5">
            <button
              type="button"
              onClick={() => setAct(ACTS[actIndex - 1] || 'loop')}
              disabled={actIndex === 0}
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-white hover:text-navy disabled:invisible"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            {act === 'door' ? (
              <p className="text-[13px] text-gray-500">Nothing here is permanent. Settings can bring this back.</p>
            ) : (
              <button
                type="button"
                onClick={() => { void advance(); }}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white hover:bg-navy/90 disabled:opacity-60"
              >
                {act === 'currency' ? 'Save and continue' : 'Continue'}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </footer>
        </div>
      </div>
    </>
  );
}

function DoorCard({
  icon,
  title,
  body,
  action,
  recommended,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action: string;
  recommended?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      // The card is the control, and its name is computed from four nested
      // spans; stating it once means a screen reader announces "Start with
      // something real" rather than reading the whole paragraph as a label.
      aria-label={title}
      className={`group flex w-full items-start gap-4 rounded-xl border bg-white p-4 text-left shadow-sm transition-colors disabled:opacity-60 ${
        recommended ? 'border-brand-blue/40 hover:border-brand-blue' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
        recommended ? 'bg-navy text-white' : 'bg-gray-100 text-gray-600'
      }`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-bold text-navy">{title}</span>
          {recommended && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-brand-blue">
              <Check className="h-3 w-3" />
              Recommended
            </span>
          )}
        </span>
        <span className="mt-1 block text-[13px] leading-6 text-gray-500">{body}</span>
        <span className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-brand-blue">
          {action}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
    </button>
  );
}
