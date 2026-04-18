import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Modal } from '../../components/ui/Modal';
import type { Capture } from '../../types';

const ICONS: Record<string, string> = {
  contact: '👤',
  company: '🏢',
  deal: '💼',
  meeting: '📅',
  insight: '💡',
  competitor: '⚔️',
};

export function CaptureHistory() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCapture, setSelectedCapture] = useState<Capture | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    async function fetchCaptures() {
      if (!user) return;
      const { data, error } = await supabase
        .from('captures')
        .select('*')
        .eq('user_id', user.id)
        .order('captured_at', { ascending: false })
        .limit(10);

      if (!error && data) {
        setCaptures(data as Capture[]);
      }
      setLoading(false);
    }
    fetchCaptures();
  }, [user]);

  if (loading) {
    return <div className="p-4 text-sm text-gray-500">Loading history...</div>;
  }

  if (captures.length === 0) {
    return <div className="p-4 text-sm text-gray-500">No recent captures.</div>;
  }

  const formatRelativeTime = (dateStr: string) => {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const diffMs = new Date(dateStr).getTime() - new Date().getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    
    if (Math.abs(diffHours) < 24) {
      if (diffHours === 0) return 'Just now';
      return rtf.format(diffHours, 'hour');
    }
    const diffDays = Math.round(diffHours / 24);
    return rtf.format(diffDays, 'day');
  };

  const getStructuredEntities = (capture: Capture) => {
    const data = capture.structured_data as any;
    if (data && Array.isArray(data.entities)) {
      return data.entities;
    }
    return [];
  };

  return (
    <>
      <div className="w-80 border-l border-gray-200 bg-white h-[calc(100vh-4rem)] overflow-y-auto">
        <div className="sticky top-0 bg-white/80 backdrop-blur-md px-4 py-3 border-b border-gray-100 flex items-center justify-between z-10">
          <h3 className="text-sm font-semibold text-gray-900">Recent Captures</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {captures.map((capture) => (
            <div 
              key={capture.id} 
              className="p-4 hover:bg-gray-50 transition-colors cursor-pointer block"
              onClick={() => setSelectedCapture(capture)}
            >
              <p className="text-sm text-gray-800 line-clamp-2 mb-2 leading-relaxed">
                {capture.raw_text.substring(0, 80)}
                {capture.raw_text.length > 80 && '...'}
              </p>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{formatRelativeTime(capture.captured_at || capture.created_at)}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 font-medium">
                  {capture.entity_ids?.length || 0} entities
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail Drawer / Modal for Read-Only View */}
      <Modal 
        isOpen={!!selectedCapture} 
        onClose={() => setSelectedCapture(null)}
        title="Capture Details"
      >
        {selectedCapture && (
          <div className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-sm text-gray-800 leading-relaxed font-medium">
              {selectedCapture.raw_text}
            </div>
            
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Extracted Entities</h4>
              <div className="flex flex-wrap gap-2">
                {getStructuredEntities(selectedCapture).length > 0 ? (
                  getStructuredEntities(selectedCapture).map((entity: any, idx: number) => (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100 text-blue-900 text-sm"
                    >
                      <span>{ICONS[entity.entity_type] || '📌'}</span>
                      <span className="font-medium">{entity.name}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-sm text-gray-500">No entities extracted.</span>
                )}
              </div>
            </div>

            <div className="text-xs text-gray-400 text-right pt-4 border-t border-gray-100">
              Captured {new Date(selectedCapture.captured_at || selectedCapture.created_at).toLocaleString()}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
