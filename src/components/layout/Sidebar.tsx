import { NavLink } from 'react-router-dom';
import { AlertTriangle, BookOpen, CalendarDays, ClipboardList, FileCheck2, FileText, GitBranch, LayoutDashboard, MessageCircleQuestion, NotebookPen, Settings, Target, UsersRound } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { getUserDisplayName, getUserInitials } from '../../utils/userDisplay';
import { prefetchAppRoute } from '../../utils/routePrefetch';
import { hasLocalSampleData } from '../../utils/dataMode';
import { loadSalesWorkspaceData } from '../../services/workspaceData';

const navSections = [
  {
    label: 'Today',
    items: [
      { to: '/app/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
      { to: '/app/capture', label: 'Capture', icon: <NotebookPen className="h-5 w-5" /> },
      { to: '/app/calendar', label: 'Calendar', icon: <CalendarDays className="h-5 w-5" /> },
      { to: '/app/ask', label: 'Ask Memoire', icon: <MessageCircleQuestion className="h-5 w-5" /> },
    ],
  },
  {
    label: 'Deals',
    items: [
      { to: '/app/opportunities', label: 'Opportunities', icon: <Target className="h-5 w-5" /> },
      { to: '/app/stakeholders', label: 'Stakeholders', icon: <UsersRound className="h-5 w-5" /> },
      { to: '/app/objections', label: 'Objections', icon: <AlertTriangle className="h-5 w-5" /> },
    ],
  },
  {
    label: 'Memory',
    items: [
      { to: '/app/accounts', label: 'Accounts', icon: <BookOpen className="h-5 w-5" /> },
      { to: '/app/reviews', label: 'Reviews', icon: <ClipboardList className="h-5 w-5" /> },
      { to: '/app/journey', label: 'Journey', icon: <GitBranch className="h-5 w-5" /> },
    ],
  },
  {
    label: 'Library',
    items: [
      { to: '/app/playbook', label: 'Playbook', icon: <BookOpen className="h-5 w-5" /> },
      { to: '/app/assets', label: 'Assets', icon: <FileText className="h-5 w-5" /> },
    ],
  },
  {
    label: 'Pipeline Review',
    items: [
      { to: '/app/pipeline-defense', label: 'Pipeline Defense', icon: <FileCheck2 className="h-5 w-5" /> },
    ],
  },
];

export function Sidebar() {
  const { user, profile } = useAuthContext();
  const displayName = getUserDisplayName(user, profile);
  const initials = getUserInitials(user, profile);
  const warmNavigationTarget = (route: string) => {
    prefetchAppRoute(route);
    loadSalesWorkspaceData(hasLocalSampleData() ? undefined : user?.id).catch(() => {
      // Destination routes keep their own local/cloud fallback.
    });
  };

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-[220px] flex-col border-r border-[#243447] bg-navy shadow-xl">
      <div className="flex h-16 items-center border-b border-[#243447] px-6">
        <span className="brand-gradient-text text-2xl font-extrabold tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Memoire
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {navSections.map((section) => (
          <div key={section.label} className="mb-3">
            <p className="px-6 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">
              {section.label}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onMouseEnter={() => warmNavigationTarget(item.to)}
                  onFocus={() => warmNavigationTarget(item.to)}
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
            </div>
          </div>
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
          <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Stuck Deal Queue</p>
          <p className="mt-2 text-sm leading-5 text-white/70">Catch quiet deals, fix follow-up, remember context.</p>
        </div>
      </nav>

      <div className="border-t border-[#243447] p-4">
        <div className="flex items-center gap-3 px-2">
          <div className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-white">
            {initials}
          </div>
          <div>
            <div className="max-w-[132px] truncate text-sm font-medium text-white" title={displayName}>{displayName}</div>
            <div className="text-xs text-white/40">Personal workspace</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
