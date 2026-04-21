import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDashboard } from '../hooks/useDashboard';
import { supabase } from '../lib/supabase';
import { Info, ArrowRight } from 'lucide-react';

export function DashboardPage() {
  const { heatmap, inventory, recentCaptures, loading } = useDashboard();
  const [firstName, setFirstName] = useState('');
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    async function getUser() {
      const { data } = await supabase.auth.getUser();
      if (data.user?.user_metadata?.display_name) {
        setFirstName(data.user.user_metadata.display_name.split(' ')[0]);
      } else {
        setFirstName('there');
      }
    }
    getUser();

    // Check visit count
    const visits = parseInt(localStorage.getItem('dashboard_visits') || '0', 10);
    if (visits < 5) {
      setShowBanner(true);
      localStorage.setItem('dashboard_visits', (visits + 1).toString());
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-10 animate-in fade-in zoom-in-95 duration-200">
      <header>
        <h1 className="text-[32px] font-bold font-display text-navy tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="text-[14px] font-body text-gray-500 mt-1">
          Your private knowledge surface — visible only to you.
        </p>
      </header>

      {showBanner && (
        <div className="bg-[#F4F6FB] rounded-xl p-4 flex items-start space-x-4">
          <Info className="w-5 h-5 text-navy shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-navy">This dashboard is a personal reflection tool.</p>
            <p className="text-sm text-navy/80 mt-1">
              It is NOT a professional certification, skill rating, or hiring signal. No data on this page is shared, ranked, or compared with other users.
            </p>
            <div className="flex items-center space-x-4 mt-3">
              <Link to="/app/settings" className="text-sm font-medium text-navy hover:underline">
                Learn more &rarr;
              </Link>
              <button
                onClick={() => setShowBanner(false)}
                className="text-sm font-medium text-navy/60 hover:text-navy"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <section>
        <h2 className="text-[18px] font-bold font-display text-navy mb-4">Activity Heatmap</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-6 overflow-x-auto">
          {heatmap.length === 0 ? (
            <p className="text-sm text-gray-500">No activity yet.</p>
          ) : (
            <div className="flex gap-1 min-w-max">
              {/* Group cells by week */}
              {Array.from({ length: 13 }).map((_, weekIdx) => (
                <div key={weekIdx} className="flex flex-col gap-1">
                  {Array.from({ length: 7 }).map((_, dayIdx) => {
                    const cell = heatmap[weekIdx * 7 + dayIdx];
                    if (!cell) return <div key={dayIdx} className="w-[14px] h-[14px] rounded-[2px]" />;
                    
                    let bgClass = "bg-[#EAECF0]";
                    if (cell.count > 0 && cell.count <= 2) bgClass = "bg-[#C7D2FE]";
                    else if (cell.count > 2 && cell.count <= 5) bgClass = "bg-[#818CF8]";
                    else if (cell.count > 5) bgClass = "bg-[#4F46E5]";

                    return (
                      <div
                        key={dayIdx}
                        title={`${cell.date}: ${cell.count} captures`}
                        className={`w-[14px] h-[14px] rounded-[2px] ${bgClass} transition-colors`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-[18px] font-bold font-display text-navy mb-4">Knowledge Inventory</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {inventory.map((item) => (
            <div key={item.type} className="bg-white border border-[#E5E7EB] rounded-xl p-6 flex flex-col justify-between">
              <p className="text-[36px] font-display font-bold text-navy leading-none mb-4">{item.count}</p>
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-body uppercase tracking-wide text-gray-500 font-medium">
                  {item.type}
                </p>
                <Link to="/app/entities" className="text-[12px] font-medium text-gray-400 hover:text-navy transition-colors">
                  View all &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section>
          <h2 className="text-[18px] font-bold font-display text-navy mb-4">Recent Activity</h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {recentCaptures.length === 0 ? (
              <div className="p-6 text-sm text-gray-500 text-center">No recent captures</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentCaptures.map((capture) => (
                  <div key={capture.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="min-w-0 pr-4">
                      <p className="text-xs text-gray-400 mb-1">{new Date(capture.created_at).toLocaleDateString()}</p>
                      <p className="text-sm text-gray-800 font-medium truncate">{capture.raw_text}</p>
                    </div>
                    <div className="flex items-center space-x-3 shrink-0">
                      {capture.anonymization_state && capture.anonymization_state !== 'original' && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide
                          ${capture.anonymization_state === 'anonymized' ? 'bg-[#4F46E5]/10 text-[#4F46E5] border border-[#4F46E5]/20' : ''}
                          ${capture.anonymization_state === 'mixed' ? 'bg-[#D97706]/10 text-[#D97706] border border-[#D97706]/20' : ''}
                        `}>
                          {capture.anonymization_state}
                        </span>
                      )}
                      <Link to="/app/history" className="text-gray-400 hover:text-navy">
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-[18px] font-bold font-display text-navy mb-4">Top Context</h2>
          <div className="bg-white border border-gray-200 rounded-xl p-8 flex flex-col items-center justify-center text-center h-[280px]">
             {/* V1 Empty state as requested */}
             <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <Info className="w-5 h-5 text-gray-400" />
             </div>
             <p className="text-sm font-medium text-gray-900 mb-2">Start searching and linking</p>
             <p className="text-sm text-gray-500 max-w-[250px]">
               Your most-used context will appear here as you interact with Memoire.
             </p>
          </div>
        </section>
      </div>

      <footer className="pt-8 pb-4 mt-8">
        <p className="text-[12px] text-gray-500 text-center">
          Memoire is a personal knowledge tool. It is not a hiring signal, credit report, or third-party assessment.{' '}
          <Link to="/app/settings" className="hover:underline hover:text-gray-700">Read the full boundaries &rarr;</Link>
        </p>
      </footer>
    </div>
  );
}
