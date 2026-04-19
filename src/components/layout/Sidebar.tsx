import { NavLink } from 'react-router-dom';
import { usePlanLimits } from '../../hooks/usePlanLimits';

const navItems = [
  {
    to: '/app/capture',
    label: 'Capture',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    to: '/app/history',
    label: 'History',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    to: '/app/search',
    label: 'Search',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    to: '/app/entities',
    label: 'Entities',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    to: '/app/settings',
    label: 'Settings',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const { isPro } = usePlanLimits();

  return (
    <aside className="fixed left-0 top-0 h-full w-[220px] bg-navy flex flex-col z-40 shadow-xl border-r border-[#243447]">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-[#243447]">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-extrabold tracking-tight brand-gradient-text" style={{ fontFamily: 'Outfit, sans-serif' }}>Memoire</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-6 py-2.5 text-[14px] font-medium transition-all relative ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/55 hover:bg-white/5 hover:text-white/90'
              }`
            }
          >
            {({ isActive }) => (
               <>
                 <span className="opacity-80">{item.icon}</span>
                 {item.label}
                 {isActive && (
                   <div className="absolute right-0 top-0 bottom-0 w-1 brand-gradient"></div>
                 )}
               </>
            )}
          </NavLink>
        ))}

        <div className="pt-6 mt-4">
          <p className="px-6 mb-2 text-xs font-semibold text-white/40 uppercase tracking-wider">Lists</p>
          {[
            { id: 'contact', icon: '👤', label: 'Contacts' },
            { id: 'company', icon: '🏢', label: 'Companies' },
            { id: 'deal', icon: '💼', label: 'Deals' },
            { id: 'meeting', icon: '📅', label: 'Meetings' },
            { id: 'insight', icon: '💡', label: 'Insights' },
          ].map(type => (
            <NavLink
              key={type.id}
              to={`/app/entities?type=${type.id}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-2 text-[14px] font-medium transition-all relative ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-white/55 hover:bg-white/5 hover:text-white/90'
                }`
              }
            >
              {({ isActive }) => (
                 <>
                   <span className="text-base grayscale opacity-80">{type.icon}</span>
                   {type.label}
                   {isActive && (
                     <div className="absolute right-0 top-0 bottom-0 w-1 brand-gradient"></div>
                   )}
                 </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* User area */}
      <div className="p-4 border-t border-[#243447]">
        <div className="flex items-center gap-3 px-2">
           <div className="w-10 h-10 rounded-full brand-gradient flex items-center justify-center text-white font-bold shrink-0">
             U
           </div>
           <div>
             <div className="text-white text-sm font-medium">User</div>
             <div className="text-white/40 text-xs">{isPro ? 'Personal plan' : 'Free plan'}</div>
           </div>
        </div>
      </div>
    </aside>
  );
}
