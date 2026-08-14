import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown, PartyPopper, X } from 'lucide-react';
import { useFirstWeekPath } from '../../hooks/useFirstWeekPath';
import { useDemoWorkspaceMode } from '../../hooks/useDemoWorkspaceMode';
import {
  dismissTrialActivationChecklist,
  loadTrialActivationChecklistState,
} from '../../utils/trialActivationChecklist';
import type { FirstWeekPath } from '../../utils/firstWeekPath';

/**
 * The guide that follows the operator around.
 *
 * Guidance used to live in exactly one place - a strip on Today, below the
 * watch-list - which meant it vanished the moment anyone went to do the thing it
 * had just asked for. Someone told to capture their first interaction arrived on
 * Capture with no indication of why they were there, what came next, or how far
 * through anything they were.
 *
 * So this rides in the corner of every workspace route, and three rules keep it
 * from becoming the nagging overlay every product eventually grows:
 *
 *   - It is derived, never asserted. Every step is read from the workspace by
 *     `useFirstWeekPath`; there is no "mark as done", because a button that
 *     lets someone claim they captured something teaches nothing and measures
 *     nothing. Do the work in the product and the step ticks itself.
 *   - It never blocks. No overlay, no modal, no focus trap. It collapses to a
 *     pill, and the pill is smaller than the thing it replaced.
 *   - It ends. Five real steps and it congratulates the operator once and
 *     retires permanently, and it can be dismissed before that at any time.
 *
 * It stays out of the sample workspace entirely: that has its own journey card,
 * and coaching someone through "capture your first interaction" on records that
 * are not theirs is a lesson in the wrong loop.
 */

const COLLAPSED_KEY = 'memoire.gettingStarted.collapsed.v1';

/**
 * The two screens that are already having this conversation.
 *
 * `/app/start` is the welcome - a floating guide over it is the product talking
 * over itself.
 *
 * `/app/today` is the subtler one, and it is the rule that keeps this from
 * becoming clutter. Today already renders the same five steps inline, in
 * context, as the First Week Path strip; a dock repeating them in the corner
 * would print one person's progress twice on one screen, which is precisely the
 * duplication this codebase spent a release removing from the watch-list. The
 * coach exists to cover the *other* ten destinations, where guidance used to
 * vanish the moment somebody went to do the thing Today had just asked for.
 */
const SUPPRESSED_ROUTES = ['/app/start', '/app/today'];

export function GettingStartedCoach() {
  const { pathname } = useLocation();
  const sampleDataActive = useDemoWorkspaceMode();
  const { path, loaded } = useFirstWeekPath();
  const [dismissedAt, setDismissedAt] = useState(() => loadTrialActivationChecklistState().dismissedAt);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  // Once the whole loop has been run, say so once and go. Held in state rather
  // than derived so the congratulation survives the step that produced it - a
  // card that appears and vanishes in the same tick is not a celebration.
  const [graduating, setGraduating] = useState(false);
  useEffect(() => {
    if (path.complete && !dismissedAt) setGraduating(true);
  }, [dismissedAt, path.complete]);

  // `loaded` rather than "not loading": until the workspace has actually
  // answered, an established operator would be shown a 0/5 ring telling them to
  // capture their first interaction. Silence is the only honest state here.
  const hidden = !loaded
    || sampleDataActive
    || Boolean(dismissedAt)
    || SUPPRESSED_ROUTES.includes(pathname)
    || (path.complete && !graduating);

  const dismiss = () => {
    setDismissedAt(dismissTrialActivationChecklist().dismissedAt);
  };

  const toggle = () => {
    setCollapsed((current) => {
      writeCollapsed(!current);
      return !current;
    });
  };

  if (hidden) return null;

  return (
    <div
      // Clear of the phone tab bar, and of the safe area below it.
      className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-end px-4 lg:bottom-6 lg:px-6"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="pointer-events-auto w-full max-w-sm">
        {graduating ? (
          <GraduationCard onDismiss={dismiss} />
        ) : collapsed ? (
          <CollapsedPill path={path} onExpand={toggle} />
        ) : (
          <ExpandedCard path={path} onCollapse={toggle} onDismiss={dismiss} />
        )}
      </div>
    </div>
  );
}

