import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDeal, useDealMutations } from '../hooks/useDeals';
import { useEntities } from '../features/entities/useEntities'; // Needed for stakeholders
import { ArrowLeft, Edit3, Trash2, Globe, Lock, ChevronRight, User } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { DEAL_OUTCOMES } from '../types/Deal';

export function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showPrivateLabel, setShowPrivateLabel] = useState(false);
  
  const { deal, loading, error } = useDeal(id);
  const { deleteDeal, updateDeal } = useDealMutations();
  const { entities: allEntities } = useEntities();

  const stakeholders = useMemo(() => {
    if (!deal || !allEntities) return [];
    return allEntities.filter(ent => 
      deal.stakeholder_contact_ids?.includes(ent.id)
    );
  }, [deal, allEntities]);

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this deal?')) {
      const { error } = await deleteDeal(id!);
      if (!error) navigate('/app/deals');
    }
  };

  const togglePrivacy = async () => {
    if (!deal) return;
    const newFlag = deal.privacy_flag === 'personal' ? 'shareable' : 'personal';
    await updateDeal(deal.id, { privacy_flag: newFlag });
  };

  if (loading) return <div className="p-8 text-center animate-pulse">Loading deal...</div>;
  if (error || !deal) return <div className="p-8 text-center text-red-500">Deal not found.</div>;

  const outcomeInfo = DEAL_OUTCOMES.find(o => o.value === deal.outcome);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/app/deals" className="hover:text-navy">Deals</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="font-medium text-navy truncate max-w-[200px]">{deal.company_anonymized}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          <div className="border-b border-gray-200 pb-8">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div className="space-y-1">
                <h1 className="text-[32px] font-bold font-display text-navy tracking-tight">
                  {deal.company_anonymized}
                </h1>
                <div className="flex items-center gap-2">
                  <span 
                    className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
                    style={{ backgroundColor: `${outcomeInfo?.color}15`, color: outcomeInfo?.color }}
                  >
                    {outcomeInfo?.label}
                  </span>
                  
                  {deal.company_label && (
                    <button 
                      onClick={() => setShowPrivateLabel(!showPrivateLabel)}
                      className="text-[12px] text-brand-blue hover:underline font-medium"
                    >
                      {showPrivateLabel ? `Private label: ${deal.company_label}` : 'Show private label'}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={() => navigate(`/app/deals/${id}/edit`)}
                  className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-gray-50 bg-[#F4F6FB]"
                >
                  <Edit3 className="w-4 h-4" />
                  Edit
                </Button>
                <Button 
                  onClick={handleDelete}
                  className="bg-white border border-red-200 text-red-600 px-3 py-2 rounded-lg flex items-center justify-center hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {deal.product_categories.map(cat => (
                <span key={cat} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold font-body">
                  {cat}
                </span>
              ))}
            </div>
          </div>

          <section>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Stakeholders</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {deal.contact && (
                <Link to={`/app/entities/${deal.contact.id}`} className="p-4 bg-white border border-gray-100 rounded-xl flex items-center gap-3 hover:border-brand-blue/30 transition-colors shadow-sm">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
                    {deal.contact.name?.[0] || '?' }
                  </div>
                  <div>
                    <div className="text-sm font-bold text-navy">{deal.contact.name}</div>
                    <div className="text-xs text-gray-500">Primary Contact</div>
                  </div>
                </Link>
              )}
              {stakeholders.map(s => (
                <Link key={s.id} to={`/app/entities/${s.id}`} className="p-4 bg-white border border-gray-100 rounded-xl flex items-center gap-3 hover:border-brand-blue/30 transition-colors shadow-sm">
                  <div className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm font-bold">
                    {s.name?.[0] || '?' }
                  </div>
                  <div>
                    <div className="text-sm font-bold text-navy">{s.name}</div>
                    <div className="text-xs text-gray-500">Stakeholder</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <div className="space-y-6">
            <CollapsibleSection title="What won it" content={deal.what_won} />
            <CollapsibleSection title="What almost killed it" content={deal.what_almost_killed} />
            <CollapsibleSection title="Lessons learned" content={deal.lessons} italic />
          </div>

          <div className="pt-12 border-t border-gray-100 flex justify-between text-xs text-gray-400 font-medium">
            <span>Created {new Date(deal.created_at).toLocaleDateString()}</span>
            <span>Last updated {new Date(deal.updated_at).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Facts Panel */}
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Details</h4>
            
            <div className="space-y-6">
              <FactItem label="Revenue Band" value={deal.revenue_band || 'Undisclosed'} />
              <FactItem label="Close Date" value={deal.close_date ? new Date(deal.close_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Pending'} />
              
              <div className="pt-4 border-t border-gray-100">
                <FactItem label="Privacy" value={deal.privacy_flag === 'personal' ? 'Private to you' : 'Shareable (Anonymized)'} />
                <Button 
                  onClick={togglePrivacy}
                  className="w-full mt-4 bg-gray-50 border border-gray-200 text-gray-700 text-sm font-bold py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-100"
                >
                  {deal.privacy_flag === 'personal' ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  Make {deal.privacy_flag === 'personal' ? 'Shareable' : 'Private'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FactItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[12px] font-bold text-gray-400 font-display">{label}</div>
      <div className="text-sm font-bold text-navy font-body">{value}</div>
    </div>
  );
}

function CollapsibleSection({ title, content, italic }: { title: string; content: string | null; italic?: boolean }) {
  const [isOpen, setIsOpen] = useState(true);
  if (!content) return null;

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-bold text-navy font-display uppercase tracking-wider">{title}</span>
        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>
      {isOpen && (
        <div className={`p-6 text-sm text-gray-700 font-body leading-relaxed whitespace-pre-wrap ${italic ? 'italic text-gray-600 border-l-4 border-brand-blue/20' : ''}`}>
          {content}
        </div>
      )}
    </div>
  );
}
