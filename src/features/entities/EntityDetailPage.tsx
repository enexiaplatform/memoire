import { useNavigate, useParams } from 'react-router-dom';
import { useEntityDetail } from './useEntityDetail';
import { useEntityUpdate } from './useEntityUpdate';
import { InlineEdit } from '../../components/ui/InlineEdit';

export function EntityDetailPage() {
  const { entityId } = useParams<{ entityId: string }>();
  const navigate = useNavigate();
  
  const { entity, relationships, captures, loading } = useEntityDetail(entityId || '');
  const { updateEntity, deleteEntity } = useEntityUpdate(entityId || '');

  if (loading) {
    return <div className="p-8 text-center text-gray-500 animate-pulse">Loading entity...</div>;
  }

  if (!entity) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-medium">Entity not found</h2>
        <button onClick={() => navigate('/app/entities')} className="text-memoire-600 mt-4">← Back to entities</button>
      </div>
    );
  }

  const handleDelete = async () => {
    if (confirm(`Delete ${entity.name}? This will remove the entity and all its relationships. Captures will not be deleted.`)) {
      const ok = await deleteEntity();
      if (ok) navigate('/app/entities');
    }
  };

  const handleUpdate = async (field: string, value: any) => {
    await updateEntity({ [field]: value });
  };

  const handleUpdateAttribute = async (key: string, value: string) => {
    const newAttrs = { ...(entity.attributes || {}), [key]: value };
    await updateEntity({ attributes: newAttrs });
  };

  const attributesList = Object.entries(entity.attributes || {});

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6">
      <button onClick={() => navigate('/app/entities')} className="text-gray-500 hover:text-gray-900 mb-6 text-sm font-medium">← Back to entities</button>
      
      {/* Header */}
      <div className="flex items-start justify-between border-b border-gray-200 pb-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl">👤</span>
            <InlineEdit 
              value={entity.name} 
              onSave={(v) => handleUpdate('name', v)} 
              className="text-3xl font-bold text-gray-900"
            />
          </div>
          <div className="text-gray-500 uppercase tracking-wider text-xs font-bold pl-11">
            {entity.entity_type}
          </div>
        </div>
        <button onClick={handleDelete} className="text-sm text-red-600 hover:text-red-700 font-medium px-3 py-1.5 rounded hover:bg-red-50">
          Delete entity
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
        {/* Left Column - Meta */}
        <div className="md:col-span-1 space-y-10">
          {/* About */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">About</h3>
            <InlineEdit 
              value={entity.description || ''} 
              onSave={(v) => handleUpdate('description', v)}
              placeholder="Add a description..."
              multiline
              className="text-sm text-gray-600 leading-relaxed"
            />
          </section>

          {/* Details / Attributes */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Details</h3>
              <button 
                onClick={() => handleUpdateAttribute('New Field', 'Value')}
                className="text-xs font-medium text-memoire-600"
              >
                + Add field
              </button>
            </div>
            <div className="space-y-3">
              {attributesList.length === 0 && <p className="text-xs text-gray-400 italic">No details added</p>}
              {attributesList.map(([key, val]) => (
                <div key={key} className="flex flex-col border-b border-gray-100 pb-2">
                  <span className="text-xs font-medium text-gray-400">{key}</span>
                  <InlineEdit 
                    value={String(val)} 
                    onSave={(v) => handleUpdateAttribute(key, v)}
                    className="text-sm font-medium text-gray-900"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Relationships */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">Connected to</h3>
            {relationships.length === 0 && <p className="text-xs text-gray-400 italic">No connections</p>}
            <div className="flex flex-wrap gap-2">
              {relationships.map(rel => (
                <div key={rel.id} onClick={() => navigate(`/app/entities/${rel.related_entity.id}`)} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                  <span className="text-xs font-medium text-gray-700">{rel.related_entity.name}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column - Timeline */}
        <div className="md:col-span-2">
          <h3 className="text-sm font-semibold text-gray-900 mb-6 uppercase tracking-wider border-b border-gray-200 pb-2">
            Timeline ({captures.length} captures)
          </h3>
          
          {captures.length === 0 ? (
            <div className="text-center py-10 bg-gray-50 rounded-xl">
              <p className="text-sm text-gray-500">No captures linked to this entity yet.<br/>This entity was created manually.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {captures.map(cap => (
                <div key={cap.id} className="relative pl-6 before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-[-24px] before:w-px before:bg-gray-200 last:before:hidden">
                  <div className="absolute left-[-4px] top-2 w-2 h-2 rounded-full bg-memoire-400 border-[3px] border-white box-content shadow-sm"></div>
                  
                  <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-sm font-semibold text-gray-900 mb-3">
                      {new Date(cap.captured_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                    <p className="text-sm text-gray-700 mb-4 whitespace-pre-wrap">{cap.raw_text}</p>
                    
                    {cap.entity_ids.length > 1 && (
                      <div className="flex items-center gap-2 pt-3 border-t border-gray-50">
                        <span className="text-xs text-gray-400 font-medium">Also in:</span>
                        <div className="flex gap-1">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{cap.entity_ids.length - 1} other entities</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
