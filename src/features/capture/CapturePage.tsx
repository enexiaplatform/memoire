import { Card } from '../../components/ui/Card';

export function CapturePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Capture</h1>
      <Card>
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-memoire-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-memoire-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-gray-900 mb-2">Capture interface coming soon</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Quickly capture meeting notes, client conversations, and business intelligence.
            AI will automatically extract entities and relationships.
          </p>
        </div>
      </Card>
    </div>
  );
}
