import { useNavigate } from 'react-router-dom';
import type { EntityWithMeta } from './types';

interface EntityCardProps {
  entity: EntityWithMeta;
}

const TYPE_ICONS: Record<string, string> = {
  contact: '👤',
  company: '🏢',
  deal: '💼',
  meeting: '📅',
  insight: '💡',
  competitor: '⚔️',
};

export function EntityCard({ entity }: EntityCardProps) {
  const navigate = useNavigate();
  const icon = TYPE_ICONS[entity.entity_type] || '📄';
  
  const updatedAgo = (() => {
    const d = new Date(entity.updated_at);
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days}d ago`;
  })();

  const TYPE_COLORS: Record<string, string> = {
    contact: 'bg-blue-100 text-blue-600',
    company: 'bg-teal-100 text-teal-600',
    deal: 'bg-green-100 text-green-600',
    meeting: 'bg-orange-100 text-orange-600',
    insight: 'bg-purple-100 text-purple-600',
    competitor: 'bg-red-100 text-red-600',
  };

  const bgIconClass = TYPE_COLORS[entity.entity_type] || 'bg-gray-100 text-gray-600';

  return (
    <div 
      onClick={() => navigate(`/app/entities/${entity.id}`)}
      className="bg-white rounded-[12px] shadow-card p-4 hover:shadow-elevated hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col justify-between h-full"
    >
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${bgIconClass}`}>
            {icon}
          </div>
          <h3 className="font-display font-bold text-[16px] text-navy truncate flex-1">{entity.name}</h3>
        </div>
        <p className="text-[13px] font-body text-gray-500 line-clamp-2 leading-relaxed">
          {entity.description || 'No description'}
        </p>
      </div>
      
      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 font-medium">
        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold font-body text-[11px] uppercase tracking-wider">{entity.capture_count} captures</span>
        <span>Updated {updatedAgo}</span>
      </div>
    </div>
  );
}
