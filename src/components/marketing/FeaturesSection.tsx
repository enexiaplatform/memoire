const features = [
  {
    title: 'Quick Capture',
    description: 'Capture raw customer interactions and structure them into account, contact, opportunity, objection, and Next Action fields.',
  },
  {
    title: 'Living Account Memory',
    description: 'See the current customer story, latest interactions, open actions, pain points, objections, and blockers in one place.',
  },
  {
    title: 'Journey and Broken Loops',
    description: 'Understand where the Sales Memory loop is working, where it is broken, and what action can close the loop.',
  },
  {
    title: 'Ask Memoire',
    description: 'Ask account-specific or opportunity-specific questions grounded in your own Sales Memory, not a generic chatbot.',
  },
  {
    title: 'Learning Layer',
    description: 'Notice repeated patterns such as proposal momentum loss, objection clusters, and capture without action.',
  },
];

export function FeaturesSection() {
  return (
    <section className="w-full bg-white py-24 px-4 border-t border-gray-100">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 mb-16">
          The personal sales brain for daily execution
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
