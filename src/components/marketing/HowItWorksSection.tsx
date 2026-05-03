const loopSteps = ['Capture', 'Structure', 'Memory', 'Opportunity', 'Action', 'Ask', 'Learning'];

export function HowItWorksSection() {
  return (
    <section className="w-full bg-white py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 mb-6">Turn every interaction into Sales Memory.</h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-lg leading-relaxed text-gray-600">
          Memoire connects the daily sales loop so a raw customer note becomes account memory, opportunity context, a next action, and askable knowledge.
        </p>

        <div className="mb-12 flex flex-wrap justify-center gap-2">
          {loopSteps.map((step) => (
            <span key={step} className="rounded-full border border-indigo-100 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700">
              {step}
            </span>
          ))}
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-100 text-xl font-bold text-indigo-600">
              01
            </div>
            <h3 className="mb-3 text-xl font-semibold text-gray-900">Capture the real conversation</h3>
            <p className="leading-relaxed text-gray-600">
              Paste a raw call note, meeting recap, or customer message. Memoire preserves the note and structures the sales context.
            </p>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-100 text-xl font-bold text-indigo-600">
              02
            </div>
            <h3 className="mb-3 text-xl font-semibold text-gray-900">Build Living Account Memory</h3>
            <p className="leading-relaxed text-gray-600">
              Customer pains, objections, blockers, timeline, contacts, opportunities, and next actions stay connected in one memory system.
            </p>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-100 text-xl font-bold text-indigo-600">
              03
            </div>
            <h3 className="mb-3 text-xl font-semibold text-gray-900">Ask what to do next</h3>
            <p className="leading-relaxed text-gray-600">
              Ask Memoire about an account or opportunity and get grounded answers based on the Sales Memory you created.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
