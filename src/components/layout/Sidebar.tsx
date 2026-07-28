import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Banknote, BookOpen, ClipboardList, Database, History, Network, Search, Settings, Sun, Target, X } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { getUserDisplayName, getUserInitials } from '../../utils/userDisplay';
import { prefetchAppRoute } from '../../utils/routePrefetch';
import { useDemoWorkspaceMode } from '../../hooks/useDemoWorkspaceMode';
import { BrandWordmark } from '../brand/BrandWordmark';
import { isFounderImportUser } from '../../services/importAuditStore';
import { getFeature, globalActions, primaryNavigation } from '../../config/featureRegistry';

// One flat list of six. No tiers, no unlock conditions, no "advanced" drawer -
// a rail that grows sections is how a focused product becomes a suite again.
// The order follows the operating loop: what to do now, who it is for, what it
// is worth, where the money sits, when it happens, what it taught us.
const primaryIcons: Record<string, ReactNode> = {
  today: <Sun className="h-5 w-5" />,
  accounts: <BookOpen className="h-5 w-5" />,
  opportunities: <Target className="h-5 w-5" />,
  money: <Banknote className="h-5 w-5" />,
  timeline: <History className="h-5 w-5" />,
  review: <ClipboardList className="h-5 w-5" />,
};

const globalIcons: Record<string, ReactNode> = {
  'search-insights': <Search className="h-5 w-5" />,
  'business-vault': <Network className="h-5 w-5" />,
  settings: <Settings className="h-5 w-5" />,
};

export function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, profile } = useAuthContext();
  const demoActive = useDemoWorkspaceMode();
  const displayName = demoActive ? 'Demo workspace' : getUserDisplayName(user, profile);
  const initials = demoActive ? 'D' : getUserInitials(user, profile);

  const primaryItems = primaryNavigation.map((feature) => ({
    to: feature.route as string,
    label: feature.label,
    icon: primaryIcons[feature.id],
  }));

  // Search and Settings are reachable from anywhere; Capture is the button in
  // the top bar, so it is not repeated here.
  const globalItems = globalActions
    .filter((feature) => feature.id !== 'capture')
    .map((feature) => ({
      to: feature.route as string,
      label: feature.label,
      icon: globalIcons[feature.id],
    }));

  // Founder Import is operator tooling, not a seventh destination. It appears
  // only for the founder account, stays visually separated from the product,
  // and - like everything else in this rail - is declared in the registry
  // rather than hard-coded here.
  const founderImport = getFeature('founder-import');
  const founderItems = isFounderImportUser(user?.email) && founderImport?.route
    ? [{ to: founderImport.route, label: 'Import Review', icon: <Database className="h-5 w-5" /> }]
    : [];

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `relative flex items-center gap-3 whitespace-nowrap px-5 py-2.5 text-[14px] font-medium transition-all ${
      isActive ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white/90'
    }`;

  const renderNavItem = (item: { to: string; label: string; icon: ReactNode }) => (
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
  );

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

      <nav className="flex-1 overflow-y-auto py-4" aria-label="Primary">
        <div className="space-y-1">
          {primaryItems.map(renderNavItem)}
        </div>

        <div className="mt-3 space-y-1 border-t border-white/10 pt-3">
          {globalItems.map(renderNavItem)}
        </div>

        {founderItems.length > 0 && (
          <div className="mt-3 border-t border-white/10 pt-3">
            <p className="px-5 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">
              Founder only
            </p>
            <div className="space-y-1">{founderItems.map(renderNavItem)}</div>
          </div>
        )}
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
