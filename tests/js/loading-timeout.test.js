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

describe('_guardedLoad delegates to the generation-safe coordinator', () => {
  it('uses execution ids and never clears a newer run directly', () => {
    const body = appJs.slice(appJs.indexOf('_guardedLoad(key, fn'), appJs.indexOf('_guardedLoad(key, fn') + 1000);
    expect(body).toContain('this._loadGuard.run');
    expect(body).toContain('executionId');
    expect(body).not.toMatch(/this\._inFlight\[key\] = null/);
  });

  it('all independent list loaders retain distinct keys and timeout states', () => {
    const expected = {
      loadMyCreationData: 'myCreationData', loadSharedLibrary: 'sharedLibrary', loadPublicCatalog: 'publicCatalog',
      loadSiteCatalogData: 'siteCatalogData', loadMyRequests: 'myRequests', loadAllRequests: 'allRequests',
    };
    Object.entries(expected).forEach(([name, key]) => {
      const start = appJs.indexOf(`${name} = (`);
      const definition = appJs.slice(start, start + 500);
      expect(definition).toContain(`_guardedLoad('${key}'`);
      expect(definition).toContain('Tempo de carregamento esgotado');
    });
  });

  it('every list implementation gates state writes by its current generation', () => {
    for (const [fn, key] of [['MyCreationData','myCreationData'], ['SharedLibrary','sharedLibrary'], ['PublicCatalog','publicCatalog'], ['SiteCatalogData','siteCatalogData'], ['MyRequests','myRequests'], ['AllRequests','allRequests']]) {
      const start = appJs.indexOf(`_load${fn} = async`);
      const end = appJs.indexOf('\n  };', start);
      expect(appJs.slice(start, end)).toContain(`_loadGuard.isCurrent('${key}', runId)`);
    }
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

describe('authentication and modals remain independent from list refreshes', () => {
  it('registers auth only once and keeps profile I/O outside the auth callback', () => {
    expect(appJs).toMatch(/if \(this\._authInitStarted\) return;/);
    const authBlock = appJs.slice(appJs.indexOf('initAuth = async'), appJs.indexOf('updateDeviceMode', appJs.indexOf('initAuth = async')));
    const callback = authBlock.slice(authBlock.indexOf('onAuthStateChange'), authBlock.indexOf('const initialGeneration'));
    expect(callback).not.toMatch(/onAuthStateChange\(async/);
    expect(callback).toContain('Promise.resolve().then(async () =>');
    expect(callback).toContain('generation !== this._authIdentityGeneration');
  });

  it('list loaders never reset modal-open state', () => {
    const loaders = ['MyCreationData', 'SharedLibrary', 'PublicCatalog', 'SiteCatalogData', 'MyRequests', 'AllRequests'];
    for (const loader of loaders) {
      const start = appJs.indexOf(`_load${loader} = async`);
      const body = appJs.slice(start, appJs.indexOf('\n  };', start));
      for (const modalFlag of ['showLoginModal', 'showSignupModal', 'showMyRecipeForm', 'showSiteRecipeForm', 'selectedRequestId']) {
        expect(body).not.toContain(`${modalFlag}: false`);
      }
    }
  });
});
