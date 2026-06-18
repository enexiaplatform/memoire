import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { GoogleAuthButton } from '../../components/auth/GoogleAuthButton';
import { BrandWordmark } from '../../components/brand/BrandWordmark';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');
  const { signIn, error, loading, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const destination = getAuthDestination(location.state);
  const statusMessage = searchParams.get('passwordUpdated') === '1'
    ? 'Password updated. You can sign in now.'
    : searchParams.get('verified') === '1'
      ? 'Email verified. You can sign in now.'
      : '';

  if (!loading && isAuthenticated) {
    return <Navigate to={destination} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setLocalError('');
    try {
      const { error } = await signIn(email, password);
      if (!error) {
        navigate(destination, { replace: true });
      }
    } catch {
      setLocalError('Login failed. Please retry.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2" aria-label="Memoire home">
            <BrandWordmark className="text-2xl" />
          </Link>
          <h1 className="text-[24px] font-bold font-display text-navy mt-4 tracking-tight">Welcome back</h1>
          <p className="text-[15px] font-body text-gray-500 mt-1">Sign in to your Memoire account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mx-auto max-w-[440px] space-y-5 rounded-[16px] bg-white p-6 shadow-elevated sm:p-10">
          <GoogleAuthButton label="Continue with Google" redirectTo={destination} />

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

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
          <div className="-mt-2 text-right">
            <Link to="/forgot-password" className="text-sm font-semibold text-brand-blue hover:text-brand-blue-dark">
              Forgot password?
            </Link>
          </div>

          {(error || localError) && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{localError || error}</div>
          )}
          {statusMessage && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{statusMessage}</div>
          )}

          <Button type="submit" loading={submitting} className="w-full">
            Sign in
          </Button>
          <Link
            to="/demo"
            className="block w-full rounded-full border border-amber-200 bg-amber-50 px-4 py-3 text-center font-display text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 active:scale-[0.98]"
          >
            Open Demo Workspace
          </Link>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Don't have an account?{' '}
          <Link to="/signup" className="font-semibold text-brand-blue hover:text-brand-blue-dark">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

function getAuthDestination(state: unknown) {
  const from = (state as {
    from?: {
      pathname?: string;
      search?: string;
      hash?: string;
    };
  } | null)?.from;
  const path = `${from?.pathname || ''}${from?.search || ''}${from?.hash || ''}`;
  return path.startsWith('/app/') ? path : '/app/dashboard';
}
