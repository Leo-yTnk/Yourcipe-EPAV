import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

describe('surface hierarchy', () => {
  it('defines independent canvas, content and raised surfaces for both themes', () => {
    const css = read('ds-enforce.css');
    expect(css).toMatch(/--surface-canvas:\s*#F1EEEC/);
    expect(css).toMatch(/--surface-primary:\s*#F8F7F6/);
    expect(css).toMatch(/--surface-raised:\s*#FFFFFF/);
    expect(css).toMatch(/\.yc-dark[\s\S]*--surface-canvas:\s*#171311/);
    expect(css).toMatch(/\.yc-dark[\s\S]*--surface-raised:\s*#2A2421/);
  });

  it('uses the raised semantic surface on application cards', () => {
    expect(read('app.js')).toContain('background:var(--surface-raised)');
    expect(read('styles.css')).toMatch(/\.yc-recipe-card[^}]*background:var\(--surface-raised\)/);
  });
});
