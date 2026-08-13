import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { BrandWordmark } from '../../components/brand/BrandWordmark';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../hooks/useAuth';
import { NoIndex } from '../../components/marketing/PageSeo';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export function ForgotPasswordPage() {
  useDocumentTitle('Reset your password');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [localError, setLocalError] = useState('');
  const { requestPasswordReset } = useAuth();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setLocalError('');
    const { error } = await requestPasswordReset(email.trim());
    setSubmitting(false);
    if (error) {
      setLocalError(error);
      return;
    }
    setMessage('If an account matches that email, a password reset link is on its way.');
  };

  return (
    <>
      {/* The auth screens were the one group of public routes carrying
          neither a title nor a robots tag. `vercel.json` sends the noindex
          header for these paths and that is the part that binds; this is the
          second lock `NoIndex` documents itself as being for. The title is
          not covered by anything else - every auth screen showed the landing
          page's headline in the tab strip and to a screen reader. */}
      <NoIndex />
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <Link to="/" aria-label="Memoire home">
              <BrandWordmark className="text-2xl" />
            </Link>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-navy">Reset your password</h1>
            <p className="mt-1 text-sm text-gray-500">We will email you a secure reset link.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 rounded-[16px] bg-white p-6 shadow-elevated sm:p-10">
            {message ? (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
                <MailCheck className="mb-2 h-5 w-5" />
                {message}
              </div>
            ) : (
              <>
                <Input
                  label="Email address"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                {localError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{localError}</p>}
                <Button type="submit" loading={submitting} className="w-full">Send reset link</Button>
              </>
            )}
            <Link to="/login" className="block text-center text-sm font-semibold text-brand-blue">
              Back to login
            </Link>
          </form>
        </div>
      </main>
    </>
  );
}
