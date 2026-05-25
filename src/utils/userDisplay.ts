import type { User } from '@supabase/supabase-js';
import type { UserProfile } from '../types';

type ProfileLike = Partial<UserProfile> & {
  full_name?: string | null;
  name?: string | null;
};

export function getUserDisplayName(user?: User | null, profile?: ProfileLike | null) {
  return (
    profile?.full_name ||
    profile?.display_name ||
    profile?.name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.user_metadata?.display_name ||
    user?.email ||
    'User'
  );
}

export function getUserInitials(user?: User | null, profile?: ProfileLike | null) {
  const displayName = getUserDisplayName(user, profile);
  const initials = displayName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join('');

  return initials || 'U';
}
