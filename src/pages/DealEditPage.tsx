import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDeal, useDealMutations } from '../hooks/useDeals';
import { useEntities } from '../features/entities/useEntities';
import { ArrowLeft, Save, X, Plus } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { REVENUE_BANDS, DEAL_OUTCOMES } from '../types/Deal';

export function DealEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const { deal, loading: dealLoading } = useDeal(id);
  const { createDeal, updateDeal } = useDealMutations();
  const { entities, loading: entitiesLoading } = useEntities();

  const [formData, setFormData] = useState({
    company_anonymized: '',
    company_label: '',
    contact_id: '',
    revenue_band: 'undisclosed',
    outcome: 'in-progress',
    close_date: '',
    product_categories: [] as string[],
    what_won: '',
    what_almost_killed: '',
    lessons: '',
    stakeholder_contact_ids: [] as string[],
    privacy_flag: 'personal'
  });

  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (deal && isEdit) {
      setFormData({
        company_anonymized: deal.company_anonymized || '',
        company_label: deal.company_label || '',
        contact_id: deal.contact_id || '',
        revenue_band: deal.revenue_band || 'undisclosed',
        outcome: deal.outcome || 'in-progress',
        close_date: deal.close_date || '',
        product_categories: deal.product_categories || [],
        what_won: deal.what_won || '',
        what_almost_killed: deal.what_almost_killed || '',
        lessons: deal.lessons || '',
        stakeholder_contact_ids: deal.stakeholder_contact_ids || [],
        privacy_flag: deal.privacy_flag || 'personal'
      });
    }
  }, [deal, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      if (isEdit) {
        await updateDeal(id!, formData);
      } else {
        const { error } = await createDeal(formData);
        if (error) throw error;
      }
      navigate(isEdit ? `/app/deals/${id}` : '/app/deals');
    } catch (err) {
      console.error(err);
      alert('Failed to save deal');
    } finally {
      setSaving(false);
    }
  };

  const addCategory = () => {
    if (newCategory && !formData.product_categories.includes(newCategory)) {
      setFormData({ ...formData, product_categories: [...formData.product_categories, newCategory] });
      setNewCategory('');
    }
  };

  const removeCategory = (cat: string) => {
    setFormData({ ...formData, product_categories: formData.product_categories.filter(c => c !== cat) });
  };

  if ((dealLoading && isEdit) || entitiesLoading) return <div className="p-8 text-center animate-pulse">Loading...</div>;

  const contacts = entities.filter(e => e.entity_type === 'contact');

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </button>
        <h1 className="text-2xl font-bold font-display text-navy">{isEdit ? 'Edit Deal' : 'New Deal Record'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-navy font-display">Company Anonymized (Display Name)</label>
              <input
                required
                type="text"
                placeholder="e.g., [European Bank, UK Retail]"
                value={formData.company_anonymized}
                onChange={e => setFormData({ ...formData, company_anonymized: e.target.value })}
                className="w-full px-4 py-2 bg-[#F4F6FB] border-none rounded-xl text-sm focus:ring-2 focus:ring-brand-blue/20 outline-none"
              />
              <p className="text-[11px] text-gray-400 font-medium">This is how the deal will appear in your public profile or shared reports.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-navy font-display">Private Label (Internal Only)</label>
              <input
                type="text"
                placeholder="e.g., HSBC UK"
                value={formData.company_label}
                onChange={e => setFormData({ ...formData, company_label: e.target.value })}
                className="w-full px-4 py-2 bg-[#F4F6FB] border-none rounded-xl text-sm focus:ring-2 focus:ring-brand-blue/20 outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-navy font-display">Primary Contact</label>
              <select
                required
                value={formData.contact_id}
                onChange={e => setFormData({ ...formData, contact_id: e.target.value })}
                className="w-full px-4 py-2 bg-[#F4F6FB] border-none rounded-xl text-sm focus:ring-2 focus:ring-brand-blue/20 outline-none"
              >
                <option value="">Select a contact...</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-navy font-display">Revenue Band</label>
              <select
                value={formData.revenue_band}
                onChange={e => setFormData({ ...formData, revenue_band: e.target.value as any })}
                className="w-full px-4 py-2 bg-[#F4F6FB] border-none rounded-xl text-sm focus:ring-2 focus:ring-brand-blue/20 outline-none"
              >
                {REVENUE_BANDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-navy font-display">Outcome</label>
              <div className="flex flex-wrap gap-2">
                {DEAL_OUTCOMES.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, outcome: o.value })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      formData.outcome === o.value 
                        ? 'bg-brand-blue text-white shadow-md scale-105' 
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-navy font-display">Close Date</label>
              <input
                type="date"
                value={formData.close_date}
                onChange={e => setFormData({ ...formData, close_date: e.target.value })}
                className="w-full px-4 py-2 bg-[#F4F6FB] border-none rounded-xl text-sm focus:ring-2 focus:ring-brand-blue/20 outline-none"
              />
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-sm font-bold text-navy font-display">Product Categories & Technologies</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.product_categories.map(cat => (
                <span key={cat} className="flex items-center gap-1 px-3 py-1 bg-brand-blue/10 text-brand-blue rounded-full text-xs font-bold">
                  {cat}
                  <button type="button" onClick={() => removeCategory(cat)} className="hover:text-brand-blue-dark">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add category (e.g. ERP, APAC Expansion, Cloud Migration)"
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCategory())}
                className="flex-1 px-4 py-2 bg-[#F4F6FB] border-none rounded-xl text-sm focus:ring-2 focus:ring-brand-blue/20 outline-none"
              />
              <button
                type="button"
                onClick={addCategory}
                className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Plus className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>

          <div className="space-y-4">
             <div className="space-y-2">
                <label className="text-sm font-bold text-navy font-display">What won it?</label>
                <textarea
                  value={formData.what_won}
                  onChange={e => setFormData({ ...formData, what_won: e.target.value })}
                  placeholder="Key value props, stakeholders, unique insights..."
                  className="w-full px-4 py-3 bg-[#F4F6FB] border-none rounded-xl text-sm focus:ring-2 focus:ring-brand-blue/20 outline-none min-h-[100px]"
                />
             </div>
             <div className="space-y-2">
                <label className="text-sm font-bold text-navy font-display">What almost killed it?</label>
                <textarea
                  value={formData.what_almost_killed}
                  onChange={e => setFormData({ ...formData, what_almost_killed: e.target.value })}
                  placeholder="Objections, competitors, internal friction..."
                  className="w-full px-4 py-3 bg-[#F4F6FB] border-none rounded-xl text-sm focus:ring-2 focus:ring-brand-blue/20 outline-none min-h-[100px]"
                />
             </div>
             <div className="space-y-2">
                <label className="text-sm font-bold text-navy font-display">Lessons Learned</label>
                <textarea
                  value={formData.lessons}
                  onChange={e => setFormData({ ...formData, lessons: e.target.value })}
                  placeholder="What would you do differently next time?"
                  className="w-full px-4 py-3 bg-[#F4F6FB] border-none rounded-xl text-sm focus:ring-2 focus:ring-brand-blue/20 outline-none min-h-[80px]"
                />
             </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button 
            type="button" 
            onClick={() => navigate(-1)}
            className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50"
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            loading={saving}
            className="px-8 py-2 brand-gradient text-white rounded-xl font-bold shadow-lg"
          >
            <Save className="w-4 h-4 mr-2 inline" />
            {isEdit ? 'Update Record' : 'Archives & Save'}
          </Button>
        </div>
      </form>
    </div>
  );
}