function CollapsedPill({ path, onExpand }: { path: FirstWeekPath; onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="ml-auto flex items-center gap-2.5 rounded-full border border-gray-200 bg-white py-2 pl-2 pr-4 shadow-lg hover:border-brand-blue/40"
    >
      <ProgressRing done={path.done} total={path.total} />
      <span className="text-left">
        <span className="block text-[13px] font-bold text-navy">Getting started</span>
        <span className="block text-[11px] font-semibold text-gray-500">
          {path.nextStep ? path.nextStep.cta : 'Done'} &middot; {path.done}/{path.total}
        </span>
      </span>
    </button>
  );
}

function ExpandedCard({
  path,
  onCollapse,
  onDismiss,
}: {
  path: FirstWeekPath;
  onCollapse: () => void;
  onDismiss: () => void;
}) {
  const next = path.nextStep;

  return (
    <section
      aria-label="Getting started"
      className="rounded-xl border border-gray-200 bg-white shadow-2xl"
    >
      <header className="flex items-center gap-3 border-b border-gray-100 px-4 py-2.5">
        <ProgressRing done={path.done} total={path.total} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-navy">Getting started</p>
          {/* The promise this thing is built on, said where it is always
              visible: nothing below is a checkbox you can tick at yourself. */}
          <p className="text-[11px] font-semibold text-gray-500">
            {path.done} of {path.total} &middot; steps tick themselves as you work
          </p>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-navy"
          aria-label="Collapse getting started"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-navy"
          aria-label="Hide getting started for good"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <ol className="px-4 py-2.5">
        {path.steps.map((step, index) => {
          const isNext = next?.id === step.id;
          return (
            <li key={step.id} className="flex items-start gap-2.5 py-1">
              <span
                className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                  step.done
                    ? 'bg-emerald-600 text-white'
                    : isNext
                      ? 'bg-brand-blue text-white'
                      : 'bg-gray-100 text-gray-500'
                }`}
              >
                {step.done ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] leading-5 ${
                  step.done ? 'font-semibold text-gray-500 line-through' : isNext ? 'font-bold text-navy' : 'font-semibold text-gray-500'
                }`}>
                  {step.label}
                </p>
                {isNext && <p className="mt-1 text-[12px] leading-5 text-gray-500">{step.hint}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {next && (
        <div className="border-t border-gray-100 px-4 py-2.5">
          <Link
            to={next.href}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-2.5 text-sm font-bold text-white hover:bg-navy/90"
          >
            {next.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </section>
  );
}

function GraduationCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section aria-label="Getting started complete" className="rounded-xl border border-emerald-200 bg-white p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <PartyPopper className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-navy">You have run the whole loop.</p>
          <p className="mt-1 text-[13px] leading-6 text-gray-600">
            Captured, linked, promised, kept, reviewed. That is Memoire working - everything from here is the same five
            steps on more customers. This guide is finished and will not come back.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-3 w-full rounded-full bg-navy px-4 py-2.5 text-sm font-bold text-white hover:bg-navy/90"
      >
        Close for good
      </button>
    </section>
  );
}

/** Progress as a ring rather than a bar: it reads at pill size, a bar does not. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  const fraction = useMemo(() => (total > 0 ? Math.min(1, done / total) : 0), [done, total]);

  return (
    <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center">
      <svg viewBox="0 0 32 32" className="h-8 w-8 -rotate-90" aria-hidden="true">
        <circle cx="16" cy="16" r={radius} fill="none" stroke="#E5E7EB" strokeWidth="3" />
        <circle
          cx="16"
          cy="16"
          r={radius}
          fill="none"
          stroke="#1976D2"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span className="absolute text-[10px] font-black text-navy">{done}</span>
    </span>
  );
}

function readCollapsed() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COLLAPSED_KEY, String(value));
  } catch {
    // A collapse preference that will not persist is a minor annoyance; a
    // storage exception thrown out of a click handler is a broken button.
  }
}
