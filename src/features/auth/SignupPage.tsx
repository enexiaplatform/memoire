import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { GoogleAuthButton } from '../../components/auth/GoogleAuthButton';
import { BrandWordmark } from '../../components/brand/BrandWordmark';
import { trackProductEvent } from '../../utils/productAnalytics';
import { PASSWORD_MIN_LENGTH, PASSWORD_POLICY_HELPER } from '../../auth/passwordPolicy';
import { isSampleDataLoaded } from '../../utils/sampleData';

export function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [startedFromDemo] = useState(() => isSampleDataLoaded());
  const { signUp, error, loading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  if (!loading && isAuthenticated) {
    return <Navigate to="/app/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signUp(email, password, displayName);
    setSubmitting(false);
    if (!error) {
      trackProductEvent('signup_completed', 'cloud-browser');
      navigate('/verify-email', { state: { email } });
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
          <h1 className="text-[24px] font-bold font-display text-navy mt-4 tracking-tight">Create your account</h1>
          <p className="text-[15px] font-body text-gray-500 mt-1">Start building your personal sales memory</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mx-auto max-w-[440px] space-y-5 rounded-[16px] bg-white p-6 shadow-elevated sm:p-10">
          <GoogleAuthButton label="Create account with Google" />

          {startedFromDemo && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
              Your sample demo records will not be copied into this account. Your real workspace starts clean after signup.
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <Input
            label="Full name"
            type="text"
            placeholder="Jane Smith"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
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
            placeholder="Create a strong password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={PASSWORD_MIN_LENGTH}
            helperText={PASSWORD_POLICY_HELPER}
          />

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}

          <Button type="submit" loading={submitting} className="w-full">
            Create account
          </Button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-blue hover:text-brand-blue-dark">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
