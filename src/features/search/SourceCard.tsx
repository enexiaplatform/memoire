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
    <div className="bg-white rounded-[12px] shadow-card p-5 hover:shadow-elevated hover:-translate-y-0.5 transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${index * 50}ms` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[14px] font-display font-semibold text-navy">
          <span>📝</span>
          <span>{date}</span>
        </div>
        <div className="text-[12px] font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
          {percentage}% match
        </div>
      </div>
      
      <p className="font-body text-gray-500 text-[13px] line-clamp-3 mb-4 leading-relaxed">
        "{source.raw_text}"
      </p>

      {source.entity_ids && source.entity_ids.length > 0 && (
        <div className="flex flex-wrap gap-2">
           <span className="text-[12px] text-gray-600 font-medium px-3 py-1 bg-[#F1F5F9] rounded-full">{source.entity_ids.length} related entities</span>
        </div>
      )}
    </div>
  );
}
