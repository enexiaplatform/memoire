import { Card } from '../../components/ui/Card';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { SearchPaywall } from '../../components/paywall/SearchPaywall';

export function SearchPage() {
  const { canSearch, loading } = usePlanLimits();

  if (loading) return null;

  if (!canSearch) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Search</h1>
        <SearchPaywall />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Search</h1>
      <Card>
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-memoire-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-memoire-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-gray-900 mb-2">Search coming soon</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Search across all your professional memories — contacts, companies, meeting notes, and insights — powered by AI.
          </p>
        </div>
      </Card>
    </div>
  );
}

