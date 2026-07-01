import { Link } from 'react-router-dom';

const notItems = [
  'A professional certification, hiring score, or credit signal',
  'A replacement for your company CRM or system of record',
  'An automated sender of customer communication',
  'An invoicing, inventory, ecommerce, marketplace, or project-delivery management system',
];

const boundaries = [
  'No CRM writeback, enterprise SSO, team administration, or manager scoring is available today.',
  'AI-assisted text may be sent to the configured provider only when you explicitly use that feature.',
  'Local browser data can be lost when browser storage is cleared. Keep exports of business-critical information.',
];

const rights = [
  'Export available cloud and browser workspace data from Export & Delete.',
  'Delete your signed-in account and clear Memoire data stored in this browser.',
  'Use local mode without signing in, with the limitations of browser-only storage.',
  'Review the evidence behind rule-based risk and opportunity-quality signals.',
];

export function BoundariesTab() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-xl font-bold text-navy">Data and Product Boundaries</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          Understand what Memoire stores, what remains local, and where human review is required.
        </p>
      </div>

      <BoundaryCard title="Memoire is not" items={notItems} tone="negative" />
      <BoundaryCard title="Current product boundaries" items={boundaries} tone="warning" />
      <BoundaryCard title="Your controls" items={rights} tone="positive" />

      <div className="border-t border-gray-100 pt-4">
        <Link to="/legal/boundaries" className="text-sm font-bold text-brand-blue hover:text-navy">
          View full product boundaries
        </Link>
      </div>
    </div>
  );
}

function BoundaryCard({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'negative' | 'warning' | 'positive';
}) {
  const marker = tone === 'positive' ? 'Yes' : tone === 'warning' ? 'Note' : 'No';
  const markerClass = tone === 'positive'
    ? 'text-emerald-700'
    : tone === 'warning'
      ? 'text-amber-700'
      : 'text-red-600';

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="text-sm font-bold uppercase tracking-wider text-navy">{title}</h3>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3">
            <span className={`mt-0.5 text-xs font-bold uppercase ${markerClass}`}>{marker}</span>
            <span className="text-sm leading-6 text-gray-700">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
