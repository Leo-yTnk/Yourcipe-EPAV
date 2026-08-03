// First-visit-only welcome splash (see app.js state init/onSplashContinue,
// template.js renderSplash). A pure UI preference, stored in localStorage
// only, never account-linked and never sent to Supabase — LS_KEYS.welcomeSeen
// in data.js. Extracted as pure functions (taking a storage object instead
// of reading the global `localStorage` directly) so the "shows once, never
// again, fails safe without localStorage" contract can be unit-tested
// without a DOM/browser environment.

// Returns true if the welcome splash should be shown: it hasn't been marked
// seen yet. If `storage` is unavailable/throws (private browsing, disabled
// storage, etc.), fails safe by returning true (same as a first-ever visit)
// rather than throwing and breaking app startup.
export function shouldShowWelcome(storage, key) {
  try {
    return storage.getItem(key) !== 'true';
  } catch (e) {
    return true;
  }
}

// Marks the splash as seen so it never reappears on this browser again.
// Swallows any storage error (same fail-safe reasoning as above) — failing
// to persist the flag just means the splash may show again next visit,
// never that the app breaks.
export function markWelcomeSeen(storage, key) {
  try {
    storage.setItem(key, 'true');
  } catch (e) {}
}
