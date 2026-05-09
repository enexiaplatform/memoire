const features = [
  {
    title: 'Stuck Deal Queue',
    description: 'See accounts that may go silent because of missing follow-ups, unresolved objections, stale context, or unclear decision ownership.',
  },
  {
    title: 'Account Memory',
    description: 'Open the current account story, latest interaction, known blocker, missing context, and next action in one place.',
  },
  {
    title: 'Ask with Context',
    description: 'Ask which deals may go silent, what follow-up is missing, or what Memoire knows and does not know about an account.',
  },
  {
    title: 'Follow-up from Memory',
    description: 'Draft a follow-up from real account context without turning Memoire into email automation.',
  },
];

export function FeaturesSection() {
  return (
    <section className="w-full bg-white py-24 px-4 border-t border-gray-100">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 mb-16">
          Built around stuck deals, not dashboards
        </h2>

        <div className="grid gap-x-12 gap-y-12 md:grid-cols-2">
          {features.map((feature, idx) => (
            <div key={feature.title} className="flex gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-lg font-bold text-indigo-700">
                {String(idx + 1).padStart(2, '0')}
              </div>
              <div>
                <h3 className="mb-2 text-xl font-semibold text-gray-900">{feature.title}</h3>
                <p className="leading-relaxed text-gray-600">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
