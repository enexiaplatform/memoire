import { NavLink } from 'react-router-dom';
import { BookOpen, CalendarCheck2, GitBranch, MessageCircleQuestion, Settings, Target } from 'lucide-react';
import { usePlanLimits } from '../../hooks/usePlanLimits';

const navItems = [
  { to: '/app/today', label: 'Today', icon: <CalendarCheck2 className="h-5 w-5" /> },
  { to: '/app/journey', label: 'Journey', icon: <GitBranch className="h-5 w-5" /> },
  { to: '/app/accounts', label: 'Accounts', icon: <BookOpen className="h-5 w-5" /> },
  { to: '/app/opportunities', label: 'Opportunities', icon: <Target className="h-5 w-5" /> },
  { to: '/app/ask', label: 'Ask Memoire', icon: <MessageCircleQuestion className="h-5 w-5" /> },
];

export function Sidebar() {
  const { currentTier } = usePlanLimits();
  const isPro = currentTier !== 'free';

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-[220px] flex-col border-r border-[#243447] bg-navy shadow-xl">
      <div className="flex h-16 items-center border-b border-[#243447] px-6">
        <span className="brand-gradient-text text-2xl font-extrabold tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Memoire
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `relative flex items-center gap-3 px-6 py-2.5 text-[14px] font-medium transition-all ${
                isActive ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white/90'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="opacity-80">{item.icon}</span>
                {item.label}
                {isActive && <div className="brand-gradient absolute bottom-0 right-0 top-0 w-1" />}
              </>
            )}
          </NavLink>
        ))}

        <div className="mx-4 mt-4 border-t border-white/10 pt-4">
          <NavLink
            to="/app/settings"
            className={({ isActive }) =>
              `relative flex items-center gap-3 rounded-lg px-2 py-2 text-[13px] font-medium transition-all ${
                isActive ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/5 hover:text-white/75'
              }`
            }
          >
            <Settings className="h-4 w-4 opacity-80" />
            Settings
          </NavLink>
        </div>

        <div className="mx-4 mt-6 rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Sales Memory Loop</p>
          <p className="mt-2 text-sm leading-5 text-white/70">Capture, structure, remember, act, ask, learn.</p>
        </div>
      </nav>

      <div className="border-t border-[#243447] p-4">
        <div className="flex items-center gap-3 px-2">
          <div className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-white">
            U
          </div>
          <div>
            <div className="text-sm font-medium text-white">User</div>
            <div className="text-xs text-white/40">{isPro ? 'Personal plan' : 'Free plan'}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
