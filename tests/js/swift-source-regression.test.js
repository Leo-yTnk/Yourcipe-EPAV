import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeSwiftSyncError } from '../../swift-sync-ui.js';

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

  it('answers browser preflight requests with the Supabase client headers', () => {
    const handler = readFileSync('supabase/functions/swift-price-sync/index.ts', 'utf8');
    expect(handler).toContain("if (req.method === 'OPTIONS')");
    expect(handler).toContain('authorization, x-client-info, apikey, content-type');
    expect(handler).toContain("'access-control-allow-origin': '*'");
  });

  it('lets publishable-key projects reach the function before its own admin check', () => {
    const config = readFileSync('supabase/config.toml', 'utf8');
    expect(config).toContain('[functions.swift-price-sync]');
    expect(config).toContain('verify_jwt = false');
  });

  it('preserves an opaque Edge Function network failure for diagnosis', async () => {
    const original = new Error('Failed to send a request to the Edge Function');
    const error = await normalizeSwiftSyncError(original);
    expect(error.code).toBe('network_error');
    expect(error.message).toContain('conectar ao serviço');
    expect(error.technical.original).toBe(original);
  });

  it('retries transient Edge Function transport failures', () => {
    const catalog = readFileSync('catalog.js', 'utf8');
    expect(catalog).toMatch(/async function invokeSwiftPriceSync[\s\S]*attempt < 2/);
    expect(catalog).toMatch(/catch \(error\)[\s\S]*await normalizeSwiftSyncError\(lastError\)/);
    expect(catalog).toContain('setTimeout(resolve, 400)');
  });

  it('does not invoke the function for a product without a Swift source', () => {
    const app = readFileSync('app.js', 'utf8');
    expect(app).toMatch(/onRefreshSiteProductPrice[\s\S]*if \(!p\.swift_product_url\)[\s\S]*onEditSiteProduct\(p\)/);
    expect(app).toContain("MISSING_SOURCE: 'Sem página Swift'");
  });

  it('renders catalog products as a card grid with four icon-only actions', () => {
    const template = readFileSync('template.js', 'utf8');
    const styles = readFileSync('styles.css', 'utf8');
    expect(template).toContain('className="yc-admin-product-grid"');
    expect(template).toContain("[['grid', 'Cards'], ['spreadsheet', 'Planilha']]");
    expect(template).toMatch(/yc-admin-card-actions[\s\S]*aria-label=\$\{row\.toggleActiveLabel\}[\s\S]*aria-label=\$\{row\.hasSwiftSource \? 'Atualizar preço'/);
    expect(styles).toMatch(/\.yc-admin-product-grid \{[^}]*repeat\(auto-fit,minmax\(min\(100%,238px\),1fr\)\)/);
    expect(styles).toMatch(/\.yc-admin-product-grid \.yc-admin-product-card \.yc-admin-product-image \{[^}]*width:calc\(100% \+ 32px\)[^}]*margin:-16px -16px 0/);
    expect(styles).toMatch(/\.yc-admin-product-grid \.yc-admin-product-card \{[^}]*border-radius:var\(--radius-lg\)/);
  });
});
