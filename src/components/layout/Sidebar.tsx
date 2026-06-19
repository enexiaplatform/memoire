import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AlertTriangle, BookOpen, CalendarDays, ChevronDown, ClipboardList, Database, FileCheck2, FileText, GitBranch, LayoutDashboard, MessageCircleQuestion, NotebookPen, ReceiptText, Settings, Target, UsersRound, X } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { getUserDisplayName, getUserInitials } from '../../utils/userDisplay';
import { prefetchAppRoute } from '../../utils/routePrefetch';
import { useDemoWorkspaceMode } from '../../hooks/useDemoWorkspaceMode';
import { BrandWordmark } from '../brand/BrandWordmark';
import { isFounderImportUser } from '../../services/importAuditStore';

const primarySections = [
  {
    label: 'Workspace',
    items: [
      { to: '/app/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
      { to: '/app/onboarding/sales-operating-setup', label: 'Sales Setup', icon: <ClipboardList className="h-5 w-5" /> },
      { to: '/app/capture', label: 'Capture', icon: <NotebookPen className="h-5 w-5" /> },
      { to: '/app/opportunities', label: 'Opportunities', icon: <Target className="h-5 w-5" /> },
      { to: '/app/quotes', label: 'Quotes', icon: <ReceiptText className="h-5 w-5" /> },
      { to: '/app/accounts', label: 'Accounts', icon: <BookOpen className="h-5 w-5" /> },
    ],
  },
  {
    label: 'Review',
    items: [
      { to: '/app/reviews', label: 'Reviews', icon: <ClipboardList className="h-5 w-5" /> },
      { to: '/app/pipeline-defense', label: 'Pipeline Defense', icon: <FileCheck2 className="h-5 w-5" /> },
    ],
  },
];

const secondaryItems = [
  { to: '/app/calendar', label: 'Calendar', icon: <CalendarDays className="h-5 w-5" /> },
  { to: '/app/stakeholders', label: 'Stakeholders', icon: <UsersRound className="h-5 w-5" /> },
  { to: '/app/objections', label: 'Objections', icon: <AlertTriangle className="h-5 w-5" /> },
  { to: '/app/playbook', label: 'Playbook', icon: <BookOpen className="h-5 w-5" /> },
  { to: '/app/assets', label: 'Assets', icon: <FileText className="h-5 w-5" /> },
  { to: '/app/ask', label: 'Ask Memoire', icon: <MessageCircleQuestion className="h-5 w-5" /> },
  { to: '/app/journey', label: 'Journey', icon: <GitBranch className="h-5 w-5" /> },
];

export function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, profile } = useAuthContext();
  const location = useLocation();
  const demoActive = useDemoWorkspaceMode();
  const displayName = demoActive ? 'Demo workspace' : getUserDisplayName(user, profile);
  const initials = demoActive ? 'D' : getUserInitials(user, profile);
  const visibleSecondaryItems = isFounderImportUser(user?.email)
    ? [...secondaryItems, { to: '/app/imports', label: 'Import Review', icon: <Database className="h-5 w-5" /> }]
    : secondaryItems;
  const hasActiveSecondaryRoute = visibleSecondaryItems.some((item) => location.pathname.startsWith(item.to));
  const [moreOpen, setMoreOpen] = useState(hasActiveSecondaryRoute);

  useEffect(() => {
    if (hasActiveSecondaryRoute) setMoreOpen(true);
  }, [hasActiveSecondaryRoute]);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `relative flex items-center gap-3 px-5 py-2.5 text-[14px] font-medium transition-all ${
      isActive ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white/90'
    }`;

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden"
        />
      )}
      <aside className={`fixed left-0 top-0 z-50 flex h-full w-[220px] flex-col border-r border-[#243447] bg-navy shadow-xl transition-transform lg:z-40 lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
      <div className="flex h-16 items-center justify-between border-b border-[#243447] px-5">
        <BrandWordmark className="text-2xl" />
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white lg:hidden" title="Close navigation">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {primarySections.map((section) => (
          <div key={section.label} className="mb-3">
            <p className="px-5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">
              {section.label}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  onMouseEnter={() => prefetchAppRoute(item.to)}
                  onFocus={() => prefetchAppRoute(item.to)}
                  className={navLinkClass}
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

        <div className="mx-3 mt-2 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setMoreOpen((current) => !current)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 hover:bg-white/5 hover:text-white/70"
          >
            More tools
            <ChevronDown className={`h-4 w-4 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
          </button>
          {moreOpen && (
            <div className="mt-1 space-y-1">
              {visibleSecondaryItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  onMouseEnter={() => prefetchAppRoute(item.to)}
                  onFocus={() => prefetchAppRoute(item.to)}
                  className={navLinkClass}
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
          )}
        </div>

        <div className="mx-3 mt-3 border-t border-white/10 pt-3">
          <NavLink
            to="/app/settings"
            onClick={onClose}
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
      </nav>

      <div className="border-t border-[#243447] p-4">
        <div className="flex items-center gap-3 px-2">
          <div className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-white">
            {initials}
          </div>
          <div>
            <div className="max-w-[132px] truncate text-sm font-medium text-white" title={displayName}>{displayName}</div>
            <div className="text-xs text-white/40">{demoActive ? 'Local sample data' : 'Personal workspace'}</div>
          </div>
        </div>
      </div>
      </aside>
    </>
  );
}
