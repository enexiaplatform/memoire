import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';

export function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        {/* Icon */}
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-memoire-50 flex items-center justify-center">
          <svg className="w-8 h-8 text-memoire-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900 mb-3">Check your email</h1>
        <p className="text-sm text-gray-600 mb-8 leading-relaxed">
          We've sent you a verification link. Please check your email and click the link to verify your account.
        </p>

        <Link to="/login">
          <Button variant="secondary" className="w-full">
            Back to login
          </Button>
        </Link>
      </div>
    </div>
  );
}
