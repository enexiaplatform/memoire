const SESSION_RESTORE_MESSAGE = 'Your session is being restored. Please try again in a moment.';
const CLOUD_UNAVAILABLE_MESSAGE = 'Cloud sync is temporarily unavailable. Local mode is still available.';
const SIGN_IN_AGAIN_MESSAGE = 'Please sign in again if the issue continues.';

export function getFriendlyAuthErrorMessage(error: unknown, fallback = SIGN_IN_AGAIN_MESSAGE) {
  const rawMessage = getRawErrorMessage(error);
  const message = rawMessage.toLowerCase();

  if (
    message.includes('lock:sb-') ||
    message.includes('gotrueclient') ||
    message.includes('lock was not released') ||
    message.includes('request stole it') ||
    message.includes('session restore timed out') ||
    message.includes('auth bootstrap failed')
  ) {
    return SESSION_RESTORE_MESSAGE;
  }

  if (
    message.includes('profile lookup timed out') ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('supabase') ||
    message.includes('cloud sync')
  ) {
    return CLOUD_UNAVAILABLE_MESSAGE;
  }

  return rawMessage || fallback;
}

export function logAuthDebug(message: string, context?: unknown) {
  if (import.meta.env.DEV) {
    console.debug(`[MemoireAuth] ${message}`, context || {});
  }
}

export function logAuthWarning(message: string, error?: unknown) {
  if (import.meta.env.DEV) {
    console.warn(`[MemoireAuth] ${message}`, error);
  }
}

function getRawErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    return typeof value === 'string' ? value : '';
  }
  return '';
}
