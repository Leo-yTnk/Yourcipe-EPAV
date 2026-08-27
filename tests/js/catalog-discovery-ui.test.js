import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const template = readFileSync(new URL('../../template.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

describe('catalog discovery controls', () => {
  it('keeps searches scoped to each public page', () => {
    expect(app).toContain('homeSearchQuery');
    expect(app).toContain('recipeSearchQuery');
    expect(app).toContain('productSearchQuery');
    expect(template).toContain('Buscar produtos e receitas...');
    expect(template).toContain('Buscar receitas...');
    expect(template).toContain('Buscar produtos...');
  });

  it('offers an explicit product filter selector', () => {
    expect(template).toContain('aria-expanded=${v.productFiltersOpen}');
    expect(template).toContain('aria-label="Filtros de produtos"');
  });

  it('keeps catalog bulk actions visible over scrolled content', () => {
    expect(styles).toMatch(/\.yc-selection-bar \{ position:fixed/);
    expect(styles).toContain('z-index:60');
  });

  it('renders every configured recipe section on the aggregator home', () => {
    expect(template).toContain('v.homeSectionBlocks.map((sec) => carouselSection');
  });
});
