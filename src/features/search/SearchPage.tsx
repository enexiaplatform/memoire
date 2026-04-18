import { useSearch } from './useSearch';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { SearchPaywall } from '../../components/paywall/SearchPaywall';
import { SearchBar } from './SearchBar';
import { AnswerCard } from './AnswerCard';
import { SourceCard } from './SourceCard';
import { SuggestedQuestions } from './SuggestedQuestions';
import { useState } from 'react';

export function SearchPage() {
  const { canSearch, loading: limitsLoading } = usePlanLimits();
  const { searchMemory, results, loading: searchLoading, error } = useSearch();
  const [currentQuery, setCurrentQuery] = useState('');

  if (limitsLoading) return null;

  if (!canSearch) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Search</h1>
        <SearchPaywall />
      </div>
    );
  }

  const handleSearch = (query: string) => {
    setCurrentQuery(query);
    searchMemory(query);
  };

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col py-8 px-4 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Search your memory</h1>
        <SearchBar onSearch={handleSearch} isLoading={searchLoading} initialQuery={currentQuery} />
      </div>

      <div className="flex-1">
        {/* Loading State */}
        {searchLoading && (
          <div className="text-center py-20 animate-pulse">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-memoire-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-500 font-medium">Searching your memory...</p>
          </div>
        )}

        {/* Error State */}
        {error && !searchLoading && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg text-center font-medium border border-red-100">
            {error}
          </div>
        )}

        {/* Empty State */}
        {!results && !searchLoading && !error && (
          <div className="text-center py-20 opacity-50">
            <p className="text-gray-500 mb-4">Try asking:</p>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>"What did Minh say about pricing?"</li>
              <li>"Which companies mentioned the CMD product?"</li>
              <li>"What were my insights from last month?"</li>
            </ul>
          </div>
        )}

        {/* Results State */}
        {results && !searchLoading && results.has_results && (
          <div className="space-y-6">
            <AnswerCard answer={results.answer} sourceCount={results.sources.length} />
            
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">
                Sources ({results.sources.length} found)
              </h3>
              <div className="space-y-3">
                {results.sources.map((source, index) => (
                  <SourceCard key={source.id} source={source} index={index} />
                ))}
              </div>
            </div>

            <SuggestedQuestions 
              questions={results.suggested_questions} 
              onSelect={handleSearch} 
            />
          </div>
        )}

        {/* No Results State */}
        {results && !searchLoading && !results.has_results && (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nothing found</h3>
            <p className="text-gray-500 mb-6">
              I couldn't find anything relevant in your captures.
              Try capturing more notes, or rephrase your question.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
