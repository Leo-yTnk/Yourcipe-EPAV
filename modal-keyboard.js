// Shared, pure keyboard/accessibility logic for every modal in the app
// (Part 11 of the spec). This app is a single class Component
// (see app.js's `class App extends Component`), and the various
// `render*Modal(app, v)` functions in template.js are plain functions
// returning `html` — NOT separate Preact components — so Preact hooks
// (useState/useEffect, which vendor/htm-preact-standalone.js DOES export)
// would not actually attach to anything: there is no per-modal component
// instance for a hook to live on. A "useModalKeyboard" hook would silently
// do nothing useful here. Instead, this module exports small, pure,
// independently-testable functions; app.js's single class instance builds
// one ordered "modal stack" from its own state (see `getModalStack` in
// app.js) and calls these functions from one shared global keydown handler
// — one mechanism, reused by every modal, rather than copy-pasted
// key-handling code in each render function.
//
// A "modal descriptor" is a plain object:
//   { key, open, zIndex, onClose, onSubmit, busy, dirty, multiline }
// - key: stable string id (used for the double-submit re-entrancy lock).
// - open: boolean — is this modal currently shown at all.
// - zIndex: number — matches the real z-index in template.js, used only to
//   pick the TOPMOST currently-open modal (never to close/submit anything
//   further down the stack).
// - onClose: function to call to close it, or null if it must not be
//   dismissible via Escape (e.g. the mandatory complete-profile gate).
// - onSubmit: function for its single "primary" action, or null if the
//   modal has no single obvious default action (e.g. a detail view with
//   several buttons) — Enter/Ctrl+Enter never guesses one.
// - busy: true while a save/approve/redeem/etc. network call for THIS modal
//   is in flight — Escape and Enter/Ctrl+Enter both no-op while busy, so a
//   modal can never be closed or double-submitted mid-transaction.
// - dirty: true if it holds unsaved edits — closing it via Escape should be
//   confirmed first.
// - multiline: true if the modal's primary form contains a textarea whose
//   own Enter keypress must insert a newline instead of submitting — so
//   only Ctrl/Cmd+Enter submits it from within that field (plain Enter
//   still submits it from any OTHER, non-textarea control in the same
//   modal).

/** Topmost OPEN modal by zIndex (ties broken by later position in the
 * array winning, matching real DOM/paint order for equal z-indices). */
export function getTopmostModal(modals) {
  let top = null;
  (modals || []).forEach((m) => {
    if (!m || !m.open) return;
    if (!top || m.zIndex >= top.zIndex) top = m;
  });
  return top;
}

/** True when the given DOM-like element is a <textarea> (case-insensitive,
 * tolerant of a null/undefined element — never throws). */
export function isTextareaElement(el) {
  return !!el && typeof el.tagName === 'string' && el.tagName.toUpperCase() === 'TEXTAREA';
}

/** Escape: only ever acts on the topmost open modal, never a modal further
 * back in the stack, and never while that modal is mid-transaction.
 * Returns null (do nothing) or { needsConfirm }. */
export function resolveEscapeAction(topModal) {
  if (!topModal || !topModal.onClose || topModal.busy) return null;
  return { needsConfirm: !!topModal.dirty };
}

/** Enter / Ctrl+Enter / Cmd+Enter on the topmost open modal.
 * - Plain Enter never submits from inside a <textarea> (a newline is the
 *   expected behavior there) — but DOES submit from any other control.
 * - Ctrl/Cmd+Enter submits regardless of which field currently has focus,
 *   which is what makes it usable from inside a multiline textarea too.
 * Returns null (do nothing) or { type: 'submit' }. */
export function resolveEnterAction(topModal, { isTextarea, isCtrlOrCmd }) {
  if (!topModal || !topModal.onSubmit || topModal.busy) return null;
  if (isCtrlOrCmd) return { type: 'submit' };
  if (isTextarea) return null;
  return { type: 'submit' };
}

// Minimum time between two accepted submits of the SAME modal key, so a
// rapid double Enter/Ctrl+Enter (or an Enter arriving just after a mouse
// click already triggered the same submit) can never fire the handler
// twice before the modal's own `busy` state has had a chance to flip true —
// independent of whether that particular form happens to expose its own
// busy/saving flag, since not all of them currently do.
export const DOUBLE_SUBMIT_GUARD_MS = 600;

/** Pure re-entrancy check: `lastSubmitAt` is a plain `{ [key]: timestamp }`
 * map (the caller owns and mutates it — this function never mutates it
 * itself, so it stays trivially testable). Returns true if `key` was
 * already submitted within the guard window as of `now`. */
export function isDoubleSubmit(lastSubmitAt, key, now, windowMs = DOUBLE_SUBMIT_GUARD_MS) {
  const last = lastSubmitAt && lastSubmitAt[key];
  return typeof last === 'number' && (now - last) < windowMs;
}
