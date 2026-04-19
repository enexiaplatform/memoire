import { useState } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
  initialQuery?: string;
}

export function SearchBar({ onSearch, isLoading, initialQuery = '' }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full relative">
      <div className="relative flex items-center bg-[#F8FAFC] border-[1.5px] border-[#E2E8F0] rounded-full focus-within:border-[#1976D2] focus-within:shadow-[0_0_0_3px_rgba(25,118,210,0.10)] transition-all overflow-hidden p-1.5 focus-within:bg-white pl-5">
        <div className="text-[#94A3B8] mr-3">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask anything about your captures..."
          className="flex-1 bg-transparent border-none focus:ring-0 py-3 text-[16px] font-body text-[#1B2B3A] placeholder-[#94A3B8] w-full"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="ml-2 px-6 py-3 bg-[#1976D2] text-white rounded-full text-sm font-semibold font-display hover:bg-[#1565C0] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
        >
          Search
        </button>
      </div>
    </form>
  );
}
