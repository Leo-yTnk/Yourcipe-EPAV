import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('sales dashboard session restoration', () => {
  it('loads persisted sales only after the restored session reaches state', () => {
    const source = fs.readFileSync('app.js', 'utf8');
    const applySessionProfile = source.slice(
      source.indexOf('applySessionProfile ='),
      source.indexOf('_authInitStarted ='),
    );

    expect(applySessionProfile).toContain('this.setState(');
    expect(applySessionProfile).toMatch(/\(\) => \{ if \(session\) this\.loadSalesData\(\); \}/);
    expect(applySessionProfile).not.toMatch(/this\.setState\(\{ session[^;]+;\s*if \(session\) this\.loadSalesData\(\)/);
  });
});
