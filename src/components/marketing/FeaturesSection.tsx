const features = [
  {
    icon: "⚡",
    title: "Quick capture",
    description: "Write a raw note after any meeting or call. AI extracts and files everything automatically. Typing to saved in under 30 seconds."
  },
  {
    icon: "🔍",
    title: "AI-powered search",
    description: "Ask your memory in plain language. \"What did the ABC Pharma contact mention about Q3?\" Get the answer with sources."
  },
  {
    icon: "📦",
    title: "Full portability",
    description: "Export everything — contacts, companies, deals, insights — as JSON, CSV, or Markdown. Always."
  },
  {
    icon: "🔒",
    title: "Private by design",
    description: "Your notes are end-to-end private. We never use your data to train AI models. Your memory, your control."
  }
];

export function FeaturesSection() {
  return (
    <section className="w-full bg-white py-24 px-4 border-t border-gray-100">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 mb-16">
          Everything you need to never forget again
        </h2>
        
        <div className="grid md:grid-cols-2 gap-x-12 gap-y-16">
          {features.map((feature, idx) => (
            <div key={idx} className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center text-2xl">
                {feature.icon}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
