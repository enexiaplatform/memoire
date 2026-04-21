import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { OnboardingModal } from './OnboardingModal';

export function AppShell() {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      <TopNav />
      <main className="flex-1 ml-[220px] pt-16 flex flex-col min-h-screen relative">
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
      <OnboardingModal />
    </div>
  );
}
