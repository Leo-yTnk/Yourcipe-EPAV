import { describe, it, expect } from 'vitest';
import {
  getTopmostModal, isTextareaElement, resolveEscapeAction, resolveEnterAction,
  isDoubleSubmit, DOUBLE_SUBMIT_GUARD_MS,
} from '../../modal-keyboard.js';

// modal-keyboard.js is the shared keyboard/accessibility mechanism used by
// every modal in the app (Part 11) — see its header comment for why this is
// a set of pure functions driven by app.js's getModalStack() rather than a
// Preact hook (this app is a single class Component; template.js's
// `render*Modal` functions are plain functions, not separate components, so
// hooks would have nothing to attach to).

function modal(overrides = {}) {
  return {
    key: 'test', open: true, zIndex: 20, onClose: () => {}, onSubmit: () => {},
    busy: false, dirty: false, multiline: false,
    ...overrides,
  };
}

describe('getTopmostModal', () => {
  it('returns null when nothing is open', () => {
    expect(getTopmostModal([modal({ open: false })])).toBeNull();
    expect(getTopmostModal([])).toBeNull();
    expect(getTopmostModal(undefined)).toBeNull();
  });

  it('picks the open modal with the highest zIndex, ignoring closed ones entirely', () => {
    const low = modal({ key: 'low', zIndex: 20 });
    const high = modal({ key: 'high', zIndex: 26 });
    const closedHigher = modal({ key: 'closedHigher', zIndex: 40, open: false });
    expect(getTopmostModal([low, high, closedHigher]).key).toBe('high');
  });

  it('never returns a modal further back in the stack when a higher one is open (ESC closes only the topmost)', () => {
    const background = modal({ key: 'background', zIndex: 20 });
    const foreground = modal({ key: 'foreground', zIndex: 28 });
    const top = getTopmostModal([background, foreground]);
    expect(top.key).toBe('foreground');
    expect(top.key).not.toBe('background');
  });
});

describe('isTextareaElement', () => {
  it('is true only for a <textarea>-tagged element-like object', () => {
    expect(isTextareaElement({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextareaElement({ tagName: 'textarea' })).toBe(true);
    expect(isTextareaElement({ tagName: 'INPUT' })).toBe(false);
    expect(isTextareaElement(null)).toBe(false);
    expect(isTextareaElement(undefined)).toBe(false);
    expect(isTextareaElement({})).toBe(false);
  });
});

describe('resolveEscapeAction', () => {
  it('returns null when there is no topmost modal', () => {
    expect(resolveEscapeAction(null)).toBeNull();
  });

  it('returns null (never closable) when the modal has no onClose (e.g. a mandatory gate)', () => {
    expect(resolveEscapeAction(modal({ onClose: null }))).toBeNull();
  });

  it('returns null while the modal is busy — never closes mid-transaction', () => {
    expect(resolveEscapeAction(modal({ busy: true }))).toBeNull();
  });

  it('returns { needsConfirm: false } for a clean, closable modal', () => {
    expect(resolveEscapeAction(modal({ dirty: false }))).toEqual({ needsConfirm: false });
  });

  it('returns { needsConfirm: true } for a modal with unsaved edits', () => {
    expect(resolveEscapeAction(modal({ dirty: true }))).toEqual({ needsConfirm: true });
  });
});

describe('resolveEnterAction', () => {
  it('returns null when there is no topmost modal, or it has no onSubmit', () => {
    expect(resolveEnterAction(null, { isTextarea: false, isCtrlOrCmd: false })).toBeNull();
    expect(resolveEnterAction(modal({ onSubmit: null }), { isTextarea: false, isCtrlOrCmd: false })).toBeNull();
  });

  it('returns null while busy — guards against double-submit even before the re-entrancy lock', () => {
    expect(resolveEnterAction(modal({ busy: true }), { isTextarea: false, isCtrlOrCmd: false })).toBeNull();
  });

  it('plain Enter does NOT submit when focus is inside a <textarea>', () => {
    expect(resolveEnterAction(modal({ multiline: true }), { isTextarea: true, isCtrlOrCmd: false })).toBeNull();
  });

  it('plain Enter DOES submit when focus is on any other control', () => {
    expect(resolveEnterAction(modal(), { isTextarea: false, isCtrlOrCmd: false })).toEqual({ type: 'submit' });
  });

  it('Ctrl/Cmd+Enter submits a multiline form even while focus is inside its textarea', () => {
    expect(resolveEnterAction(modal({ multiline: true }), { isTextarea: true, isCtrlOrCmd: true })).toEqual({ type: 'submit' });
  });

  it('Ctrl/Cmd+Enter still submits a non-multiline modal (permissive, never forbidden by spec)', () => {
    expect(resolveEnterAction(modal({ multiline: false }), { isTextarea: false, isCtrlOrCmd: true })).toEqual({ type: 'submit' });
  });
});

describe('isDoubleSubmit', () => {
  it('is false the first time a key is submitted', () => {
    expect(isDoubleSubmit({}, 'myModal', 1000)).toBe(false);
  });

  it('is true for a second submit of the same key within the guard window', () => {
    const map = { myModal: 1000 };
    expect(isDoubleSubmit(map, 'myModal', 1000 + DOUBLE_SUBMIT_GUARD_MS - 1)).toBe(true);
  });

  it('is false again once the guard window has fully elapsed', () => {
    const map = { myModal: 1000 };
    expect(isDoubleSubmit(map, 'myModal', 1000 + DOUBLE_SUBMIT_GUARD_MS + 1)).toBe(false);
  });

  it('never mutates the map it was given (pure)', () => {
    const map = { myModal: 1000 };
    const snapshot = { ...map };
    isDoubleSubmit(map, 'myModal', 1500);
    expect(map).toEqual(snapshot);
  });

  it('tracks different modal keys independently', () => {
    const map = { modalA: 1000 };
    expect(isDoubleSubmit(map, 'modalB', 1050)).toBe(false);
  });
});
