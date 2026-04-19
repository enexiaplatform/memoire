import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';

export function AppShell() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <TopNav />
      <main className="ml-[220px] pt-16">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
