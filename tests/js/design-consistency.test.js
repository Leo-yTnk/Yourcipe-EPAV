import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
const template = readFileSync(new URL('../../template.js', import.meta.url), 'utf8');

describe('visual design consistency', () => {
  it('keeps creation actions aligned to the compact tab height', () => {
    expect(styles).toContain('--yc-creation-control-height: 38px');
    expect(styles).toMatch(/\.yc-begin-selection[^}]+height:var\(--yc-creation-control-height\)/);
    expect(styles).toMatch(/\.yc-danger-zone button[^}]+height:var\(--yc-creation-control-height\)/);
  });

  it('keeps the icon-only search action circular', () => {
    expect(styles).toMatch(/\.yc-search-button\s*{[^}]+width: 44px[^}]+height: 44px[^}]+border-radius: var\(--radius-full\)/s);
  });

  it('does not animate frame width when full-screen content reveals navigation', () => {
    const frameLine = template.split('\n').find((line) => line.includes('className=${`${v.appThemeClass} yc-app-frame`}'));
    expect(frameLine).toBeTruthy();
    expect(frameLine).not.toContain('transition:width');
    expect(frameLine).not.toContain('max-width 0.2s');
    expect(frameLine).toContain('max-height 0.2s');
  });
});
