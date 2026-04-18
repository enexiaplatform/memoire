interface AnswerCardProps {
  answer: string;
  sourceCount: number;
}

export function AnswerCard({ answer, sourceCount }: AnswerCardProps) {
  return (
    <div className="bg-memoire-50 border border-memoire-100 rounded-xl p-6 shadow-sm mb-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-start gap-4">
        <div className="w-8 h-8 rounded bg-memoire-200 flex items-center justify-center text-memoire-700 flex-shrink-0">
          ✦
        </div>
        <div>
          <p className="text-gray-900 leading-relaxed">{answer}</p>
          <div className="text-right mt-4 flex justify-end gap-2">
            {[...Array(sourceCount)].map((_, i) => (
              <span key={i} className="text-xs font-medium bg-memoire-200 text-memoire-800 px-2 py-0.5 rounded cursor-pointer hover:bg-memoire-300">
                [{i + 1}]
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
