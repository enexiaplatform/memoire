export function HowItWorksSection() {
  return (
    <section className="w-full bg-white py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 mb-16">How Memoire works</h2>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-indigo-100 text-indigo-600 text-xl font-bold mb-6">
              01
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Write freely, in seconds</h3>
            <p className="text-gray-600 leading-relaxed">
              Type a raw note after a meeting or call. No templates, no fields. Just what happened — in your own words.
            </p>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-indigo-100 text-indigo-600 text-xl font-bold mb-6">
              02
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">AI does the filing for you</h3>
            <p className="text-gray-600 leading-relaxed">
              Memoire extracts people, companies, deals, and insights from your note. Everything is organized automatically.
            </p>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-indigo-100 text-indigo-600 text-xl font-bold mb-6">
              03
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Ask anything, instantly</h3>
            <p className="text-gray-600 leading-relaxed">
              "What did Dr. Minh say about endotoxin?" Get your answer in plain language, with sources. Your memory on demand.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
