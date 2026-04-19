import { useState } from 'react';
import { format } from 'date-fns';
import { Capture } from './useCaptures';
import { CaptureDetailModal } from './CaptureDetailModal';

const entityTypeIcon: Record<string, string> = {
  contact: '👤',
  company: '🏢',
  deal: '💰',
  meeting: '📅',
  insight: '💡',
  competitor: '⚔️',
};

interface CaptureCardProps {
  capture: Capture;
  onEntityClick: (entityId: string, entityName: string) => void;
  onTagClick: (tag: string) => void;
}

export function CaptureCard({ capture, onEntityClick, onTagClick }: CaptureCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const displayEntities = capture.entities.slice(0, 4);
  const extraEntitiesCount = Math.max(0, capture.entities.length - 4);

  const formatTime = (dateStr: string) => {
    return format(new Date(dateStr), 'h:mm a');
  };

  return (
    <>
      <div 
        className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer mb-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="text-xs text-gray-400 mb-3 font-medium">
          {formatTime(capture.created_at)}
        </div>
        
        <div className={`text-gray-800 text-base leading-relaxed mb-4 ${!expanded ? 'line-clamp-3' : ''}`}>
          {capture.raw_text}
        </div>
        
        {expanded && (
          <div className="mb-4 text-indigo-600 text-sm font-medium hover:underline" onClick={(e) => { e.stopPropagation(); setModalOpen(true); }}>
            Open full details &rarr;
          </div>
        )}

        <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          {displayEntities.map((entity) => (
            <button
              key={entity.id}
              onClick={() => onEntityClick(entity.id, entity.name)}
              className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-indigo-50 hover:text-indigo-700 px-3 py-1 rounded-full text-sm font-medium text-gray-700 transition-colors"
            >
              <span>{entityTypeIcon[entity.entity_type] || '📌'}</span>
              <span>{entity.name}</span>
            </button>
          ))}
          {extraEntitiesCount > 0 && (
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 px-3 py-1 rounded-full text-sm font-medium text-gray-500 transition-colors"
            >
              +{extraEntitiesCount} more
            </button>
          )}

          {capture.tags.map((tag) => (
            <button
              key={tag}
              onClick={() => onTagClick(tag)}
              className="inline-flex items-center bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-medium transition-colors"
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      {modalOpen && (
        <CaptureDetailModal
          capture={capture}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
