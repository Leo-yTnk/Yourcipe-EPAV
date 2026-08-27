import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin Swift sync trigger wiring', () => {
  const app = readFileSync('app.js', 'utf8');
  const template = readFileSync('template.js', 'utf8');

  it('starts batch synchronization only from the explicit click handler', () => {
    expect(template).toContain('onClick=${v.onRefreshAllPrices}');
    expect((app.match(/refreshAllProductPrices\(\)/g) || [])).toHaveLength(1);
    expect(app).toMatch(/onRefreshAllPrices = async \(\) =>/);
  });

  it('does not start synchronization during page load or component lifecycle', () => {
    expect(app).not.toMatch(/(?:componentDidMount|constructor|init)[\s\S]{0,300}refreshAllProductPrices\(/);
  });

  it('guards double clicks and disables the button while in flight', () => {
    expect(app).toContain('if (this.state.swiftSyncAllBusy) return;');
    expect(template).toContain('disabled=${v.swiftSyncAllBusy}');
    expect(template).toContain('aria-busy=${v.swiftSyncAllBusy}');
  });
});
