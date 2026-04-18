interface SuggestedQuestionsProps {
  questions: string[];
  onSelect: (q: string) => void;
}

export function SuggestedQuestions({ questions, onSelect }: SuggestedQuestionsProps) {
  if (!questions || questions.length === 0) return null;

  return (
    <div className="mt-8 border-t border-gray-100 pt-6 animate-in fade-in">
      <h4 className="text-sm font-semibold text-gray-900 mb-4">You might also want to know:</h4>
      <div className="flex flex-col items-start gap-2">
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => onSelect(q)}
            className="text-left px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm rounded-lg transition-colors border border-gray-200"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
