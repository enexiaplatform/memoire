import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Info } from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import { supabase } from '../lib/supabase';

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
    void getUser();

    const visits = parseInt(localStorage.getItem('dashboard_visits') || '0', 10);
    if (visits < 5) {
      setShowBanner(true);
      localStorage.setItem('dashboard_visits', (visits + 1).toString());
    }
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-navy" />
      </div>
    );
  }

  return (
    <div className="mx-auto h-full max-w-5xl flex-1 animate-in space-y-10 px-4 py-8 duration-200 fade-in zoom-in-95 sm:px-6">
      <header>
        <h1 className="font-display text-[32px] font-bold tracking-tight text-navy">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 font-body text-[14px] text-gray-500">
          Your private sales memory - visible only to you.
        </p>
      </header>

      {showBanner && (
        <div className="flex items-start space-x-4 rounded-xl bg-[#F4F6FB] p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-navy" />
          <div className="flex-1">
            <p className="text-sm font-medium text-navy">This workspace is for private sales review.</p>
            <p className="mt-1 text-sm text-navy/80">
              Memoire is not a CRM replacement, public score, or third-party assessment. No data on this page is shared, ranked, or compared with other users.
            </p>
            <div className="mt-3 flex items-center space-x-4">
              <Link to="/app/settings" className="text-sm font-medium text-navy hover:underline">
                Learn more -&gt;
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
        <h2 className="mb-4 font-display text-[18px] font-bold text-navy">Activity Heatmap</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-6">
          {heatmap.length === 0 ? (
            <p className="text-sm text-gray-500">No activity yet.</p>
          ) : (
            <div className="flex min-w-max gap-1">
              {Array.from({ length: 13 }).map((_, weekIdx) => (
                <div key={weekIdx} className="flex flex-col gap-1">
                  {Array.from({ length: 7 }).map((_, dayIdx) => {
                    const cell = heatmap[weekIdx * 7 + dayIdx];
                    if (!cell) return <div key={dayIdx} className="h-[14px] w-[14px] rounded-[2px]" />;

                    let bgClass = 'bg-[#EAECF0]';
                    if (cell.count > 0 && cell.count <= 2) bgClass = 'bg-[#C7D2FE]';
                    else if (cell.count > 2 && cell.count <= 5) bgClass = 'bg-[#818CF8]';
                    else if (cell.count > 5) bgClass = 'bg-[#4F46E5]';

                    return (
                      <div
                        key={dayIdx}
                        title={`${cell.date}: ${cell.count} captures`}
                        className={`h-[14px] w-[14px] rounded-[2px] transition-colors ${bgClass}`}
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
        <h2 className="mb-4 font-display text-[18px] font-bold text-navy">Knowledge Inventory</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {inventory.map((item) => (
            <div key={item.type} className="flex flex-col justify-between rounded-xl border border-[#E5E7EB] bg-white p-6">
              <p className="mb-4 font-display text-[36px] font-bold leading-none text-navy">{item.count}</p>
              <div className="flex items-center justify-between">
                <p className="font-body text-[12px] font-medium uppercase tracking-wide text-gray-500">
                  {item.type}
                </p>
                <Link to="/app/entities" className="text-[12px] font-medium text-gray-400 transition-colors hover:text-navy">
                  View all -&gt;
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 font-display text-[18px] font-bold text-navy">Recent Activity</h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {recentCaptures.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">No recent captures</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentCaptures.map((capture) => (
                  <div key={capture.id} className="flex items-center justify-between p-4 transition-colors hover:bg-gray-50">
                    <div className="min-w-0 pr-4">
                      <p className="mb-1 text-xs text-gray-400">{new Date(capture.created_at).toLocaleDateString()}</p>
                      <p className="truncate text-sm font-medium text-gray-800">{capture.raw_text}</p>
                    </div>
                    <div className="flex shrink-0 items-center space-x-3">
                      {capture.anonymization_state && capture.anonymization_state !== 'original' && (
                        <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide
                          ${capture.anonymization_state === 'anonymized' ? 'border-[#4F46E5]/20 bg-[#4F46E5]/10 text-[#4F46E5]' : ''}
                          ${capture.anonymization_state === 'mixed' ? 'border-[#D97706]/20 bg-[#D97706]/10 text-[#D97706]' : ''}
                        `}>
                          {capture.anonymization_state}
                        </span>
                      )}
                      <Link to="/app/history" className="text-gray-400 hover:text-navy">
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-4 font-display text-[18px] font-bold text-navy">Top Context</h2>
          <div className="flex h-[280px] flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-8 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-50">
              <Info className="h-5 w-5 text-gray-400" />
            </div>
            <p className="mb-2 text-sm font-medium text-gray-900">Start searching and linking</p>
            <p className="max-w-[250px] text-sm text-gray-500">
              Your most-used context will appear here as you interact with Memoire.
            </p>
          </div>
        </section>
      </div>

      <footer className="mt-8 pt-8 pb-4">
        <p className="text-center text-[12px] text-gray-500">
          Memoire is personal sales memory, not a CRM replacement, credit report, or public scoring system.{' '}
          <Link to="/app/settings" className="hover:text-gray-700 hover:underline">
            Read the full boundaries -&gt;
          </Link>
        </p>
      </footer>
    </div>
  );
}
