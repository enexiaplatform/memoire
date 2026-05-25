import { useAuthContext } from '../auth/authContext';

export function useAuth() {
  return useAuthContext();
}
