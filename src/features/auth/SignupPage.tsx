import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

export function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { signUp, error } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signUp(email, password, displayName);
    setSubmitting(false);
    if (!error) {
      navigate('/verify-email');
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
          <h1 className="text-[24px] font-bold font-display text-navy mt-4 tracking-tight">Create your account</h1>
          <p className="text-[15px] font-body text-gray-500 mt-1">Start building your professional memory</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-[16px] shadow-elevated p-10 space-y-5 max-w-[440px] mx-auto">
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
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            helperText="Minimum 8 characters"
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
          <Link to="/login" className="text-memoire-600 font-medium hover:text-memoire-700">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
