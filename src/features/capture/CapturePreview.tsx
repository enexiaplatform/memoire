import { useState } from 'react';
import type { ExtractionResponse, ExtractedEntity } from './types';
import { Button } from '../../components/ui/Button';

// Utility for UI
const ICONS = {
  contact: '👤',
  company: '🏢',
  deal: '💼',
  meeting: '📅',
  insight: '💡',
  competitor: '⚔️',
};

interface PreviewProps {
  extraction: ExtractionResponse;
  setExtraction: React.Dispatch<React.SetStateAction<ExtractionResponse | null>>;
  onSave: () => void;
  onDiscard: () => void;
  isSaving: boolean;
}

export function CapturePreview({
  extraction,
  setExtraction,
  onSave,
  onDiscard,
  isSaving,
}: PreviewProps) {
  const [newTagName, setNewTagName] = useState('');
  const [addingEntity, setAddingEntity] = useState(false);
  const [newEntityType, setNewEntityType] = useState<ExtractedEntity['entity_type']>('contact');
  const [newEntityName, setNewEntityName] = useState('');

  const removeEntity = (tempId: string) => {
    setExtraction((prev) => {
      if (!prev) return prev;
      const filteredEntities = prev.entities.filter((e) => e.tempId !== tempId);
      // Also remove relationships involving this entity
      const filteredRels = prev.relationships.filter(
        (r) => r.sourceTempId !== tempId && r.targetTempId !== tempId
      );
      return { ...prev, entities: filteredEntities, relationships: filteredRels };
    });
  };

  const removeTag = (tagToRemove: string) => {
    setExtraction((prev) => {
      if (!prev) return prev;
      return { ...prev, tags: prev.tags.filter((t) => t !== tagToRemove) };
    });
  };

  const addTag = () => {
    if (!newTagName.trim()) return;
    setExtraction((prev) => {
      if (!prev) return prev;
      const tag = newTagName.trim().toLowerCase();
      if (prev.tags.includes(tag)) return prev;
      return { ...prev, tags: [...prev.tags, tag] };
    });
    setNewTagName('');
  };

  const addManualEntity = () => {
    if (!newEntityName.trim()) return;
    setExtraction((prev) => {
      if (!prev) return prev;
      const newEntity: ExtractedEntity = {
        tempId: `manual_${Date.now()}`,
        entity_type: newEntityType,
        name: newEntityName.trim(),
        description: 'Manually added',
      };
      return { ...prev, entities: [...prev.entities, newEntity] };
    });
    setNewEntityName('');
    setAddingEntity(false);
  };

  // Helper to resolve entity names for relationships
  const getEntityName = (tempId: string) => {
    return extraction.entities.find((e) => e.tempId === tempId)?.name || 'Unknown';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Extracted Knowledge</h3>
        {extraction.confidence === 'low' && (
          <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
            Review carefully — low confidence extraction
          </span>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Entities */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-700">Entities found:</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {extraction.entities.map((entity) => (
              <div
                key={entity.tempId}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100 text-blue-900 text-sm group"
              >
                <span>{ICONS[entity.entity_type]}</span>
                <span className="font-medium">{entity.name}</span>
                {entity.matchedExistingId && (
                  <span className="text-[10px] uppercase tracking-wider font-bold text-blue-500 ml-1">
                    existing
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeEntity(entity.tempId)}
                  className="ml-1 text-blue-400 hover:text-blue-600 focus:outline-none"
                  aria-label="Remove entity"
                >
                  &times;
                </button>
              </div>
            ))}
            
            {!addingEntity ? (
              <button
                type="button"
                onClick={() => setAddingEntity(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 text-sm hover:border-gray-400 hover:text-gray-700 transition-colors"
              >
                + Add entity manually
              </button>
            ) : (
              <div className="inline-flex items-center gap-2 p-1.5 rounded-lg border border-gray-200 bg-gray-50">
                <select
                  value={newEntityType}
                  onChange={(e) => setNewEntityType(e.target.value as any)}
                  className="text-sm bg-transparent border-none focus:ring-0 py-0 pl-2 pr-7 text-gray-600"
                >
                  {Object.entries(ICONS).map(([type, icon]) => (
                    <option key={type} value={type}>
                      {icon} {type}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newEntityName}
                  onChange={(e) => setNewEntityName(e.target.value)}
                  placeholder="Entity name"
                  autoFocus
                  className="text-sm bg-white border border-gray-200 rounded px-2 py-1 w-32 focus:outline-none focus:border-memoire-500 focus:ring-1 focus:ring-memoire-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addManualEntity();
                    if (e.key === 'Escape') setAddingEntity(false);
                  }}
                />
                <button
                  onClick={addManualEntity}
                  className="p-1 px-2 text-xs bg-memoire-600 text-white rounded font-medium hover:bg-memoire-700"
                >
                  Add
                </button>
                <button
                  onClick={() => setAddingEntity(false)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  &times;
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Relationships */}
        {extraction.relationships.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Relationships:</h4>
            <ul className="space-y-2">
              {extraction.relationships.map((rel, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                  <span className="font-semibold">{getEntityName(rel.sourceTempId)}</span>
                  <span className="text-gray-400">→</span>
                  <span className="italic text-gray-600">{rel.label}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-semibold">{getEntityName(rel.targetTempId)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tags */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Tags:</h4>
          <div className="flex flex-wrap items-center gap-2">
            {extraction.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 text-xs font-medium"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  &times;
                </button>
              </span>
            ))}
            <div className="relative inline-flex items-center">
              <input
                type="text"
                placeholder="+ Add tag..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addTag();
                }}
                className="w-24 text-xs bg-transparent border-none placeholder-gray-400 focus:outline-none focus:w-32 transition-all p-1"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="bg-gray-50 border-t border-gray-100 px-6 py-4 flex items-center justify-between">
        <Button variant="ghost" onClick={onDiscard} disabled={isSaving}>
          Discard
        </Button>
        <Button onClick={onSave} loading={isSaving}>
          Save capture
        </Button>
      </div>
    </div>
  );
}
