import { Card } from '../../components/ui/Card';

export function EntitiesPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Entities</h1>
      <Card>
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-memoire-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-memoire-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-gray-900 mb-2">Entities coming soon</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Browse and manage your contacts, companies, deals, meetings, and insights — all connected in your professional knowledge graph.
          </p>
        </div>
      </Card>
    </div>
  );
}
