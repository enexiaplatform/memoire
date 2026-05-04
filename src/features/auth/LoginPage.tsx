import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { isDemoMode } from '../../lib/demoMode';
import { loadHenryFounderWorkspace } from '../v31/localStore';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { signIn, error } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (!error) {
      navigate('/app/today');
    }
  };

  const handleLoadHenryWorkspace = async () => {
    setSubmitting(true);
    loadHenryFounderWorkspace();
    const { error } = await signIn('henry@memoire.local', 'local-founder-workspace');
    setSubmitting(false);
    if (!error) {
      navigate('/app/today');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="text-[24px] font-extrabold tracking-tight brand-gradient-text font-display">Memoire</span>
          </Link>
          <h1 className="text-[24px] font-bold font-display text-navy mt-4 tracking-tight">Welcome back</h1>
          <p className="text-[15px] font-body text-gray-500 mt-1">Sign in to your Memoire account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-[16px] shadow-elevated p-10 space-y-5 max-w-[440px] mx-auto">
          <Input
            label="Email address"
            type="email"
            placeholder="jane@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}

          <Button type="submit" loading={submitting} className="w-full">
            Sign in
          </Button>
          {isDemoMode && (
            <button
              type="button"
              onClick={handleLoadHenryWorkspace}
              disabled={submitting}
              className="w-full rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50"
            >
              Load Henry Workspace
            </button>
          )}
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Don't have an account?{' '}
          <Link to="/signup" className="text-memoire-600 font-medium hover:text-memoire-700">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
