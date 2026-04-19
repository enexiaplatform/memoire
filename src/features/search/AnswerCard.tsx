interface AnswerCardProps {
  answer: string;
  sourceCount: number;
}

export function AnswerCard({ answer, sourceCount }: AnswerCardProps) {
  return (
    <div className="gradient-border-card mb-8 shadow-elevated animate-in fade-in slide-in-from-bottom-4">
      <div className="gradient-border-card-inner">
        <div className="flex items-center gap-1.5 mb-3">
          <svg className="w-3.5 h-3.5 text-[#7B1FA2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#7B1FA2] font-body">AI Answer</span>
        </div>
        <p className="text-[#1B2B3A] font-body text-[15px] leading-[1.65] whitespace-pre-wrap">{answer}</p>
        
        {sourceCount > 0 && (
          <div className="text-right mt-4 flex justify-end gap-2 border-t border-gray-100 pt-3">
            {[...Array(sourceCount)].map((_, i) => (
              <span key={i} className="text-xs font-semibold bg-blue-50 text-brand-blue px-2 py-0.5 rounded-md cursor-pointer hover:bg-blue-100 transition-colors">
                [{i + 1}]
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
