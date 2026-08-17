import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/022_catalog_input_constraints.sql', 'utf8');

describe('trusted catalog input constraints', () => {
  it('enforces bounded nonblank names on every catalog entity', () => {
    for (const table of ['categories', 'products', 'recipes']) {
      expect(sql).toContain(`alter table public.${table}`);
      expect(sql).toMatch(new RegExp(`${table}_name_length_ck[\\s\\S]*char_length\\(btrim\\(name\\)\\) between 1 and 120`));
    }
  });

  it('enforces HTTP(S), whitespace-free, bounded image URLs in the database', () => {
    expect(sql.match(/image_url_http_ck/g)).toHaveLength(2);
    expect(sql.match(/char_length\(image_url\) <= 2048/g)).toHaveLength(2);
    expect(sql.match(/\^https\?:\/\//g)).toHaveLength(2);
  });

  it('uses rollout-safe NOT VALID constraints', () => {
    expect(sql.match(/not valid/g)).toHaveLength(5);
  });
});
