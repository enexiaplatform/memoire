import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandWordmark } from '../../components/brand/BrandWordmark';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../hooks/useAuth';
import {
  getPasswordPolicyError,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_HELPER,
} from '../../auth/passwordPolicy';

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');
  const { updatePassword, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError('');
    const passwordError = getPasswordPolicyError(password);
    if (passwordError) {
      setLocalError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('The passwords do not match.');
      return;
    }
    setSubmitting(true);
    const { error } = await updatePassword(password);
    setSubmitting(false);
    if (error) {
      setLocalError(error);
      return;
    }
    navigate('/login?passwordUpdated=1', { replace: true });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link to="/" aria-label="Memoire home">
            <BrandWordmark className="text-2xl" />
          </Link>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-navy">Choose a new password</h1>
          <p className="mt-1 text-sm text-gray-500">Use a password you have not used for this account.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-[16px] bg-white p-6 shadow-elevated sm:p-10">
          {!loading && !isAuthenticated ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              This reset link is invalid or expired. Request a new link to continue.
              <Link to="/forgot-password" className="mt-3 block font-bold text-brand-blue">Request another link</Link>
            </div>
          ) : (
            <>
              <Input
                label="New password"
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                helperText={PASSWORD_POLICY_HELPER}
              />
              <Input
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
              {localError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{localError}</p>}
              <Button type="submit" loading={submitting || loading} className="w-full">Update password</Button>
            </>
          )}
        </form>
      </div>
    </main>
  );
}
