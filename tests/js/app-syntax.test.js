import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('browser entry point', () => {
  it('is valid JavaScript before it is deployed', () => {
    expect(() => execFileSync(process.execPath, ['--check', path.join(ROOT, 'app.js')], { stdio: 'pipe' })).not.toThrow();
  });
});
