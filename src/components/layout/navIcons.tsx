import type { ReactNode } from 'react';
import { Activity, BarChart3, BookOpen, CalendarDays, ClipboardList, Network, Package, Search, Settings, Sun, Target, UsersRound } from 'lucide-react';

/**
 * One icon per rail destination, shared by the sidebar and the phone tab bar so
 * the same destination never wears two faces.
 *
 * The registry owns which items exist and what they are called; this owns what
 * they look like. Keyed by feature id rather than by route, because a route can
 * be redirected and an id cannot.
 */
export function navIcon(featureId: string, className = 'h-[18px] w-[18px]'): ReactNode {
  switch (featureId) {
    case 'today': return <Sun className={className} />;
    case 'timeline': return <CalendarDays className={className} />;
    case 'business-lens': return <BarChart3 className={className} />;
    case 'review': return <ClipboardList className={className} />;
    case 'accounts': return <BookOpen className={className} />;
    case 'stakeholders': return <UsersRound className={className} />;
    case 'opportunities': return <Target className={className} />;
    case 'money': return <Package className={className} />;
    case 'search-insights': return <Search className={className} />;
    case 'activity': return <Activity className={className} />;
    case 'business-vault': return <Network className={className} />;
    case 'settings': return <Settings className={className} />;
    default: return null;
  }
}
