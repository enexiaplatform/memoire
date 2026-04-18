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

  return (
    <div 
      onClick={() => navigate(`/app/entities/${entity.id}`)}
      className="bg-white border border-gray-200 rounded-xl p-4 hover:border-memoire-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between h-full"
    >
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">{icon}</span>
          <h3 className="font-semibold text-gray-900 truncate">{entity.name}</h3>
        </div>
        <p className="text-sm text-gray-500 line-clamp-2">
          {entity.description || 'No description'}
        </p>
      </div>
      
      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 font-medium">
        <span>{entity.capture_count} captures</span>
        <span>Updated {updatedAgo}</span>
      </div>
    </div>
  );
}
