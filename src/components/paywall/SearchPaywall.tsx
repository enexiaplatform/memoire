import { useNavigate } from 'react-router-dom';

export function SearchPaywall() {
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto mt-12 text-center p-8 bg-white border border-gray-200 rounded-2xl shadow-sm">
      <div className="text-4xl mb-4">🔍</div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        AI Search is a Personal plan feature
      </h2>
      <p className="text-gray-500 mb-8 max-w-md mx-auto">
        Upgrade to search your memory with natural language, find complex relationships, and unlock unlimited entities.
      </p>
      
      <button
        onClick={() => navigate('/pricing')}
        className="px-6 py-3 bg-memoire-600 text-white font-medium rounded-lg hover:bg-memoire-700 transition"
      >
        Upgrade to Personal — $19/month
      </button>
    </div>
  );
}
