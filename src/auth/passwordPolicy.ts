export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_POLICY_HELPER =
  'Use 12+ characters with uppercase, lowercase, a number, and a symbol.';

export function getPasswordPolicyError(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) return PASSWORD_POLICY_HELPER;
  if (!/[a-z]/.test(password)) return PASSWORD_POLICY_HELPER;
  if (!/[A-Z]/.test(password)) return PASSWORD_POLICY_HELPER;
  if (!/[0-9]/.test(password)) return PASSWORD_POLICY_HELPER;
  if (!/[^A-Za-z0-9]/.test(password)) return PASSWORD_POLICY_HELPER;
  return '';
}
