// Client-side mirror of public.normalize_and_validate_display_name() in
// supabase/002_profiles_display_name_phase1.sql. This is a UX convenience
// only — it lets the signup/edit-name forms reject an obviously invalid
// name before making a network call. It is NOT the source of truth: the
// database trigger re-validates independently and is what actually
// enforces the rule, since a client can always be bypassed.

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 80;

/**
 * Trims, collapses duplicated internal whitespace, and validates length.
 * Returns the normalized name, or null if it is empty/too short/too long
 * after normalization.
 */
export function normalizeDisplayName(raw) {
  const collapsed = String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ');
  if (collapsed.length < DISPLAY_NAME_MIN || collapsed.length > DISPLAY_NAME_MAX) return null;
  return collapsed;
}
