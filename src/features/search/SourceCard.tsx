import type { SearchSource } from './types';

interface SourceCardProps {
  source: SearchSource;
  index: number;
}

export function SourceCard({ source, index }: SourceCardProps) {
  const date = new Date(source.captured_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const percentage = Math.round(source.similarity * 100);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:border-memoire-300 transition-colors shadow-sm cursor-pointer animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${index * 50}ms` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
          <span>📝</span>
          <span>{date}</span>
        </div>
        <div className="text-xs font-semibold text-gray-400 bg-gray-50 px-2 py-1 rounded">
          {percentage}% match
        </div>
      </div>
      
      <p className="text-gray-700 text-sm line-clamp-3 mb-4 leading-relaxed">
        "{source.raw_text}"
      </p>

      {source.entity_ids && source.entity_ids.length > 0 && (
        <div className="flex flex-wrap gap-2">
           {/* Need a fallback since entity data might not be populated gracefully in MVP for sources component yet */}
           <span className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded-full">{source.entity_ids.length} related entities</span>
        </div>
      )}
    </div>
  );
}
