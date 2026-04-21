import { useEffect } from 'react';
import { format } from 'date-fns';
import type { Capture } from './useCaptures';
import { Link } from 'react-router-dom';

const entityTypeIcon: Record<string, string> = {
  contact: '👤',
  company: '🏢',
  deal: '💰',
  meeting: '📅',
  insight: '💡',
  competitor: '⚔️',
};

interface CaptureDetailModalProps {
  capture: Capture;
  onClose: () => void;
}

export function CaptureDetailModal({ capture, onClose }: CaptureDetailModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col relative" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {format(new Date(capture.created_at), 'MMMM d, yyyy \\a\\t h:mm a')}
          </h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          <div className="text-gray-800 text-lg leading-relaxed mb-8 whitespace-pre-wrap">
            {capture.raw_text}
          </div>

          <div className="mb-8">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">Entities</h3>
            <div className="flex flex-wrap gap-2">
              {capture.entities.map(e => (
                <Link to={`/app/entities/${e.id}`} key={e.id} className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 transition-colors">
                  <span>{entityTypeIcon[e.entity_type] || '📌'}</span>
                  <span>{e.name} &rarr;</span>
                </Link>
              ))}
              {capture.entities.length === 0 && <p className="text-sm text-gray-400">No entities extracted.</p>}
            </div>
          </div>

          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {capture.tags.map(t => (
                <span key={t} className="inline-flex items-center bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-medium">
                  #{t}
                </span>
              ))}
              {capture.tags.length === 0 && <p className="text-sm text-gray-400">No tags.</p>}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
