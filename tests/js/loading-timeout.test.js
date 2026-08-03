import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression guard for the "Modo de Criação can get stuck on Carregando...
// forever" bug. Root cause (see the investigation this round): _guardedLoad's
// in-flight dedup guard only cleared `_inFlight[key]` inside a `finally`
// that only ran once the wrapped promise actually settled — a hung request
// (device sleep/wake, backgrounded tab, a stalled connection) never
// settled, so `_inFlight[key]` stayed set forever and every later attempt
// (reopening the tab, the focus/visibilitychange refetch, even "Tentar
// novamente") silently returned the same dead promise. Fixed with a timer
// that fires an onTimeout callback and frees `_inFlight[key]` independently
// of whether the real request ever resolves. Static-analysis checks (same
// approach as cache-busting.test.js) since there's no harness here to
// mount <App> and simulate a hung network call.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const appJs = readFileSync(path.join(ROOT, 'app.js'), 'utf8');

describe('_guardedLoad unsticks a hung request instead of blocking retries forever', () => {
  it('races a timer that clears _inFlight[key] independently of whether fn() ever settles', () => {
    const guardedLoadBody = appJs.slice(appJs.indexOf('_guardedLoad(key, fn'), appJs.indexOf('_guardedLoad(key, fn') + 900);
    expect(guardedLoadBody).toMatch(/setTimeout\(/);
    expect(guardedLoadBody).toMatch(/this\._inFlight\[key\] = null/);
    expect(guardedLoadBody).toMatch(/if \(onTimeout\) onTimeout\(\)/);
  });

  it('every one of the five state-flag "Modo de Criação" loaders passes an onTimeout callback that resets its own loading flag and sets a retryable error', () => {
    const loaderNames = ['loadMyCreationData', 'loadSharedLibrary', 'loadSiteCatalogData', 'loadMyRequests', 'loadAllRequests'];
    const flagsByLoader = {
      loadMyCreationData: 'myCreationLoading', loadSharedLibrary: 'sharedLibraryLoading', loadSiteCatalogData: 'siteCatalogLoading',
      loadMyRequests: 'myRequestsLoading', loadAllRequests: 'allRequestsLoading',
    };
    loaderNames.forEach((name) => {
      const start = appJs.indexOf(`${name} = (`);
      expect(start, `expected to find ${name}'s definition`).toBeGreaterThan(-1);
      const line = appJs.slice(start, appJs.indexOf('\n', start));
      expect(line, `${name} should call _guardedLoad with an onTimeout callback`).toMatch(/_guardedLoad\(/);
      expect(line, `${name}'s onTimeout should reset ${flagsByLoader[name]}`).toContain(`${flagsByLoader[name]}: false`);
      expect(line, `${name}'s onTimeout should set a retryable "timed out" error message`).toContain('Tempo de carregamento esgotado');
    });
    // loadPublicCatalog's timeout uses the demo-fallback shape instead of a
    // dedicated loading flag (matching every other failure branch of that
    // loader), but must still reset publicCategories, same as any other
    // failure path — checked in home-categories.test.js's fallback-block
    // test, which this timeout branch also satisfies.
    expect(appJs).toMatch(/loadPublicCatalog = \(\) => this\._guardedLoad\('publicCatalog', \(\) => this\._loadPublicCatalog\(\), \(\) => this\.setState\(\{\s*publicCatalogSource: 'demo-fallback',\s*publicCatalogError: 'Tempo de carregamento esgotado\. Tente novamente\.',/);
  });
});

describe('onEditMyRecipe / onEditSiteRecipe never leave myRecipeDetailLoading stuck on an unexpected throw', () => {
  it('onEditMyRecipe wraps its fetch in try/catch/finally', () => {
    const body = appJs.slice(appJs.indexOf('onEditMyRecipe = async'), appJs.indexOf('onEditMyRecipe = async') + 500);
    expect(body).toMatch(/try\s*\{/);
    expect(body).toMatch(/\}\s*catch\s*\(e\)\s*\{/);
    expect(body).toMatch(/\}\s*finally\s*\{\s*this\.setState\(\{\s*myRecipeDetailLoading:\s*false\s*\}\);/);
  });

  it('onEditSiteRecipe wraps its fetch in try/catch/finally', () => {
    const body = appJs.slice(appJs.indexOf('onEditSiteRecipe = async'), appJs.indexOf('onEditSiteRecipe = async') + 500);
    expect(body).toMatch(/try\s*\{/);
    expect(body).toMatch(/\}\s*catch\s*\(e\)\s*\{/);
    expect(body).toMatch(/\}\s*finally\s*\{\s*this\.setState\(\{\s*myRecipeDetailLoading:\s*false\s*\}\);/);
  });
});

describe('closing the recipe detail modal always clears myRecipeDetailLoading as a backstop', () => {
  it('onCloseMyRecipeDetail resets myRecipeDetailLoading: false', () => {
    const body = appJs.slice(appJs.indexOf('onCloseMyRecipeDetail = ()'), appJs.indexOf('onCloseMyRecipeDetail = ()') + 400);
    expect(body).toMatch(/myRecipeDetailLoading:\s*false/);
  });
});
