import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const failures = [];

function read(file) {
  return readFileSync(resolve(root, file), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function requireIncludes(text, marker, label) {
  if (!text.includes(marker)) fail(label);
}

const app = read('src/App.tsx');
for (const route of [
  'path="/login"',
  'path="/signup"',
  'path="/verify-email"',
  'path="/forgot-password"',
  'path="/reset-password"',
  'path="dashboard"',
  'path="today"',
]) {
  requireIncludes(app, route, `app route missing ${route}`);
}

const authProvider = read('src/auth/AuthProvider.tsx');
for (const marker of [
  "emailRedirectTo: `${window.location.origin}/login?verified=1`",
  "redirectTo: `${window.location.origin}/reset-password`",
  "redirectTo: `${window.location.origin}${authDestination}`",
  'const DEFAULT_AUTH_ROUTE = \'/app/today\'',
  "requestedDestination?.startsWith('/app/')",
  "currentPath.startsWith('/app/')",
  'setPendingAuthRedirect(authDestination)',
  'completePendingCloudWorkspace(nextSession?.user ?? null)',
  'clearDemoWorkspaceForAccount()',
  'supabaseClient.auth.resend',
  "type: 'signup'",
]) {
  requireIncludes(authProvider, marker, `auth provider missing marker: ${marker}`);
}

const loginPage = read('src/features/auth/LoginPage.tsx');
for (const marker of [
  "searchParams.get('passwordUpdated') === '1'",
  "searchParams.get('verified') === '1'",
  'Password updated. You can sign in now.',
  'Email verified. You can sign in now.',
  '<GoogleAuthButton label="Continue with Google" redirectTo={destination} />',
  'to="/forgot-password"',
  "path.startsWith('/app/') ? path : '/app/today'",
]) {
  requireIncludes(loginPage, marker, `login page missing marker: ${marker}`);
}

const signupPage = read('src/features/auth/SignupPage.tsx');
for (const marker of [
  "navigate('/verify-email', { state: { email } })",
  "trackProductEvent('signup_completed'",
  '<GoogleAuthButton label="Create account with Google" />',
  'Your sample demo records will not be copied into this account',
  'PASSWORD_POLICY_HELPER',
]) {
  requireIncludes(signupPage, marker, `signup page missing marker: ${marker}`);
}

const forgotPage = read('src/features/auth/ForgotPasswordPage.tsx');
for (const marker of [
  'requestPasswordReset(email.trim())',
  'If an account matches that email, a password reset link is on its way.',
  'autoComplete="email"',
  'to="/login"',
]) {
  requireIncludes(forgotPage, marker, `forgot-password page missing marker: ${marker}`);
}

const resetPage = read('src/features/auth/ResetPasswordPage.tsx');
for (const marker of [
  'getPasswordPolicyError(password)',
  'The passwords do not match.',
  'updatePassword(password)',
  "navigate('/login?passwordUpdated=1', { replace: true })",
  'This reset link is invalid or expired.',
  'to="/forgot-password"',
  'autoComplete="new-password"',
]) {
  requireIncludes(resetPage, marker, `reset-password page missing marker: ${marker}`);
}

const verifyPage = read('src/features/auth/VerifyEmailPage.tsx');
for (const marker of [
  'resendSignupConfirmation(email)',
  'Verification email sent again. Please check your inbox.',
  'Back to login',
  'to="/login"',
]) {
  requireIncludes(verifyPage, marker, `verify-email page missing marker: ${marker}`);
}

const googleButton = read('src/components/auth/GoogleAuthButton.tsx');
for (const marker of [
  'signInWithGoogle(redirectTo)',
  'Continue with Google',
]) {
  requireIncludes(googleButton, marker, `Google auth button missing marker: ${marker}`);
}

const health = read('scripts/lib/production-readiness-runtime.mjs');
for (const marker of [
  "const AUTH_REDIRECT_PATHS = ['/login?verified=1', '/reset-password', '/app/today']",
  'requiredUrls',
  'Set Supabase Auth Site URL to VITE_APP_URL.',
  'Allow email verification redirect to /login?verified=1.',
  'Allow password recovery redirect to /reset-password.',
  'Allow OAuth app return path to /app/today or the protected /app/* route under test.',
]) {
  requireIncludes(health, marker, `readiness auth redirect contract missing marker: ${marker}`);
}

const qaDoc = read('docs/qa/auth-recovery-production-qa-2026-06-17.md');
for (const marker of [
  'A6-01',
  'A6-02',
  'A6-03',
  'A6-04',
  'A6-05',
  'A6-06',
  'A6-07',
  'Supabase Auth Site URL',
  'Redirect URL allowlist',
]) {
  requireIncludes(qaDoc, marker, `auth recovery QA doc missing marker: ${marker}`);
}

const coverageDoc = read('docs/qa/auth-recovery-contract-coverage-2026-06-17.md');
for (const marker of ['A6 remains open', 'scripts/verify-auth-recovery-contract.mjs', 'Runtime Evidence Still Required']) {
  requireIncludes(coverageDoc, marker, `auth recovery coverage doc missing marker: ${marker}`);
}

const releaseGate = read('docs/product/commercial-release-gate-2026-06-16.md');
requireIncludes(releaseGate, 'scripts/verify-auth-recovery-contract.mjs', 'release gate does not reference auth recovery verifier');

const packet = read('docs/product/cohort-release-evidence-packet-2026-06-17.md');
requireIncludes(packet, 'scripts/verify-auth-recovery-contract.mjs', 'cohort packet does not reference auth recovery verifier');

if (failures.length > 0) {
  console.error('Auth recovery contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Auth recovery contract verification passed.');
