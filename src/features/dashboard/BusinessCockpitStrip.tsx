import { Link } from 'react-router-dom';
import type { BusinessCockpitAnswer } from '../../utils/businessCockpit';

export function BusinessCockpitStrip({ answers }: { answers: BusinessCockpitAnswer[] }) {
  return (
    <section aria-label="Business cockpit" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {answers.map((answer) => (
        <Link
          key={answer.id}
          to={answer.href}
          className={`group rounded-xl border p-3 shadow-sm transition hover:border-brand-blue/40 ${
            answer.urgent ? 'border-amber-200 bg-amber-50/60' : 'border-gray-200 bg-white'
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{answer.question}</p>
          <p className={`mt-1.5 text-sm font-semibold leading-5 ${answer.urgent ? 'text-amber-900' : 'text-gray-700'}`}>
            {answer.answer}
          </p>
        </Link>
      ))}
    </section>
  );
}
