import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { BrandWordmark } from '../../components/brand/BrandWordmark';
import { useAuth } from '../../hooks/useAuth';

export function VerifyEmailPage() {
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email || '';
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const { resendSignupConfirmation } = useAuth();

  const resend = async () => {
    if (!email) return;
    setSending(true);
    const { error } = await resendSignupConfirmation(email);
    setSending(false);
    setMessage(error || 'Verification email sent again. Please check your inbox.');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <Link to="/" aria-label="Memoire home">
          <BrandWordmark className="mb-8 text-2xl" />
        </Link>
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-brand-blue">
          <MailCheck className="h-8 w-8" strokeWidth={1.5} />
        </div>

        <h1 className="text-2xl font-semibold text-gray-900 mb-3">Check your email</h1>
        <p className="text-sm text-gray-600 mb-8 leading-relaxed">
          We've sent you a verification link. Please check your email and click the link to verify your account.
        </p>

        {email && (
          <Button type="button" loading={sending} onClick={resend} className="mb-3 w-full">
            Resend verification email
          </Button>
        )}
        {message && <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">{message}</p>}
        <Link to="/login">
          <Button variant="secondary" className="w-full">
            Back to login
          </Button>
        </Link>
      </div>
    </div>
  );
}
