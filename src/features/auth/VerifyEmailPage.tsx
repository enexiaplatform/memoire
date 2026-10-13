import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { BrandWordmark } from '../../components/brand/BrandWordmark';
import { useAuth } from '../../hooks/useAuth';
import { NoIndex } from '../../components/marketing/PageSeo';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export function VerifyEmailPage() {
  useDocumentTitle('Verify your email');
  const location = useLocation();
  const initialEmail = (location.state as { email?: string } | null)?.email || '';
  const [email, setEmail] = useState(initialEmail);
  const [requestAccepted, setRequestAccepted] = useState(Boolean(initialEmail));
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const { resendSignupConfirmation } = useAuth();

  const resend = async () => {
    if (!email) return;
    setSending(true);
    try {
      const { error } = await resendSignupConfirmation(email.trim());
      setRequestAccepted(!error);
      setMessage(error || 'Verification request accepted. Check your inbox and spam folder; delivery may take a few minutes.');
    } catch { setMessage('Verification could not be requested. Try again shortly.'); }
    finally { setSending(false); }
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
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <Link to="/" aria-label="Memoire home">
            <BrandWordmark className="mb-8 text-2xl" />
          </Link>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-brand-blue">
            <MailCheck className="h-8 w-8" strokeWidth={1.5} />
          </div>

          <h1 className="text-2xl font-semibold text-gray-900 mb-3">{requestAccepted ? 'Check your email' : 'Verify your email'}</h1>
          <p className="text-sm text-gray-600 mb-8 leading-relaxed">
            {requestAccepted ? 'Your verification request was accepted. Open the link in your email to verify your account.' : 'Enter the email used for signup to request a verification link. If you have not signed up yet, create an account first.'}
          </p>

          <form onSubmit={event => { event.preventDefault(); void resend(); }} className="mb-4 text-left">
            <label htmlFor="verification-email" className="text-sm font-semibold">Signup email</label>
            <input id="verification-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required className="mb-3 mt-1 w-full rounded-lg border border-line p-3" />
            <Button type="submit" loading={sending} className="w-full">{requestAccepted ? 'Resend verification email' : 'Request verification email'}</Button>
          </form>
          {!requestAccepted && <Link to="/signup" className="mb-4 block text-sm font-semibold text-brand-blue underline">Create an account</Link>}
          {message && <p role="status" className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">{message}</p>}
          <Link to="/login">
            <Button variant="secondary" className="w-full">
              Back to login
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
