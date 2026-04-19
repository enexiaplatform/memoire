import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui/Button';

export function TopNav() {
  const { user, signOut } = useAuth();

  return (
    <header className="fixed top-0 left-[220px] right-0 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-30">
      <div>
        {/* Breadcrumb or page title can go here */}
      </div>

      <div className="flex items-center gap-4">
        {user && (
          <>
            <span className="text-sm text-gray-600">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
