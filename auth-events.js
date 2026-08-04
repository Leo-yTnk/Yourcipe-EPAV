// Supabase can emit INITIAL_SESSION/SIGNED_IN/TOKEN_REFRESHED for the same
// restored session within seconds. Only identity changes require profile/state
// reapplication; token refresh is deliberately UI-neutral.
export function shouldApplyAuthEvent(event, session, currentUserId) {
  const nextUserId = session?.user?.id || null;
  if (event === 'TOKEN_REFRESHED' && nextUserId === currentUserId) return false;
  if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && nextUserId === currentUserId) return false;
  return nextUserId !== currentUserId || event === 'USER_UPDATED';
}
