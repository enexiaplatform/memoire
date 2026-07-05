import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Sparkles } from 'lucide-react';
import {
  buildQuickStartPlan,
  defaultQuickStartAnswers,
  loadQuickStart,
  quickStartQuestions,
  saveQuickStart,
  type QuickStartAnswers,
  type QuickStartFieldId,
} from '../../utils/quickStartSetup';
import { setReportingCurrency } from '../../utils/money';

export function QuickStartSetupPage() {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<QuickStartAnswers>(() => loadQuickStart().answers || defaultQuickStartAnswers());
  const [applied, setApplied] = useState(() => Boolean(loadQuickStart().completedAt));

  const plan = buildQuickStartPlan(answers);

  const update = (id: QuickStartFieldId, value: string) => {
    setAnswers((current) => ({ ...current, [id]: value }));
    setApplied(false);
  };

  const apply = () => {
    setReportingCurrency(answers.currency);
    saveQuickStart(answers);
    setApplied(true);
  };

  return (
    <div className="w-full max-w-3xl">
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-6">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">
          <Sparkles className="h-4 w-4" /> Quick setup
        </p>
        <h1 className="mt-2 text-2xl font-black text-navy">Set up Memoire in a minute</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
          Answer a few questions and Memoire tailors a basic setup - the right language for your deals, when to worry about
          silence, your reporting currency, and where to start. You can change any of this later in Settings.
        </p>
      </div>

      <div className="mt-5 grid gap-4">
        {quickStartQuestions.map((question) => (
          <label key={question.id} className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <span className="text-sm font-bold text-navy">{question.label}</span>
            <span className="mt-0.5 block text-xs text-gray-500">{question.help}</span>
            <select
              value={answers[question.id]}
              onChange={(event) => update(question.id, event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-navy outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
            >
              {question.options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Your basic setup</p>
        <p className="mt-2 text-sm leading-6 text-gray-700">{plan.summary}</p>
        <ol className="mt-3 space-y-1.5">
          {plan.steps.map((step, index) => (
            <li key={index} className="flex gap-2 text-sm text-gray-600">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-brand-blue">{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!applied ? (
            <button
              type="button"
              onClick={apply}
              className="rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white hover:bg-navy/90"
            >
              Apply this setup
            </button>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Setup applied
              </span>
              <button
                type="button"
                onClick={() => navigate(plan.focusRoute)}
                className="rounded-full bg-brand-blue px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-blue-dark"
              >
                {plan.focusLabel}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => navigate('/app/today')}
            className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            Skip to Today
          </button>
        </div>
      </div>
    </div>
  );
}
