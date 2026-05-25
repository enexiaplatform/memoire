import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadInteractiveDemoWorkspace } from '../v31/localStore';

export function DemoEntryPage() {
  const navigate = useNavigate();

  useEffect(() => {
    loadInteractiveDemoWorkspace();
    window.location.replace('/app/dashboard');
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-blue">Interactive Demo</p>
        <h1 className="mt-2 text-2xl font-bold text-navy">Opening Demo Workspace...</h1>
        <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">
          Loading sample Sales Memory so you can try Memoire without signup.
        </p>
      </div>
    </div>
  );
}
