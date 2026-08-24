import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Swift source regression', () => {
  it('casts every CASE branch to the product price status enum', () => {
    const sql = readFileSync('supabase/027_fix_swift_source_price_status.sql', 'utf8');
    expect(sql).toContain("'MISSING_SOURCE'::public.product_price_status");
    expect(sql).toContain("'STALE'::public.product_price_status");
  });

  it('shows the real Swift detail URL pattern in a scrollable product form', () => {
    const template = readFileSync('template.js', 'utf8');
    expect(template).toContain('placeholder="https://www.swift.com.br/detail/nome-do-produto"');
    expect(template).toMatch(/renderSiteProductFormModal[\s\S]*className="yc-scroll"[\s\S]*max-height:calc\(100dvh - 40px\);overflow-y:auto/);
  });
});
