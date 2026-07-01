import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

export function SearchPaywall() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-brand-blue">
        <Search className="h-5 w-5" />
      </div>
      <h2 className="mb-2 text-xl font-semibold text-gray-900">
        AI Search is part of early access
      </h2>
      <p className="mx-auto mb-8 max-w-md text-gray-500">
        Request access to search your sales memory with natural language and review account relationships.
      </p>

      <button
        onClick={() => navigate('/pricing')}
        className="rounded-lg bg-memoire-600 px-6 py-3 font-medium text-white transition hover:bg-memoire-700"
      >
        See access options
      </button>
    </div>
  );
}
