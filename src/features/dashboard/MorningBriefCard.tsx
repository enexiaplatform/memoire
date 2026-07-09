import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import type { MorningBrief } from '../../utils/morningBrief';

export function MorningBriefCard({ brief }: { brief: MorningBrief }) {
  return (
    <section className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/70 to-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-white text-brand-blue">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Morning brief</p>
          <h2 className="mt-1 text-base font-bold text-navy">{brief.headline}</h2>
          {brief.focus.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm leading-6 text-gray-600">
              {brief.focus.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {brief.questions.map((question) => (
              <Link
                key={question.label}
                to={question.href}
                className="rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-bold text-brand-blue hover:border-brand-blue/40 hover:bg-blue-50"
              >
                {question.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
