import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeals } from '../hooks/useDeals';
import { Briefcase, Search, Plus, Filter } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { DEAL_OUTCOMES } from '../types/Deal';

export function DealArchivePage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [revenueFilter, setRevenueFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('recent');

  const { deals, loading } = useDeals();

  const filteredDeals = useMemo(() => {
    return deals.filter(deal => {
      const matchesSearch = 
        !searchQuery || 
        (deal.company_anonymized || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (deal.contact?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        deal.product_categories.some(cat => cat.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesOutcome = outcomeFilter === 'all' || deal.outcome === outcomeFilter;
      const matchesRevenue = revenueFilter === 'all' || deal.revenue_band === revenueFilter;

      return matchesSearch && matchesOutcome && matchesRevenue;
    }).sort((a, b) => {
      if (sortOrder === 'recent') return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      if (sortOrder === 'close_date') return new Date(b.close_date || 0).getTime() - new Date(a.close_date || 0).getTime();
      if (sortOrder === 'revenue') {
        const bands = ['undisclosed','<$10K','$10-50K','$50-250K','$250K-$1M','>$1M'];
        return bands.indexOf(b.revenue_band || 'undisclosed') - bands.indexOf(a.revenue_band || 'undisclosed');
      }
      return 0;
    });
  }, [deals, searchQuery, outcomeFilter, revenueFilter, sortOrder]);

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 w-full">
      <div className="mb-8">
        <h1 className="text-[32px] font-bold font-display text-navy mb-2">Deal Archive</h1>
        <p className="text-gray-500 font-body">Your portable record of what you've sold, learned, and built.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search deals, companies, stakeholders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all"
          />
        </div>
        
        <div className="flex gap-2">
          <select 
            value={outcomeFilter} 
            onChange={(e) => setOutcomeFilter(e.target.value)}
            className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-brand-blue/20"
          >
            <option value="all">All Outcomes</option>
            {DEAL_OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <Button 
            className="brand-gradient text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2"
            onClick={() => navigate('/app/deals/new')}
          >
            <Plus className="w-4 h-4" />
            New Deal
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredDeals.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Company</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Categories</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Revenue</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Close Date</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredDeals.map(deal => (
                  <tr 
                    key={deal.id} 
                    onClick={() => navigate(`/app/deals/${deal.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-navy font-display">{deal.company_anonymized || 'Unspecified'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">
                          {deal.contact?.name?.[0] || '?' }
                        </div>
                        <span className="text-sm text-gray-600">{deal.contact?.name || 'Manual entry'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {deal.product_categories.slice(0, 2).map(cat => (
                          <span key={cat} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold transition-all">
                            {cat}
                          </span>
                        ))}
                        {deal.product_categories.length > 2 && (
                          <span className="text-[10px] text-gray-400 font-medium">+{deal.product_categories.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                      {deal.revenue_band}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {deal.close_date ? new Date(deal.close_date).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span 
                        className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                        style={{ 
                          backgroundColor: `${DEAL_OUTCOMES.find(o => o.value === deal.outcome)?.color}15`,
                          color: DEAL_OUTCOMES.find(o => o.value === deal.outcome)?.color
                        }}
                      >
                        {deal.outcome}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-xl border-2 border-dashed border-gray-200">
          <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-navy font-display mb-2">No deals yet</h2>
          <p className="text-gray-500 max-w-sm mx-auto mb-8">
            Your career sales record starts here. Add your first deal — won, lost, or in progress.
          </p>
          <Button 
            className="brand-gradient text-white font-bold px-8 py-3 rounded-full"
            onClick={() => navigate('/app/deals/new')}
          >
            Add first deal
          </Button>
        </div>
      )}
    </div>
  );
}
