const loopSteps = ['Context', 'Stuck-deal alert', 'Account memory', 'Next action', 'Follow-up'];

export function HowItWorksSection() {
  return (
    <section className="w-full bg-white py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 mb-6">Turn scattered context into follow-up action.</h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-lg leading-relaxed text-gray-600">
          Memoire connects account or client context, unresolved objections, and next actions so long-cycle deals do not quietly stall.
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
            <h3 className="mb-3 text-xl font-semibold text-gray-900">Catch the silent-deal signal</h3>
            <p className="leading-relaxed text-gray-600">
              See accounts with missing follow-ups, unresolved objections, weak context, or no recent interaction.
            </p>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-100 text-xl font-bold text-indigo-600">
              02
            </div>
            <h3 className="mb-3 text-xl font-semibold text-gray-900">Open the account memory</h3>
            <p className="leading-relaxed text-gray-600">
              Review the current story, last interaction, blocker, known context, missing context, and next action.
            </p>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-100 text-xl font-bold text-indigo-600">
              03
            </div>
            <h3 className="mb-3 text-xl font-semibold text-gray-900">Fix the follow-up</h3>
            <p className="leading-relaxed text-gray-600">
              Ask why the deal is stuck, draft a follow-up from context, or add the missing next action.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
