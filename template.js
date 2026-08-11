import { html } from './vendor/htm-preact-standalone.js?v=20260810-1';
import { CustomSelect } from './custom-select.js?v=20260810-1';

// Shared "label above control" wrapper for every form redesigned per the
// Modo de Criação form-consistency requirement: a visible label above the
// control (never only a placeholder), an optional required marker, and
// span:full so long controls (name, textarea, URL) can take the whole grid
// row while short ones (category, unit, prep time...) stay side by side —
// see .yc-form-grid in styles.css for the actual column collapse on mobile.
// gridColumn is only meaningful when the caller wraps this in a
// className="yc-form-grid" container; standalone (non-grid) forms simply
// ignore it since a plain flex/block parent has no grid-column concept.
// Shared input/textarea styling for every redesigned form — width:100%
// with box-sizing:border-box and min-width:0 (never a fixed px width) so a
// grid cell can shrink to a single column on mobile without overflowing.
const FORM_INPUT_STYLE = "background:var(--neutral-0);color:var(--neutral-900);width:100%;min-width:0;box-sizing:border-box;padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:14px";
const FORM_TEXTAREA_STYLE = FORM_INPUT_STYLE + ";resize:vertical";

function field(label, control, { required = false, span = 1 } = {}) {
  return html`
    <div style=${`display:flex;flex-direction:column;gap:6px;min-width:0;${span === 2 ? 'grid-column:span 2' : ''}`}>
      <label style="font-size:12px;font-weight:700;color:var(--neutral-600)">${label}${required ? html` <span style="color:var(--red-500)">*</span>` : ''}</label>
      ${control}
    </div>
  `;
}

export function renderApp(app) {
  const v = app.computeViewModel();
  return html`
    <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:var(--neutral-800)">
      <div ref=${(el) => { app.frameRef.current = el; }} className=${v.appThemeClass} style=${`width:100%;max-width:${v.frameMaxWidth};height:100%;max-height:${v.frameMaxHeight};min-height:480px;margin:0 auto;background:var(--neutral-0);position:relative;overflow:hidden;font-family:var(--font-sans);color:var(--neutral-900);box-shadow:var(--shadow-lg);transition:background 0.2s ease,color 0.2s ease,max-width 0.2s ease,max-height 0.2s ease`}>

        <div ref=${(el) => { app.scrollRef.current = el; }} className="yc-scroll" style=${`position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;padding-bottom:${v.scrollBottomPad}px`}>
          <div ref=${(el) => { app.stageRef.current = el; }} style=${`padding-left:${v.stagePadLeft}px;padding-right:${v.stagePadRight}px;transition:padding 0.2s ease`}>

            ${v.notLoaded && html`<div style="display:flex;align-items:center;justify-content:center;height:70vh;color:var(--neutral-600);font-size:15px">Carregando receitas...</div>`}
            ${v.isInicio && renderInicio(app, v)}
            ${v.isHome && renderHome(app, v)}
            ${v.isProducts && renderProducts(app, v)}
            ${v.isSearch && renderSearch(app, v)}
            ${v.isFavorites && renderFavorites(app, v)}
            ${v.isDados && renderDados(app, v)}
            ${v.isSalesHistory && renderSalesHistory(app, v)}
            ${v.isProfile && renderProfile(app, v)}
            ${v.isDetail && renderDetail(app, v)}
            ${v.isAdmin && renderAdmin(app, v)}
          </div>
        </div>

        ${v.isDetail && renderDetailButtons(app, v)}
        ${v.showProductDetailModal && renderProductDetailModal(app, v)}
        ${v.showProductSectionPicker && renderProductSectionPickerModal(app, v)}
        ${v.showBottomTabBar && renderBottomTabBar(app, v)}
        ${v.showSideNavRail && renderSideNavRail(app, v)}
        ${v.showProfileSetup && renderProfileSetupModal(app, v)}
        ${v.salesModalOpen && renderSalesModal(app, v)}
        ${v.altModalOpen && renderAltModal(app, v)}
        ${v.confirmDeleteOpen && renderConfirmDeleteModal(app, v)}
        ${v.referencesModalOpen && renderReferencesModal(app, v)}
        ${v.deleteImpactKind === 'product' && v.productReferencesModal && renderProductReferencesModal(app, v)}
        ${v.deleteImpactKind === 'category' && v.categoryReferencesModal && renderCategoryReferencesModal(app, v)}
        ${v.showRecipeForm && renderRecipeFormModal(app, v)}
        ${v.showProductForm && renderProductFormModal(app, v)}
        ${v.showImportModal && renderImportModal(app, v)}
        ${v.showMyRecipeForm && renderMyRecipeFormModal(app, v)}
        ${v.showMyProductForm && renderMyProductFormModal(app, v)}
        ${v.showMyCategoryForm && renderMyCategoryFormModal(app, v)}
        ${v.showMyRecipeDetail && renderMyRecipeDetailModal(app, v)}
        ${v.copyModalOpen && renderCopyResolveModal(app, v)}
        ${v.showSiteRecipeForm && renderSiteRecipeFormModal(app, v)}
        ${v.showSiteProductForm && renderSiteProductFormModal(app, v)}
        ${v.showSiteCategoryForm && renderSiteCategoryFormModal(app, v)}
        ${v.publishRequestOpen && renderPublishRequestModal(app, v)}
        ${v.requestDetailOpen && renderRequestDetailModal(app, v)}
        ${v.showReturnRequestModal && renderReturnRequestModal(app, v)}
        ${v.showRejectRequestModal && renderRejectRequestModal(app, v)}
        ${v.showLoginModal && renderLoginModal(app, v)}
        ${v.showSignupModal && renderSignupModal(app, v)}
        ${v.showCompleteProfileModal && renderCompleteProfileModal(app, v)}
        ${v.showChangeNameModal && renderChangeNameModal(app, v)}
        ${v.showSplash && renderSplash(app, v)}
      </div>
    </div>
  `;
}

function recipeCard(item) {
  return html`
    <div key=${item.id} onClick=${item.onOpen} style=${item.carouselStyle}>
      <div style="position:relative;border-radius:var(--radius-lg);overflow:hidden;height:160px;box-shadow:var(--shadow-sm)">
        <img loading="lazy" decoding="async" src=${item.imagem} alt=${item.nome} style="width:100%;height:100%;object-fit:cover"/>
        <div style="position:absolute;top:10px;left:10px;background:rgba(14,12,11,0.55);color:#F4F2F1;padding:5px 11px;border-radius:var(--radius-full);font-size:11px;font-weight:600">${item.tempoLabel}</div>
      </div>
      <div style="font-size:15px;font-weight:600;margin-top:10px;color:var(--neutral-900)">${item.nome}</div>
      <div style="font-size:13px;color:var(--neutral-600);margin-top:2px">${item.categoria} · ${item.dificuldade}</div>
    </div>
  `;
}

function carouselSection(icon, title, list, onSeeAll) {
  if (!list.length) return null;
  return html`
    <div style="padding:18px 0 18px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 40px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:8px">
          ${icon}
          <div style="font-size:20px;font-weight:700;letter-spacing:-0.01em">${title}</div>
        </div>
        <div onClick=${onSeeAll} style="font-size:13px;font-weight:600;color:var(--brand-700);cursor:pointer">Ver todos</div>
      </div>
      <div className="yc-scroll" style="display:flex;gap:16px;overflow-x:auto;padding:0 40px 8px">
        ${list.map(recipeCard)}
      </div>
    </div>
  `;
}

// Shared "Receita do Dia" hero carousel — used by both renderHome (Receitas)
// and renderInicio (the new aggregator Home). Only one <div ref=...> ever
// mounts app.heroRef at a time (Início and Receitas are never both on
// screen simultaneously), so sharing the ref here is safe.
function heroSection(app, v) {
  return html`
    <div style="padding:24px 40px 8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#B24019"><path d="M12 2c1 3-1 4-1 6 0 1.5 1 2 2 2 1.5 0 2-1.5 1.5-3 2.5 1.5 4 4.5 4 7.5 0 4.4-3.6 8-8 8s-8-3.6-8-8c0-3 1.5-5.8 3.5-7.8-.3 1.3.2 2.3 1 2.8.3-3 1.7-5.8 5-7.5z"></path></svg>
        <div style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--brand-700)">Receita do Dia</div>
      </div>
      <div style="position:relative;padding-bottom:20px">
        <div ref=${(el) => { app.heroRef.current = el; }} onScroll=${v.onHeroScroll} className="yc-scroll" style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;border-radius:var(--radius-xl);box-shadow:var(--shadow-lg)">
          ${v.heroRecipes.map((hero) => html`
            <div key=${hero.id} onClick=${hero.onOpen} style="position:relative;flex:0 0 100%;scroll-snap-align:start;scroll-snap-stop:always;overflow:hidden;height:400px;cursor:pointer">
              <img loading="lazy" decoding="async" src=${hero.imagem} alt=${hero.nome} style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0"/>
              <div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(14,12,11,0.05) 20%, rgba(14,12,11,0.92) 100%)"></div>
              <div style="position:absolute;top:20px;left:20px;background:var(--overlay-strong);backdrop-filter:blur(8px);padding:8px 16px;border-radius:var(--radius-full);font-size:12px;font-weight:700;color:var(--brand-700)">Sugestão de hoje</div>
              <div style="position:absolute;left:28px;right:28px;bottom:26px;color:#F4F2F1">
                <div style="font-size:30px;font-weight:700;letter-spacing:-0.02em;margin-bottom:6px">${hero.nome}</div>
                <div style="font-size:14px;opacity:0.85;margin-bottom:16px">Uma receita pensada para reunir todo mundo à mesa hoje.</div>
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
                  <div style="display:flex;gap:10px;flex-wrap:wrap">
                    <span style="background:rgba(244,242,241,0.18);border:1px solid rgba(244,242,241,0.4);padding:6px 14px;border-radius:var(--radius-full);font-size:13px;font-weight:600">${hero.tempoLabel}</span>
                    <span style="background:rgba(244,242,241,0.18);border:1px solid rgba(244,242,241,0.4);padding:6px 14px;border-radius:var(--radius-full);font-size:13px;font-weight:600">${hero.porcoesLabel}</span>
                    <span style="background:rgba(244,242,241,0.18);border:1px solid rgba(244,242,241,0.4);padding:6px 14px;border-radius:var(--radius-full);font-size:13px;font-weight:600">${hero.dificuldade}</span>
                  </div>
                  <div style="background:var(--brand-700);padding:10px 20px;border-radius:var(--radius-full);font-size:14px;font-weight:700;white-space:nowrap;transition:transform 0.15s ease">Ver receita →</div>
                </div>
              </div>
            </div>
          `)}
        </div>
        ${v.heroHasMultiple && html`
          <div onClick=${v.onHeroPrev} style="position:absolute;left:12px;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:var(--radius-full);background:var(--overlay-strong);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform 0.15s ease;box-shadow:var(--shadow-sm)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="2.4"><path d="M15 18l-6-6 6-6"></path></svg>
          </div>
          <div onClick=${v.onHeroNext} style="position:absolute;right:12px;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:var(--radius-full);background:var(--overlay-strong);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform 0.15s ease;box-shadow:var(--shadow-sm)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="2.4"><path d="M9 18l6-6-6-6"></path></svg>
          </div>
          <div style="position:absolute;left:0;right:0;bottom:0px;display:flex;justify-content:center;gap:6px">
            ${v.heroDots.map((dot) => html`<div key=${dot.key} onClick=${dot.onClick} style=${dot.style}></div>`)}
          </div>
        `}
      </div>
    </div>
  `;
}

function renderHome(app, v) {
  return html`
    <div style="padding:40px 40px 8px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:14px;color:var(--neutral-600);font-weight:500">Olá, ${v.userGreetingName}</div>
          <div style="font-size:32px;font-weight:700;letter-spacing:-0.02em;color:var(--neutral-950)">O que vamos cozinhar hoje?</div>
        </div>
        <div style="width:52px;height:52px;border-radius:var(--radius-full);background:var(--brand-100);display:flex;align-items:center;justify-content:center;font-weight:700;color:#F4F2F1;font-size:20px">${v.profileInitial}</div>
      </div>
      ${v.hasPublicCatalogFallback && html`
        <div style="margin-top:16px;background:rgba(195,61,34,0.1);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <span>Não foi possível carregar o catálogo do servidor. Mostrando um catálogo de exemplo. ${v.publicCatalogError}</span>
          <button onClick=${v.onRetryPublicCatalog} style="background:var(--red-600);color:#F4F2F1;border:none;border-radius:var(--radius-full);padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Tentar novamente</button>
        </div>
      `}
    </div>

    ${heroSection(app, v)}

    <div style="padding:20px 0 4px">
      <div className="yc-scroll" style="display:flex;gap:10px;overflow-x:auto;padding:0 40px">
        ${v.homeCategoryChips.map((chip) => html`<div key=${chip.label} onClick=${chip.onClick} style="flex-shrink:0;padding:10px 20px;border-radius:var(--radius-full);background:var(--neutral-50);border:1px solid var(--neutral-100);font-size:13px;font-weight:600;color:var(--neutral-800);cursor:pointer;white-space:nowrap">${chip.label}</div>`)}
      </div>
      ${v.homeCategoriesEmpty && html`
        <div style="margin:4px 40px 0;font-size:12px;color:var(--neutral-600)">Nenhuma categoria pública cadastrada ainda.</div>
      `}
    </div>

    ${v.homeSectionBlocks.map((sec) => carouselSection(resolveSectionIcon(sec.icon, sec.key, false), sec.label, sec.items, v.goSearch))}
  `;
}

// Início: aggregator home — hero + search bar + a recipe carousel + a
// product carousel. Search bar reuses the same screen/state as renderSearch
// (v.searchQuery/onSearchChange); submitting just navigates there so the
// results grid is never duplicated here.
function renderInicio(app, v) {
  return html`
    <div style="padding:40px 40px 8px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:14px;color:var(--neutral-600);font-weight:500">Olá, ${v.userGreetingName}</div>
          <div style="font-size:32px;font-weight:700;letter-spacing:-0.02em;color:var(--neutral-950)">O que vamos cozinhar hoje?</div>
        </div>
        <div style="width:52px;height:52px;border-radius:var(--radius-full);background:var(--brand-100);display:flex;align-items:center;justify-content:center;font-weight:700;color:#F4F2F1;font-size:20px">${v.profileInitial}</div>
      </div>
      ${v.hasPublicCatalogFallback && html`
        <div style="margin-top:16px;background:rgba(195,61,34,0.1);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <span>Não foi possível carregar o catálogo do servidor. Mostrando um catálogo de exemplo. ${v.publicCatalogError}</span>
          <button onClick=${v.onRetryPublicCatalog} style="background:var(--red-600);color:#F4F2F1;border:none;border-radius:var(--radius-full);padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Tentar novamente</button>
        </div>
      `}
      <div style="position:relative;margin-top:20px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-400)" stroke-width="2" style="position:absolute;left:18px;top:50%;transform:translateY(-50%)"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>
        <input type="text" value=${v.searchQuery} onInput=${v.onSearchChange} onKeyDown=${v.onInicioSearchSubmit} placeholder="Buscar receitas..." style="color:var(--neutral-900);width:100%;padding:16px 20px 16px 46px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-size:16px;font-family:var(--font-sans);background:var(--neutral-0);outline:none;box-sizing:border-box"/>
      </div>
    </div>

    ${heroSection(app, v)}

    ${(() => {
      const recommended = v.homeSectionBlocks.find((b) => b.key === 'recomendado') || v.homeSectionBlocks[0];
      return recommended ? carouselSection(resolveSectionIcon(recommended.icon, recommended.key, false), recommended.label, recommended.items, v.goHome) : null;
    })()}
    ${carouselSection(productSectionIcon(), v.inicioProductBlock.label, v.inicioProductBlock.items, v.goProducts)}
  `;
}

function homeSectionIcon(key) {
  const icons = {
    recomendado: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M12 2l2.4 6.8L21 11l-6.6 2.2L12 20l-2.4-6.8L3 11l6.6-2.2L12 2z"></path></svg>`,
    pratico: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path></svg>`,
    ocasiao: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M20 12v9H4v-9M2 7h20v5H2V7zM12 7v14M12 7c-1.5-3-6-3-6 0s4.5 1.5 6 0zM12 7c1.5-3 6-3 6 0s-4.5 1.5-6 0z"></path></svg>`,
    rapido: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M13 2L5 14h6l-1 8 9-12h-6l1-8z"></path></svg>`,
    churrasco: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M12 3c1 3-1 4-1 6 0 1.5 1 2 2 2 1.5 0 2-1.5 1.5-3 2.5 1.5 4 4.5 4 7.5 0 3.6-3.6 6.5-8 6.5s-8-2.9-8-6.5c0-3 1.5-5.8 3.5-7.8-.3 1.3.2 2.3 1 2.8.3-3 1.7-5.5 5-7.5z"></path></svg>`,
    petisco: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><circle cx="12" cy="13" r="7"></circle><path d="M12 6V3M8 3h8"></path></svg>`,
    promocao: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M20.6 12.6L12 21.2 2.8 12 12 2.8h8.2z"></path><circle cx="9" cy="9" r="1.5"></circle></svg>`,
  };
  return icons[key] || html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"></path></svg>`;
}

function productSectionIcon() {
  return html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M4 8l1.5-4h13L20 8"></path><path d="M4 8h16v12H4z"></path><path d="M9 12a3 3 0 006 0"></path></svg>`;
}

// Icon picker palette (#4) — a fixed set of inline SVGs (18x18, same visual
// language as homeSectionIcon above) an admin can pick from when creating a
// new recipe or product section. Reuses the exact same SVGs as
// homeSectionIcon's per-key lookup for the first 7 entries (so a section
// created with, say, the "clock" icon looks identical to the built-in
// "pratico" section), plus a handful of new generic icons.
const ICON_CHOICES = [
  { key: 'star', svg: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M12 2l2.4 6.8L21 11l-6.6 2.2L12 20l-2.4-6.8L3 11l6.6-2.2L12 2z"></path></svg>` },
  { key: 'clock', svg: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path></svg>` },
  { key: 'calendar', svg: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M20 12v9H4v-9M2 7h20v5H2V7zM12 7v14M12 7c-1.5-3-6-3-6 0s4.5 1.5 6 0zM12 7c1.5-3 6-3 6 0s-4.5 1.5-6 0z"></path></svg>` },
  { key: 'lightning', svg: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M13 2L5 14h6l-1 8 9-12h-6l1-8z"></path></svg>` },
  { key: 'flame', svg: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M12 3c1 3-1 4-1 6 0 1.5 1 2 2 2 1.5 0 2-1.5 1.5-3 2.5 1.5 4 4.5 4 7.5 0 3.6-3.6 6.5-8 6.5s-8-2.9-8-6.5c0-3 1.5-5.8 3.5-7.8-.3 1.3.2 2.3 1 2.8.3-3 1.7-5.5 5-7.5z"></path></svg>` },
  { key: 'skewer', svg: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><circle cx="12" cy="13" r="7"></circle><path d="M12 6V3M8 3h8"></path></svg>` },
  { key: 'tag', svg: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M20.6 12.6L12 21.2 2.8 12 12 2.8h8.2z"></path><circle cx="9" cy="9" r="1.5"></circle></svg>` },
  { key: 'heart', svg: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.3 2 4.5 5.6 4c2-.3 3.9.6 5 2.2C11.7 4.6 13.6 3.7 15.6 4c3.6.5 5.2 4.3 3.6 7.7C19.5 16.4 12 21 12 21z"></path></svg>` },
  { key: 'leaf', svg: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M5 21c8 0 14-6 14-14V4h-3C8 4 3 9 3 16v5z"></path><path d="M5 21c3-4 6-7 12-11"></path></svg>` },
  { key: 'fish', svg: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M2 12s4-6 11-6 9 6 9 6-2 6-9 6-11-6-11-6z"></path><path d="M18 9l3-3M18 15l3 3"></path><circle cx="8" cy="12" r="1"></circle></svg>` },
  { key: 'drumstick', svg: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M15 11c2.5-2.5 6.5-2.5 7.5 0s0 5-2.5 7.5-5.5 3.5-7.5 1.5-1-5 1.5-7.5z"></path><path d="M13 13L3 21"></path><path d="M3 21l1-4 3-1"></path></svg>` },
  { key: 'bread', svg: html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M4 12c0-5 3.5-9 8-9s8 4 8 9v6H4v-6z"></path><path d="M9 12v3M12 10v5M15 12v3"></path></svg>` },
];
function iconChoiceSvg(iconKey) {
  const found = ICON_CHOICES.find((c) => c.key === iconKey);
  return found ? found.svg : null;
}
// Shared icon-resolution helper for every carousel-header icon (recipe AND
// product sections alike, per #4) — an admin-picked palette icon (stored on
// the section at creation time, see addHomeSection/addProductSection) wins
// when present, otherwise falls back to the pre-existing key-based lookup
// (homeSectionIcon for recipe sections, productSectionIcon for product
// sections/category carousels).
function resolveSectionIcon(iconKey, fallbackKey, isProduct) {
  const fromPalette = iconKey && iconChoiceSvg(iconKey);
  if (fromPalette) return fromPalette;
  return isProduct ? productSectionIcon() : homeSectionIcon(fallbackKey);
}

// Produtos — mirrors renderHome's structure (header + category chips +
// section carousels), but for products instead of recipes: reuses
// productCard (below) instead of recipeCard. Ends with one carousel per
// enabled product category/badge (Bovinos, Suínos, Aves...) instead of a
// single "Todos os Produtos" catch-all — see the categoryBlocks/
// productPageBlocks assembly in computeViewModel.
function productCard(item) {
  return html`
    <div key=${item.id} onClick=${item.onOpen} style=${item.carouselStyle}>
      <div style="position:relative;border-radius:var(--radius-lg);overflow:hidden;height:160px;box-shadow:var(--shadow-sm)">
        <img loading="lazy" decoding="async" src=${item.imagem} alt=${item.nome} style="width:100%;height:100%;object-fit:cover"/>
        <div style="position:absolute;top:10px;left:10px;background:rgba(14,12,11,0.55);color:#F4F2F1;padding:5px 11px;border-radius:var(--radius-full);font-size:11px;font-weight:600">${item.tempoLabel}</div>
      </div>
      <div style="font-size:15px;font-weight:600;margin-top:10px;color:var(--neutral-900)">${item.nome}</div>
      <div style="font-size:13px;color:var(--neutral-600);margin-top:2px">${item.categoria} · ${item.dificuldade}</div>
    </div>
  `;
}

function productCarouselSection(icon, title, list) {
  if (!list.length) return null;
  return html`
    <div style="padding:18px 0 18px">
      <div style="display:flex;align-items:center;gap:8px;padding:0 40px;margin-bottom:14px">
        ${icon}
        <div style="font-size:20px;font-weight:700;letter-spacing:-0.01em">${title}</div>
      </div>
      <div className="yc-scroll" style="display:flex;gap:16px;overflow-x:auto;padding:0 40px 8px">
        ${list.map(productCard)}
      </div>
    </div>
  `;
}

function renderProducts(app, v) {
  return html`
    <div style="padding:40px 40px 8px">
      <div style="font-size:32px;font-weight:700;letter-spacing:-0.02em;color:var(--neutral-950)">Produtos</div>
      ${v.hasPublicCatalogFallback && html`
        <div style="margin-top:16px;background:rgba(195,61,34,0.1);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <span>Não foi possível carregar o catálogo do servidor. Mostrando um catálogo de exemplo. ${v.publicCatalogError}</span>
          <button onClick=${v.onRetryPublicCatalog} style="background:var(--red-600);color:#F4F2F1;border:none;border-radius:var(--radius-full);padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Tentar novamente</button>
        </div>
      `}
    </div>

    <div style="padding:20px 0 4px">
      <div className="yc-scroll" style="display:flex;gap:10px;overflow-x:auto;padding:0 40px">
        ${v.productCategoryChips.map((chip) => html`<div key=${chip.label} onClick=${chip.onClick} style=${chip.style}>${chip.label}</div>`)}
      </div>
    </div>

    ${v.productPageBlocks.map((sec) => productCarouselSection(resolveSectionIcon(sec.icon, sec.key, true), sec.label, sec.items))}
    ${v.productsEmpty && html`<div style="padding:60px 40px;text-align:center;color:var(--neutral-600);font-size:15px">Nenhum produto cadastrado ainda.</div>`}
  `;
}

// Simple product detail modal — photo, nome, categoria, unidade, preço.
// Chrome mirrors renderMyRecipeDetailModal (overlay, close button, centered
// card).
function renderProductDetailModal(app, v) {
  const p = v.productDetailData;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:21;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div className="yc-scroll" style="width:460px;max-width:100%;max-height:90%;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;background:var(--neutral-0);border-radius:var(--radius-xl);box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        <div style="position:relative;height:220px;overflow:hidden;border-radius:var(--radius-xl) var(--radius-xl) 0 0">
          <img loading="lazy" decoding="async" src=${p.imagem} alt=${p.nome} style="width:100%;height:100%;object-fit:cover"/>
          <div onClick=${v.onCloseProductDetail} aria-label="Fechar" role="button" tabindex="0" style="position:absolute;top:16px;right:16px;width:36px;height:36px;border-radius:var(--radius-full);background:rgba(14,12,11,0.55);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;cursor:pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F4F2F1" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"></path></svg>
          </div>
        </div>
        <div style="padding:24px">
          <div style="font-size:22px;font-weight:700;margin-bottom:6px">${p.nome}</div>
          <div style="font-size:14px;color:var(--neutral-600);margin-bottom:16px">${p.categoria} · por ${p.unidade}</div>
          <div style="font-size:26px;font-weight:700;color:var(--brand-700)">${p.precoLabel}</div>
          ${p.relatedRecipes && p.relatedRecipes.length > 0 && html`
            <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--neutral-100)">
              <div style="font-size:13px;font-weight:700;color:var(--neutral-600);margin-bottom:10px">Receitas que usam este produto</div>
              <div style="display:flex;flex-direction:column;gap:8px">
                ${p.relatedRecipes.map((r) => html`
                  <div key=${r.id} onClick=${r.onOpen} style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--neutral-50);border-radius:var(--radius-md);padding:10px 14px;cursor:pointer;transition:background 0.15s ease">
                    <span style="font-size:14px;font-weight:600;color:var(--brand-700)">${r.nome}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="2.2"><path d="M9 6l6 6-6 6"></path></svg>
                  </div>
                `)}
              </div>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

// "Seções de Produtos" click-to-add-products picker (#1) — a search field
// (#2, same input) over the full products list, each row a checkbox toggling
// whether that product belongs to the section being edited. Chrome mirrors
// renderProductDetailModal (overlay, close button, centered card).
function renderProductSectionPickerModal(app, v) {
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:21;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div style="width:480px;max-width:100%;max-height:80%;display:flex;flex-direction:column;box-sizing:border-box;background:var(--neutral-0);border-radius:var(--radius-xl);box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease;overflow:hidden">
        <div style="padding:24px 24px 0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
          <div>
            <div style="font-size:19px;font-weight:700">Produtos em: ${v.productSectionPickerLabel}</div>
            <div style="font-size:12px;color:var(--neutral-600);margin-top:2px">Toque em um produto para adicioná-lo ou removê-lo desta seção.</div>
          </div>
          <div onClick=${v.onCloseProductSectionPicker} aria-label="Fechar" role="button" tabindex="0" style="width:32px;height:32px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-900)" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"></path></svg>
          </div>
        </div>
        <div style="padding:16px 24px 0">
          <div style="position:relative">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-400)" stroke-width="2" style="position:absolute;left:14px;top:50%;transform:translateY(-50%)"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>
            <input type="text" value=${v.productSectionPickerQuery} onInput=${v.onProductSectionPickerSearchChange} placeholder="Buscar produtos..." style="color:var(--neutral-900);width:100%;padding:12px 14px 12px 40px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);background:var(--neutral-0);font-family:var(--font-sans);font-size:14px;outline:none;box-sizing:border-box"/>
          </div>
        </div>
        <div className="yc-scroll" style="flex:1;overflow-y:auto;padding:16px 24px 24px">
          ${v.productSectionPickerRows.length === 0 && html`<div style="text-align:center;color:var(--neutral-600);font-size:13px;padding:20px 0">Nenhum produto encontrado.</div>`}
          ${v.productSectionPickerRows.map((row) => html`
            <div key=${row.id} onClick=${row.onToggle} style=${`display:flex;align-items:center;gap:12px;background:${row.checked ? 'rgba(178,64,25,0.08)' : 'var(--neutral-0)'};border:1px solid ${row.checked ? 'var(--brand-500)' : 'var(--neutral-100)'};border-radius:var(--radius-md);padding:10px 12px;margin-bottom:8px;cursor:pointer;transition:background 0.15s ease,border-color 0.15s ease`}>
              <img loading="lazy" decoding="async" src=${row.imagem} alt="" style="width:36px;height:36px;border-radius:8px;object-fit:cover;flex-shrink:0"/>
              <div style="flex:1;min-width:0">
                <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${row.nome}</div>
                <div style="font-size:12px;color:var(--neutral-600)">${row.categoria}</div>
              </div>
              <div style=${`width:22px;height:22px;border-radius:7px;border:2px solid var(--brand-700);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${row.checked ? 'var(--brand-700)' : 'transparent'};color:#F4F2F1;font-size:13px;font-weight:700`}>${row.checked ? '✓' : ''}</div>
            </div>
          `)}
        </div>
      </div>
    </div>
  `;
}

function renderSearch(app, v) {
  return html`
    <div style="padding:40px 40px 16px">
      <div style="font-size:32px;font-weight:700;letter-spacing:-0.02em;margin-bottom:20px">Buscar Receitas</div>
      <input type="text" value=${v.searchQuery} onInput=${v.onSearchChange} placeholder="Buscar por nome..." style="color:var(--neutral-900);width:100%;padding:16px 20px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-size:16px;font-family:var(--font-sans);background:var(--neutral-0);outline:none"/>
      <div style="display:flex;gap:10px;overflow-x:auto;margin-top:16px;padding-bottom:4px">
        ${v.categoryChips.map((chip) => html`<div key=${chip.label} onClick=${chip.onClick} style=${chip.style}>${chip.label}</div>`)}
      </div>
    </div>
    <div style="padding:8px 40px 24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px">
      ${v.filteredSearchResults.map((item) => html`
        <div key=${item.id} onClick=${item.onOpen} style=${item.gridCardStyle}>
          <div style="height:130px;overflow:hidden"><img loading="lazy" decoding="async" src=${item.imagem} alt=${item.nome} style="width:100%;height:100%;object-fit:cover"/></div>
          <div style="padding:14px">
            <div style="font-size:15px;font-weight:600">${item.nome}</div>
            <div style="font-size:13px;color:var(--neutral-600);margin-top:4px">${item.tempoLabel} · ${item.categoria} · ${item.dificuldade}</div>
          </div>
        </div>
      `)}
    </div>
    ${v.searchResultsEmpty && html`<div style="padding:60px 40px;text-align:center;color:var(--neutral-600);font-size:15px">Nenhuma receita encontrada.</div>`}
  `;
}

function renderFavorites(app, v) {
  return html`
    <div style="padding:40px 40px 16px">
      <div style="font-size:32px;font-weight:700;letter-spacing:-0.02em">Favoritos</div>
    </div>
    ${v.favoritesEmpty && html`<div style="padding:60px 40px;text-align:center;color:var(--neutral-600);font-size:15px">Você ainda não tem receitas favoritas.<br/>Toque no coração de uma receita para salvá-la aqui.</div>`}
    <div style="padding:8px 40px 24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px">
      ${v.favoritesList.map((item) => html`
        <div key=${item.id} style=${item.gridCardStyle}>
          <div onClick=${item.onOpen} style="height:130px;overflow:hidden"><img loading="lazy" decoding="async" src=${item.imagem} alt=${item.nome} style="width:100%;height:100%;object-fit:cover"/></div>
          <div onClick=${item.onToggleFavorite} style="position:absolute;top:8px;right:8px;width:32px;height:32px;border-radius:var(--radius-full);background:rgba(14,12,11,0.55);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform 0.15s ease">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#D2562D" stroke="#D2562D"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.3 2 4.5 5.6 4c2-.3 3.9.6 5 2.2C11.7 4.6 13.6 3.7 15.6 4c3.6.5 5.2 4.3 3.6 7.7C19.5 16.4 12 21 12 21z"></path></svg>
          </div>
          <div style="padding:14px" onClick=${item.onOpen}>
            <div style="font-size:15px;font-weight:600">${item.nome}</div>
            <div style="font-size:13px;color:var(--neutral-600);margin-top:4px">${item.tempoLabel} · ${item.categoria} · ${item.dificuldade}</div>
          </div>
        </div>
      `)}
    </div>
  `;
}

function weatherIcon(size, isSun, isCloud, isRain) {
  if (isSun) return html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="var(--yellow-600)" stroke-width=${size > 30 ? '1.6' : '1.8'}><circle cx="12" cy="12" r="4"></circle><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"></path></svg>`;
  if (isCloud) return html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="var(--neutral-400)" stroke-width=${size > 30 ? '1.6' : '1.8'}><path d="M6.5 19a4.5 4.5 0 010-9 5.5 5.5 0 0110.6-1.7A4 4 0 0117 19H6.5z"></path></svg>`;
  if (isRain) return html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="var(--blue-500)" stroke-width=${size > 30 ? '1.6' : '1.8'}><path d="M6.5 15a4.5 4.5 0 010-9 5.5 5.5 0 0110.6-1.7A4 4 0 0117 15H6.5z"></path><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2"></path></svg>`;
  return null;
}

function indicatorCard(icon, label, value, item) {
  return html`
    <div style="background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-lg);padding:20px;box-shadow:var(--shadow-sm)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        ${icon}
        <div style="font-size:13px;font-weight:600;color:var(--neutral-600);text-transform:uppercase;letter-spacing:0.04em">${label}</div>
      </div>
      <div style="font-size:26px;font-weight:700">${item.valor}</div>
      <div style="display:flex;align-items:center;gap:4px;margin-top:4px">
        ${item.isUp && html`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke=${item.trendColor} stroke-width="2.5"><path d="M6 15l6-6 6 6"></path></svg>`}
        ${item.isDown && html`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke=${item.trendColor} stroke-width="2.5"><path d="M6 9l6 6 6-6"></path></svg>`}
        <div style=${`font-size:13px;font-weight:600;color:${item.trendColor}`}>${item.variacao}</div>
      </div>
    </div>
  `;
}

function statsCards(stats) {
  return html`
    <div className="yc-indicators-grid">
      <div style="background:var(--neutral-50);border-radius:var(--radius-md);padding:14px 16px;box-sizing:border-box">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="2"><circle cx="6" cy="6" r="2"></circle><circle cx="18" cy="18" r="2"></circle><path d="M19 5L5 19"></path></svg>
          <div style="font-size:12px;color:var(--neutral-600)">IPC Médio</div>
        </div>
        <div style="font-size:22px;font-weight:700">${stats.ipcMedioLabel}</div>
      </div>
      <div style="background:var(--neutral-50);border-radius:var(--radius-md);padding:14px 16px;box-sizing:border-box">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="1.8"><path d="M20.6 12.6L12 21.2 3 12.2V4h8.2L20.6 12.6z"></path><circle cx="7.5" cy="7.5" r="1.3" fill="var(--brand-700)" stroke="none"></circle></svg>
          <div style="font-size:12px;color:var(--neutral-600)">Ticket Médio</div>
        </div>
        <div style="font-size:22px;font-weight:700">${stats.tmLabel}</div>
      </div>
      <div style="background:var(--neutral-50);border-radius:var(--radius-md);padding:14px 16px;box-sizing:border-box">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="2.6"></circle></svg>
          <div style="font-size:12px;color:var(--neutral-600)">Valor Total</div>
        </div>
        <div style="font-size:22px;font-weight:700">${stats.valorTotalLabel}</div>
      </div>
      <div style="background:var(--neutral-50);border-radius:var(--radius-md);padding:14px 16px;box-sizing:border-box">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="1.8"><circle cx="9" cy="21" r="1"></circle><circle cx="19" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"></path></svg>
          <div style="font-size:12px;color:var(--neutral-600)">Qtd. de Vendas</div>
        </div>
        <div style="font-size:22px;font-weight:700">${stats.qtdVendasLabel}</div>
      </div>
    </div>
  `;
}

function renderDados(app, v) {
  return html`
    <div style="padding:40px 40px 4px;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <div style="font-size:32px;font-weight:700;letter-spacing:-0.02em">Dados</div>
        <div style="font-size:14px;color:var(--neutral-600);margin-top:4px">Acompanhe vendas, previsão do tempo e indicadores econômicos</div>
      </div>
      <div style="display:flex;flex-shrink:0">
        <div style="display:flex;gap:10px">
          <div onClick=${v.onOpenSalesModal} style="display:flex;align-items:center;gap:8px;background:var(--brand-700);color:#F4F2F1;border-radius:var(--radius-full);padding:12px 20px;font-size:14px;font-weight:700;cursor:pointer;transition:transform 0.15s ease;white-space:nowrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F4F2F1" stroke-width="2.4"><path d="M12 5v14M5 12h14"></path></svg>
            Registrar Venda
          </div>
          <div onClick=${v.goSalesHistory} title="Vendas Registradas" style="display:flex;align-items:center;justify-content:center;background:var(--neutral-0);color:var(--brand-700);border:1.5px solid var(--brand-500);border-radius:var(--radius-full);width:44px;height:44px;flex-shrink:0;cursor:pointer;transition:transform 0.15s ease">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="2.2"><path d="M4 6h16M4 12h16M4 18h16"></path></svg>
          </div>
        </div>
      </div>
    </div>

    <div style="padding:20px 40px 8px">
      <div style="background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-lg);padding:24px;box-shadow:var(--shadow-sm)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:20px">
          <div style="display:flex;flex-direction:column;gap:0">
            <div style="display:flex;align-items:center;gap:10px">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="2"><path d="M5 20V10M12 20V4M19 20v-7"></path></svg>
              <div style="font-size:15px;font-weight:700">Vendas por Semana</div>
            </div>
            <div style="font-size:13px;color:var(--neutral-600)">Total faturado nas últimas oito semanas</div>
          </div>
          <div style="width:170px;flex-shrink:0"><${CustomSelect} options=${v.weekdayOptions} value=${v.weekStartDayValue} onChange=${v.onWeekStartDaySet} /></div>
        </div>
        <div style="height:160px;display:flex;flex-direction:column">
          <div className="yc-scroll" style="overflow-x:auto;flex:1;display:flex;flex-direction:column">
            <div style="min-width:480px;position:relative;flex:1">
              <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;overflow:visible">
                <defs>
                  <linearGradient id="ycWeeklyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--brand-700)" stop-opacity="0.28"></stop>
                    <stop offset="100%" stop-color="var(--brand-700)" stop-opacity="0"></stop>
                  </linearGradient>
                </defs>
                ${v.weeklySales.map((wk, i) => html`<line key=${i} x1=${wk.x} y1="0" x2=${wk.x} y2="100" stroke="var(--neutral-200)" stroke-width="0.8" stroke-dasharray="2,2" vector-effect="non-scaling-stroke"></line>`)}
                <polyline points=${v.weeklyAreaPoints} fill="url(#ycWeeklyGradient)" stroke="none"></polyline>
                <polyline points=${v.weeklyTrendPoints} fill="none" stroke="var(--brand-700)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"></polyline>
              </svg>
              ${v.weeklySales.map((wk, i) => html`<div key=${i} title=${wk.totalLabel} style=${wk.dotStyle}></div>`)}
            </div>
            <div style="min-width:480px;display:flex;gap:12px;margin-top:8px">
              ${v.weeklySales.map((wk, i) => html`<div key=${i} style="flex:1;text-align:center;font-size:11px;color:var(--neutral-600);font-weight:600">${wk.label}</div>`)}
            </div>
          </div>
        </div>

        <div style="margin-top:24px;padding-top:20px;border-top:1px solid var(--neutral-100)">
          <div style="font-size:13px;font-weight:600;color:var(--neutral-600);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:14px">Indicadores de Hoje</div>
          <div className="yc-indicators-container">
            ${statsCards(v.dailyStats)}
          </div>
        </div>

        <div style="margin-top:24px;padding-top:20px;border-top:1px solid var(--neutral-100)">
          <div style="font-size:13px;font-weight:600;color:var(--neutral-600);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:14px">Indicadores Mensais</div>
          <div className="yc-indicators-container">
            ${statsCards(v.monthlyStats)}
          </div>
        </div>
      </div>
    </div>

    <div style="padding:24px 40px 8px">
      <div style="font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--neutral-600);margin-bottom:10px">Widgets</div>
    </div>

    <div style="padding:0 40px 8px">
      <div style="background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-lg);padding:24px;box-shadow:var(--shadow-sm)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px">
          <div style="display:flex;align-items:center;gap:10px">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="1.8"><path d="M6.5 19a4.5 4.5 0 010-9 5.5 5.5 0 0110.6-1.7A4 4 0 0117 19H6.5z"></path></svg>
            <div>
              <div style="font-size:15px;font-weight:700">Previsão do Tempo</div>
              <div style="font-size:12px;color:var(--neutral-600);margin-top:2px">${v.weatherNow.condLabel}</div>
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:13px;font-weight:600">${v.weatherNow.cidade}</div>
            <div style="font-size:12px;color:var(--neutral-600);margin-top:2px">${v.weatherNow.dayLabel}</div>
          </div>
        </div>

        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:24px;margin-bottom:20px">
          <div style="display:flex;align-items:center;gap:14px">
            ${weatherIcon(48, v.weatherNow.isSun, v.weatherNow.isCloud, v.weatherNow.isRain)}
            <div style="font-size:44px;font-weight:700;line-height:1">${v.weatherNow.temp}°</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--neutral-600);font-weight:600">
            <div>Chuva: ${v.weatherNow.chuva}%</div>
            <div>Umidade: ${v.weatherNow.umidade}%</div>
            <div>Vento: ${v.weatherNow.vento} km/h</div>
          </div>
        </div>

        <div style="display:flex;gap:20px;border-bottom:1px solid var(--neutral-100);margin-bottom:16px">
          ${v.weatherTabs.map((tab) => html`<div key=${tab.key} onClick=${tab.onClick} style=${tab.style}>${tab.label}</div>`)}
        </div>

        <div className="yc-scroll" style="overflow-x:auto">
          <div style="min-width:480px;position:relative;height:80px;margin-bottom:6px">
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;overflow:visible">
              <defs>
                <linearGradient id="ycHourlyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--brand-700)" stop-opacity="0.28"></stop>
                  <stop offset="100%" stop-color="var(--brand-700)" stop-opacity="0"></stop>
                </linearGradient>
              </defs>
              ${v.hourly.map((h, i) => html`<line key=${i} x1=${h.cx} y1="0" x2=${h.cx} y2="100" stroke="var(--neutral-200)" stroke-width="0.8" stroke-dasharray="2,2" vector-effect="non-scaling-stroke"></line>`)}
              <polyline points=${v.hourlyAreaPoints} fill="url(#ycHourlyGradient)" stroke="none"></polyline>
              <polyline points=${v.hourlyLinePoints} fill="none" stroke="var(--brand-700)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"></polyline>
            </svg>
            ${v.hourly.map((h, i) => html`<div key=${'d' + i} style=${h.dotStyle}></div><div key=${'l' + i} style=${h.valueLabelStyle}>${h.valueLabel}</div>`)}
          </div>
          <div style="min-width:480px;display:flex;justify-content:space-between;margin-bottom:20px">
            ${v.hourly.map((h, i) => html`<div key=${i} style="flex:1;text-align:center;font-size:11px;color:var(--neutral-600);font-weight:600">${h.hora}</div>`)}
          </div>
        </div>

        <div className="yc-scroll" style="display:flex;gap:8px;overflow-x:auto">
          ${v.weatherForecast.map((day, i) => html`
            <div key=${i} style="flex:1;min-width:64px;display:flex;flex-direction:column;align-items:center;gap:6px;background:var(--neutral-50);border-radius:var(--radius-md);padding:12px 8px;box-sizing:border-box">
              <div style="font-size:12px;font-weight:700">${day.dia}</div>
              ${weatherIcon(22, day.isSun, day.isCloud, day.isRain)}
              <div style="font-size:13px;font-weight:700">${day.tempMax}°</div>
              <div style="font-size:12px;color:var(--neutral-600)">${day.tempMin}°</div>
            </div>
          `)}
        </div>
      </div>
    </div>

    <div className="yc-indicators-container" style="padding:16px 40px 8px">
      <div className="yc-indicators-grid" style="--yc-indicators-gap:16px">
        ${indicatorCard(html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="2"><circle cx="6" cy="6" r="2"></circle><circle cx="18" cy="18" r="2"></circle><path d="M19 5L5 19"></path></svg>`, 'Inflação (IPCA)', null, v.economicData.ipca)}
        ${indicatorCard(html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="1.8"><path d="M4 17V9a2 2 0 012-2h2M20 7v8a2 2 0 01-2 2h-2M8 21h8M9 3h6"></path><path d="M9 12h6"></path></svg>`, 'Taxa Selic', null, v.economicData.selic)}
        ${indicatorCard(html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"></path></svg>`, 'Dólar (USD)', null, v.economicData.dolar)}
        ${indicatorCard(html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="1.8"><path d="M18 6a7 7 0 100 12M4 10h9M4 14h9"></path></svg>`, 'Euro (EUR)', null, v.economicData.euro)}
      </div>
    </div>

    <div style="padding:8px 40px 32px;display:flex;align-items:center;justify-content:flex-end;gap:10px">
      <div style="font-size:12px;color:var(--neutral-600)">Atualizado às ${v.updatedAtLabel}</div>
      <div onClick=${v.onRefreshIndicators} style="width:32px;height:32px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform 0.25s ease">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="2"><path d="M3 12a9 9 0 0115-6.7M21 12a9 9 0 01-15 6.7"></path><path d="M3 3v6h6M21 21v-6h-6"></path></svg>
      </div>
    </div>
  `;
}

function renderSalesHistory(app, v) {
  return html`
    <div style="padding:32px 40px 16px;display:flex;align-items:center;gap:16px">
      <div onClick=${v.onBackFromSalesHistory} style="width:40px;height:40px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform 0.15s ease">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-900)" stroke-width="2.2"><path d="M15 18l-6-6 6-6"></path></svg>
      </div>
      <div>
        <div style="font-size:26px;font-weight:700;letter-spacing:-0.02em">Vendas Registradas</div>
        <div style="font-size:14px;color:var(--neutral-600);margin-top:2px">${v.salesHistoryCountLabel}</div>
      </div>
    </div>

    <div style="padding:8px 40px 40px">
      ${v.saleSelectionMode && html`
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--brand-700);color:#F4F2F1;border-radius:var(--radius-md);padding:22px 16px 14px;margin-bottom:14px;position:fixed;left:40px;right:40px;top:14px;z-index:35;box-shadow:var(--shadow-md);animation:ycFadeIn 0.2s ease">
          <div style="font-size:14px;font-weight:600">${v.selectedSaleCountLabel}</div>
          <div style="display:flex;gap:10px">
            <div onClick=${v.onBulkDeleteSalesAsk} style="font-size:13px;font-weight:700;cursor:pointer;padding:8px 14px;border-radius:var(--radius-full);background:rgba(244,242,241,0.18)">Excluir</div>
            <div onClick=${v.onCancelSaleSelection} style="font-size:13px;font-weight:700;cursor:pointer;padding:8px 14px;border-radius:var(--radius-full);background:rgba(244,242,241,0.18)">Cancelar</div>
          </div>
        </div>
      `}
      ${v.salesHistoryEmpty && html`<div style="text-align:center;padding:60px 20px;color:var(--neutral-600);font-size:14px">Nenhuma venda registrada ainda.</div>`}
      ${v.salesHistoryRows.map((row) => html`
        <div key=${row.id} onMouseDown=${row.onPressStart} onMouseUp=${row.onPressEnd} onMouseLeave=${row.onPressEnd} onTouchStart=${row.onPressStart} onTouchEnd=${row.onPressEnd} onClick=${row.onRowClick} style=${row.rowStyle}>
          <div style="display:flex;align-items:center;gap:14px">
            ${row.showCheckbox && html`<div style=${row.checkboxStyle}>${row.checkMark}</div>`}
            <div>
              <div style="font-size:15px;font-weight:700">${row.valorLabel}</div>
              <div style="font-size:13px;color:var(--neutral-600);margin-top:2px">${row.dateLabel} · IPC ${row.ipc}</div>
            </div>
          </div>
          ${row.showActions && html`
            <div style="display:flex;gap:8px;flex-shrink:0">
              <div onClick=${row.onEdit} style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform 0.15s ease">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-900)" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
              </div>
              <div onClick=${row.onDelete} style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform 0.15s ease">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--red-600)" stroke-width="2"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path></svg>
              </div>
            </div>
          `}
        </div>
      `)}
    </div>
  `;
}

function renderProfile(app, v) {
  return html`
    <div style="padding:40px 40px 24px">
      <div style="font-size:32px;font-weight:700;letter-spacing:-0.02em;margin-bottom:24px">Perfil</div>
      ${v.hasProfile && html`
        <div style="display:flex;align-items:center;gap:20px;background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-lg);padding:24px;box-shadow:var(--shadow-sm)">
          <div style="width:72px;height:72px;border-radius:var(--radius-full);background:var(--brand-700);color:#F4F2F1;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;flex-shrink:0">${v.profileInitial}</div>
          <div style="flex:1">
            <div style="font-size:22px;font-weight:700">${v.authDisplayName || 'Visitante'}</div>
            <div style="font-size:14px;color:var(--neutral-600);margin-top:4px">${v.profile.cargo} · ${v.profile.idade} anos · ${v.profile.genero}</div>
          </div>
          <div onClick=${v.onEditProfile} style="font-size:14px;font-weight:600;color:var(--brand-700);cursor:pointer;border:1.5px solid var(--brand-700);padding:10px 16px;border-radius:var(--radius-full);transition:transform 0.15s ease">Editar</div>
        </div>
      `}

      <div onClick=${v.goFavorites} style=${`display:flex;align-items:center;justify-content:space-between;background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-lg);padding:20px 22px;margin-top:16px;cursor:pointer;transition:transform 0.15s ease;border-color:${v.settingsBorderColor}`}>
        <div style="display:flex;align-items:center;gap:14px">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="1.8"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.3 2 4.5 5.6 4c2-.3 3.9.6 5 2.2C11.7 4.6 13.6 3.7 15.6 4c3.6.5 5.2 4.3 3.6 7.7C19.5 16.4 12 21 12 21z"></path></svg>
          <div>
            <div style="font-size:16px;font-weight:600">Favoritos</div>
            <div style="font-size:13px;color:var(--neutral-600)">${v.favoritesCount} receitas favoritas</div>
          </div>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-400)" stroke-width="2"><path d="M9 6l6 6-6 6"></path></svg>
      </div>

      <div style="margin-top:32px;font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--neutral-600);margin-bottom:10px">Configurações</div>
      <div style=${`display:flex;align-items:center;justify-content:space-between;background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-lg);padding:20px 22px;margin-bottom:12px;border-color:${v.settingsBorderColor}`}>
        <div style="display:flex;align-items:center;gap:14px">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="1.8"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"></path></svg>
          <div>
            <div style="font-size:16px;font-weight:600">Modo Escuro</div>
            <div style="font-size:13px;color:var(--neutral-600)">Alterna entre tema claro e escuro</div>
          </div>
        </div>
        <div onClick=${v.onToggleDarkMode} style=${v.darkModeTrackStyle}><div style=${v.darkModeThumbStyle}></div></div>
      </div>
      <div onClick=${v.onToggleFullscreen} style=${`display:flex;align-items:center;justify-content:space-between;background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-lg);padding:20px 22px;margin-bottom:12px;border-color:${v.settingsBorderColor};cursor:pointer;transition:transform 0.15s ease`}>
        <div style="display:flex;align-items:center;gap:14px">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="1.8"><path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3"></path></svg>
          <div>
            <div style="font-size:16px;font-weight:600">${v.fullscreenLabel}</div>
            <div style="font-size:13px;color:var(--neutral-600)">Expande o app para ocupar toda a tela</div>
          </div>
        </div>
      </div>
      ${v.isWide && html`
        <div style=${`display:flex;align-items:center;justify-content:space-between;background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-lg);padding:20px 22px;margin-bottom:12px;border-color:${v.settingsBorderColor}`}>
          <div style="display:flex;align-items:center;gap:14px">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="1.8"><path d="M4 6h16M4 12h16M4 18h16"></path></svg>
            <div>
              <div style="font-size:16px;font-weight:600">Barra de Navegação</div>
              <div style="font-size:13px;color:var(--neutral-600)">Lado da barra lateral em tablets e desktops</div>
            </div>
          </div>
          <div style="display:flex;gap:6px;background:var(--neutral-50);border-radius:var(--radius-full);padding:3px">
            <div onClick=${v.onSetNavRailLeft} style=${v.navRailLeftBtnStyle}>Esquerda</div>
            <div onClick=${v.onSetNavRailRight} style=${v.navRailRightBtnStyle}>Direita</div>
          </div>
        </div>
      `}
      <div style=${`display:flex;align-items:center;justify-content:space-between;background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-lg);padding:20px 22px;margin-bottom:12px;border-color:${v.settingsBorderColor};flex-wrap:wrap;gap:12px`}>
        <div style="display:flex;align-items:center;gap:14px">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="1.8"><path d="M4 7V4h16v3"></path><path d="M9 20h6"></path><path d="M12 4v16"></path></svg>
          <div>
            <div style="font-size:16px;font-weight:600">Tamanho da Fonte</div>
            <div style="font-size:13px;color:var(--neutral-600)">Ajusta o tamanho do texto e dos cartões no app</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;background:var(--neutral-50);border-radius:var(--radius-full);padding:3px">
          <div onClick=${v.onSetFontSizeSmall} style=${v.fontSizeSmBtnStyle}>Pequeno</div>
          <div onClick=${v.onSetFontSizeNormal} style=${v.fontSizeNormalBtnStyle}>Normal</div>
          <div onClick=${v.onSetFontSizeLarge} style=${v.fontSizeLgBtnStyle}>Grande</div>
        </div>
      </div>
      <div onClick=${v.onOpenAdminAttempt} style="display:flex;align-items:center;justify-content:space-between;background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-lg);padding:20px 22px;cursor:pointer;transition:transform 0.15s ease">
        <div style="display:flex;align-items:center;gap:14px">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="1.8"><path d="M12 2l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V5l7-3z"></path><path d="M9 12l2 2 4-4"></path></svg>
          <div>
            <div style="font-size:16px;font-weight:600">Modo de Criação</div>
            <div style="font-size:13px;color:var(--neutral-600)">${v.adminStatusLabel}</div>
          </div>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-400)" stroke-width="2"><path d="M9 6l6 6-6 6"></path></svg>
      </div>
      ${v.hasSession && html`
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-lg);padding:20px 22px;margin-top:12px">
          <div style="display:flex;align-items:center;gap:14px">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" stroke-width="1.8"><path d="M16 17l5-5-5-5M21 12H9M13 21H7a2 2 0 01-2-2V5a2 2 0 012-2h6"></path></svg>
            <div>
              <div style="font-size:16px;font-weight:600">${v.authDisplayName || 'Conta Conectada'}</div>
              <div style="font-size:13px;color:var(--neutral-600)">${v.connectedCredentialLabel}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div onClick=${v.onOpenChangeNameModal} style="font-size:13px;font-weight:600;color:var(--brand-700);cursor:pointer;border:1.5px solid var(--brand-700);padding:8px 14px;border-radius:var(--radius-full)">Editar nome</div>
            <div onClick=${v.onLogout} style="font-size:13px;font-weight:700;color:var(--red-600);cursor:pointer;border:1.5px solid var(--red-600);padding:8px 14px;border-radius:var(--radius-full)">Sair</div>
          </div>
        </div>

        <div style="margin-top:32px;font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--neutral-600);margin-bottom:10px">Cadastrar Receita por ID</div>
        <div style="background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-lg);padding:20px 22px">
          <div style="font-size:13px;color:var(--neutral-600);margin-bottom:12px">Informe o ID de compartilhamento (ex: YSH-XXXXXXXXXX) que alguém te enviou para adicionar a receita à sua biblioteca, em modo somente leitura.</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <input type="text" placeholder="YSH-XXXXXXXXXX" autocomplete="off" value=${v.redeemCode} onInput=${v.onRedeemCodeChange} style="flex:1;min-width:200px;background:var(--neutral-0);color:var(--neutral-900);padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:14px"/>
            <div onClick=${v.onRedeemSubmit} style="padding:12px 20px;border-radius:var(--radius-md);background:var(--brand-700);color:#F4F2F1;font-weight:700;font-size:14px;cursor:pointer;white-space:nowrap">${v.redeemBusy ? 'Verificando...' : 'Cadastrar'}</div>
          </div>
          ${v.hasRedeemMessage && html`<div style=${`margin-top:10px;font-size:13px;font-weight:600;color:${v.redeemMessageIsError ? 'var(--red-600)' : 'var(--green-600)'}`}>${v.redeemMessage}</div>`}
        </div>

        ${v.hasSharedLibraryRows && html`
          <div style="margin-top:24px">
            <div style="font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--neutral-600);margin-bottom:10px">Biblioteca Compartilhada Comigo</div>
            ${v.sharedLibraryRows.map((row) => html`
              <div key=${row.id} onClick=${row.onOpen} style=${`display:flex;align-items:center;justify-content:space-between;background:var(--neutral-0);border:1px solid ${row.justRedeemed ? 'var(--brand-500)' : 'var(--neutral-100)'};border-radius:var(--radius-md);padding:14px 16px;margin-bottom:8px;cursor:pointer${row.justRedeemed ? ';box-shadow:0 0 0 3px rgba(52,178,62,0.18)' : ''}`}>
                <div>
                  <div style="font-size:15px;font-weight:600">${row.name}${row.justRedeemed ? html` <span style="font-size:11px;font-weight:700;color:var(--brand-700)">Adicionada agora</span>` : ''}</div>
                  <div style="font-size:12px;color:var(--neutral-600)">${row.categoryName} · ${row.code} · somente leitura</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-400)" stroke-width="2"><path d="M9 6l6 6-6 6"></path></svg>
              </div>
            `)}
          </div>
        `}
      `}
    </div>
  `;
}

function renderDetail(app, v) {
  const r = v.selectedRecipe;
  return html`
    <div style="position:relative;height:340px;overflow:hidden">
      ${v.hasSelectedRecipe && html`<img loading="lazy" decoding="async" src=${r.imagem} alt=${r.nome} style="width:100%;height:100%;object-fit:cover;animation:ycZoomImg 0.7s cubic-bezier(0.22,0.8,0.24,1)"/>`}
      <div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(14,12,11,0.15) 0%, rgba(14,12,11,0.75) 100%)"></div>
      <div style=${`position:absolute;left:${v.detailTitleInset}px;right:${v.detailTitleInset}px;bottom:24px;color:#F4F2F1`}>
        <div style="font-size:30px;font-weight:700;letter-spacing:-0.02em;animation:ycTitleIn 0.55s cubic-bezier(0.22,0.8,0.24,1) 0.06s backwards">${r.nome}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
          <span style="background:rgba(244,242,241,0.18);border:1px solid rgba(244,242,241,0.4);padding:6px 14px;border-radius:var(--radius-full);font-size:13px;font-weight:600;animation:ycTitleIn 0.55s cubic-bezier(0.22,0.8,0.24,1) 0.12s backwards">${r.tempoLabel}</span>
          <span style="background:rgba(244,242,241,0.18);border:1px solid rgba(244,242,241,0.4);padding:6px 14px;border-radius:var(--radius-full);font-size:13px;font-weight:600;animation:ycTitleIn 0.55s cubic-bezier(0.22,0.8,0.24,1) 0.18s backwards">${r.porcoesLabel}</span>
          <span style="background:rgba(244,242,241,0.18);border:1px solid rgba(244,242,241,0.4);padding:6px 14px;border-radius:var(--radius-full);font-size:13px;font-weight:600;animation:ycTitleIn 0.55s cubic-bezier(0.22,0.8,0.24,1) 0.24s backwards">${r.dificuldade}</span>
        </div>
      </div>
    </div>

    <div style="padding:28px ${v.detailPadX}px 24px;background:var(--brand-700);color:#F4F2F1;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:13px;opacity:0.85">Valor a comprar</div>
        <div style="font-size:26px;font-weight:700">${v.totalABuyLabel}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:13px;opacity:0.85">Total dos ingredientes</div>
        <div style="font-size:16px;font-weight:600">${v.totalAllLabel}</div>
      </div>
    </div>

    <div style="padding:24px ${v.detailPadX}px 8px">
      <div style="font-size:20px;font-weight:700;margin-bottom:6px">Ingredientes</div>
      <div style="font-size:13px;color:var(--neutral-600);margin-bottom:16px">Marque o que você já tem em casa — o valor será descontado do total. Toque no item para ver alternativas.</div>
      ${v.ingredientRows.map((row) => html`
        <div key=${row.idx} style="display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--neutral-100)">
          <div onClick=${row.onToggleCheck} style=${row.checkboxStyle}>${row.checkMark}</div>
          <div onClick=${row.onOpenAlt} style="flex:1;cursor:pointer">
            <div style=${`font-size:15px;font-weight:600;${row.textDecoration}`}>${row.nome}</div>
            <div style="font-size:13px;color:var(--neutral-600);margin-top:2px">${row.qtdLabel}${row.isOverridden ? ' · alternativa selecionada' : ''}</div>
          </div>
          <div style=${`font-size:15px;font-weight:600;${row.textDecoration}`}>${row.subtotalLabel}</div>
        </div>
      `)}
    </div>

    ${v.hasExtras && html`
      <div style="padding:20px ${v.detailPadX}px 8px">
        <div style="font-size:16px;font-weight:700;margin-bottom:10px">Você também vai precisar de</div>
        ${v.extrasList.map((extra, i) => html`<div key=${i} style="font-size:14px;color:var(--neutral-800);padding:4px 0">· ${extra}</div>`)}
      </div>
    `}

    <div style="padding:24px ${v.detailPadX}px 8px">
      <div style="font-size:20px;font-weight:700;margin-bottom:14px">Modo de Preparo</div>
      ${v.modoPreparoList.map((step) => html`
        <div key=${step.numero} style="display:flex;gap:16px;margin-bottom:18px">
          <div style="width:30px;height:30px;border-radius:var(--radius-full);background:var(--brand-700);color:#F4F2F1;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${step.numero}</div>
          <div style="font-size:15px;line-height:1.55;color:var(--neutral-800);padding-top:3px">${step.texto}</div>
        </div>
      `)}
    </div>

    <div style="padding:16px ${v.detailPadX}px 40px">
      <div style="font-size:20px;font-weight:700;margin-bottom:14px">Dicas</div>
      ${v.dicasList.map((dica, i) => html`
        <div key=${i} style="display:flex;gap:12px;background:var(--neutral-50);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:10px">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2" style="flex-shrink:0;margin-top:2px"><path d="M9 18h6M10 22h4M12 2a6 6 0 00-3 11.2c.4.3.6.7.6 1.2V16h4.8v-1.6c0-.5.2-.9.6-1.2A6 6 0 0012 2z"></path></svg>
          <div style="font-size:14px;line-height:1.5;color:var(--neutral-800)">${dica}</div>
        </div>
      `)}
    </div>
  `;
}

function renderDetailButtons(app, v) {
  const r = v.selectedRecipe;
  return html`
    <div onClick=${r.onBack} style=${`position:absolute;top:24px;left:24px;width:44px;height:44px;border-radius:var(--radius-full);background:var(--tabbar-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--tabbar-border);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:var(--shadow-md);z-index:15;transition:transform 0.15s ease;border-color:${v.detailButtonBorderColor}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-900)" stroke-width="2.2"><path d="M15 18l-6-6 6-6"></path></svg>
    </div>
    <div onClick=${r.onToggleFavorite} style=${`position:absolute;top:24px;right:24px;width:44px;height:44px;border-radius:var(--radius-full);background:var(--tabbar-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--tabbar-border);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:var(--shadow-md);z-index:15;transition:transform 0.15s ease;border-color:${v.detailButtonBorderColor}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill=${r.heartFill} stroke="#D2562D" stroke-width="1.5"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.3 2 4.5 5.6 4c2-.3 3.9.6 5 2.2C11.7 4.6 13.6 3.7 15.6 4c3.6.5 5.2 4.3 3.6 7.7C19.5 16.4 12 21 12 21z"></path></svg>
    </div>
    ${r.canEdit && html`
      <div onClick=${r.onEdit} style=${`position:absolute;top:24px;right:80px;width:44px;height:44px;border-radius:var(--radius-full);background:var(--tabbar-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--tabbar-border);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:var(--shadow-md);z-index:15;transition:transform 0.15s ease;border-color:${v.detailButtonBorderColor}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-900)" stroke-width="2.2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>
      </div>
    `}
  `;
}

function navItems(v) {
  return [
    { onClick: v.goInicio, color: v.navInicioColor, label: 'Início', path: html`<path d="M4 11l8-7 8 7"></path><path d="M6 9.5V20h12V9.5"></path>` },
    { onClick: v.goHome, color: v.navHomeColor, label: 'Receitas', path: html`<path d="M12 2c1 3-1 4-1 6 0 1.5 1 2 2 2 1.5 0 2-1.5 1.5-3 2.5 1.5 4 4.5 4 7.5 0 4.4-3.6 8-8 8s-8-3.6-8-8c0-3 1.5-5.8 3.5-7.8-.3 1.3.2 2.3 1 2.8.3-3 1.7-5.8 5-7.5z"></path>` },
    { onClick: v.goProducts, color: v.navProductsColor, label: 'Produtos', path: html`<path d="M4 8l1.5-4h13L20 8"></path><path d="M4 8h16v12H4z"></path><path d="M9 12a3 3 0 006 0"></path>` },
    { onClick: v.goDados, color: v.navDadosColor, label: 'Dados', path: html`<path d="M5 20V10M12 20V4M19 20v-7"></path>` },
    { onClick: v.goProfile, color: v.navProfileColor, label: 'Perfil', path: html`<circle cx="12" cy="8" r="4"></circle><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6"></path>` },
  ];
}

function renderBottomTabBar(app, v) {
  return html`
    <div style=${`position:absolute;left:20px;right:20px;bottom:20px;height:60px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--tabbar-border);border-radius:var(--radius-full);display:flex;align-items:center;justify-content:space-around;box-shadow:var(--shadow-lg);z-index:10;transition:background 0.2s ease;border-color:${v.navBarBorderColor};background-color:${v.navBarBgColor}`}>
      ${navItems(v).map((it) => html`
        <div key=${it.label} onClick=${it.onClick} style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;width:80px;transition:transform 0.15s ease">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke=${it.color} stroke-width="2">${it.path}</svg>
          <div style=${`font-size:12px;font-weight:600;color:${it.color}`}>${it.label}</div>
        </div>
      `)}
    </div>
  `;
}

function renderSideNavRail(app, v) {
  return html`
    <div className="yc-scroll" style=${`position:absolute;${v.navRailSideStyle};top:0;bottom:0;width:${v.navRailWidth}px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);${v.navRailBorderStyle};background-color:${v.navBarBgColor};display:flex;flex-direction:column;align-items:center;justify-content:safe center;gap:32px;padding:24px 0;box-sizing:border-box;overflow-y:auto;overflow-x:hidden;z-index:10`}>
      ${navItems(v).map((it) => html`
        <div key=${it.label} onClick=${it.onClick} style="display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;transition:transform 0.15s ease">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke=${it.color} stroke-width="2">${it.path}</svg>
          <div style=${`font-size:12px;font-weight:600;color:${it.color}`}>${it.label}</div>
        </div>
      `)}
    </div>
  `;
}

function renderProfileSetupModal(app, v) {
  const f = v.profileForm;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:20;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div style="width:520px;max-width:100%;background:var(--neutral-0);border-radius:var(--radius-xl);padding:32px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        <div style="font-size:22px;font-weight:700;margin-bottom:6px">Bem-vindo ao Yourcipe</div>
        <div style="font-size:14px;color:var(--neutral-600);margin-bottom:24px">Conte um pouco sobre você para personalizar sua experiência.</div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <input type="number" placeholder="Idade" value=${f.idade} onInput=${v.onProfileIdadeChange} style="background:var(--neutral-0);color:var(--neutral-900);padding:14px 16px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-size:15px;font-family:var(--font-sans)"/>
          <${CustomSelect} options=${v.generoOptions} value=${f.genero} onChange=${v.onProfileGeneroSet} />
          <input type="text" placeholder="Cargo (ex: Dono de Açougue, Chef, Comprador)" value=${f.cargo} onInput=${v.onProfileCargoChange} style="background:var(--neutral-0);color:var(--neutral-900);padding:14px 16px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-size:15px;font-family:var(--font-sans)"/>
        </div>
        <div onClick=${v.onSaveProfile} style="margin-top:24px;background:var(--brand-700);color:#F4F2F1;text-align:center;padding:16px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer">Salvar</div>
      </div>
    </div>
  `;
}

const AUTH_INPUT_STYLE = "background:var(--neutral-0);color:var(--neutral-900);width:100%;padding:14px 16px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-size:15px;font-family:var(--font-sans);box-sizing:border-box";

function renderLoginModal(app, v) {
  const submitStyle = `flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;color:#F4F2F1;background:var(--brand-700);transition:transform 0.15s ease;${v.canSubmitLogin ? 'cursor:pointer' : 'cursor:not-allowed;opacity:0.5'}`;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:20;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div style="width:420px;max-width:100%;background:var(--neutral-0);border-radius:var(--radius-xl);padding:32px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        <div style="font-size:22px;font-weight:700;margin-bottom:6px">Entrar no Modo de Criação</div>
        <div style="font-size:14px;color:var(--neutral-600);margin-bottom:20px">Informe sua credencial e senha para continuar.</div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <input type="text" placeholder="Credencial (YCP-XXXX-XXXX)" autocomplete="off" value=${v.loginCredential} onInput=${v.onLoginCredentialChange} style=${AUTH_INPUT_STYLE}/>
          <input type="password" placeholder="Senha" autocomplete="current-password" value=${v.loginPassword} onInput=${v.onLoginPasswordChange} style=${AUTH_INPUT_STYLE}/>
          ${v.showLoginTurnstileLoading && html`<div style="font-size:12px;color:var(--neutral-600)">Carregando verificação de segurança...</div>`}
          <div id="login-turnstile-container" class="turnstile-container" aria-label="Verificação de segurança" ref=${v.turnstileLoginRef}></div>
          ${v.hasLoginError && html`<div style="font-size:13px;color:var(--red-600);font-weight:600">${v.loginError}</div>`}
        </div>
        <div style="display:flex;gap:10px;margin-top:22px">
          <div onClick=${v.onCloseLoginModal} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50);transition:transform 0.15s ease">Cancelar</div>
          <div onClick=${v.canSubmitLogin ? v.onLoginSubmit : null} style=${submitStyle}>${v.loginSubmitting ? 'Entrando...' : 'Entrar'}</div>
        </div>
        <div onClick=${v.onGoSignupFromLogin} style="text-align:center;margin-top:18px;font-size:13px;font-weight:600;color:var(--brand-700);cursor:pointer">Ainda não tem uma credencial? Criar agora</div>
      </div>
    </div>
  `;
}

function renderSignupModal(app, v) {
  const submitStyle = `flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;color:#F4F2F1;background:var(--brand-700);transition:transform 0.15s ease;${v.canSubmitSignup ? 'cursor:pointer' : 'cursor:not-allowed;opacity:0.5'}`;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:20;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div style="width:420px;max-width:100%;background:var(--neutral-0);border-radius:var(--radius-xl);padding:32px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        ${!v.signupResult ? html`
          <div style="font-size:22px;font-weight:700;margin-bottom:6px">Criar Credencial</div>
          <div style="font-size:14px;color:var(--neutral-600);margin-bottom:20px">Informe seu nome e defina uma senha. Sua credencial de acesso é gerada automaticamente.</div>
          <div style="display:flex;flex-direction:column;gap:14px">
            <input type="text" placeholder="Nome" autocomplete="name" value=${v.signupDisplayName} onInput=${v.onSignupDisplayNameChange} style=${AUTH_INPUT_STYLE}/>
            <div style="font-size:12px;color:var(--neutral-600);margin-top:-8px">Seu nome será exibido ao administrador quando você enviar solicitações — não usamos seu e-mail para isso.</div>
            <input type="password" placeholder="Senha" autocomplete="new-password" value=${v.signupPassword} onInput=${v.onSignupPasswordChange} style=${AUTH_INPUT_STYLE}/>
            <input type="password" placeholder="Confirmar senha" autocomplete="new-password" value=${v.signupConfirmPassword} onInput=${v.onSignupConfirmChange} style=${AUTH_INPUT_STYLE}/>
            ${v.showSignupTurnstileLoading && html`<div style="font-size:12px;color:var(--neutral-600)">Carregando verificação de segurança...</div>`}
            <div id="signup-turnstile-container" class="turnstile-container" aria-label="Verificação de segurança" ref=${v.turnstileSignupRef}></div>
            ${v.hasSignupError && html`<div style="font-size:13px;color:var(--red-600);font-weight:600">${v.signupError}</div>`}
          </div>
          <div style="display:flex;gap:10px;margin-top:22px">
            <div onClick=${v.onCloseSignupModal} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50);transition:transform 0.15s ease">Cancelar</div>
            <div onClick=${v.canSubmitSignup ? v.onSignupSubmit : null} style=${submitStyle}>${v.signupSubmitting ? 'Criando...' : 'Criar Credencial'}</div>
          </div>
          <div onClick=${v.onBackToLoginFromSignup} style="text-align:center;margin-top:18px;font-size:13px;font-weight:600;color:var(--brand-700);cursor:pointer">Já tenho uma credencial</div>
        ` : html`
          <div style="font-size:22px;font-weight:700;margin-bottom:6px">Credencial Criada</div>
          <div style="font-size:14px;color:var(--neutral-600);margin-bottom:20px">Esta é a sua credencial de acesso.</div>
          <div className="yc-code-box" style="font-size:24px;font-weight:700;color:var(--brand-700);margin-bottom:14px">${v.signupResult.credential}</div>
          <div onClick=${v.onCopyCredential} style="text-align:center;font-size:14px;font-weight:600;color:var(--brand-700);cursor:pointer;border:1.5px solid var(--brand-700);padding:12px;border-radius:var(--radius-full);margin-bottom:18px;transition:transform 0.15s ease">${v.credentialCopied ? 'Copiado!' : 'Copiar credencial'}</div>
          <div style="background:rgba(207,176,23,0.14);border:1px solid var(--yellow-500);color:var(--yellow-600);border-radius:var(--radius-md);padding:14px 16px;font-size:13px;font-weight:600;line-height:1.5;margin-bottom:20px">Guarde sua credencial e sua senha. Sem elas, não será possível recuperar o acesso.</div>
          <div onClick=${v.onFinishSignup} style="text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer;color:#F4F2F1;background:var(--brand-700);transition:transform 0.15s ease">Concluir</div>
        `}
      </div>
    </div>
  `;
}

// Legacy accounts created before display_name existed (see
// supabase/002_profiles_display_name_phase1.sql) are routed here right
// after their session resolves — no Cancelar/close action on purpose: the
// account must complete its profile before continuing to use the app.
function renderCompleteProfileModal(app, v) {
  const submitStyle = `text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;color:#F4F2F1;background:var(--brand-700);transition:transform 0.15s ease;${v.canSubmitCompleteProfile ? 'cursor:pointer' : 'cursor:not-allowed;opacity:0.5'}`;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:25;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div style="width:420px;max-width:100%;background:var(--neutral-0);border-radius:var(--radius-xl);padding:32px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        <div style="font-size:22px;font-weight:700;margin-bottom:6px">Complete seu perfil</div>
        <div style="font-size:14px;color:var(--neutral-600);margin-bottom:20px">Sua conta ainda não tem um nome cadastrado. Informe seu nome para continuar — ele será exibido ao administrador quando você enviar solicitações.</div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <input type="text" placeholder="Nome" autocomplete="name" value=${v.completeProfileName} onInput=${v.onCompleteProfileNameChange} style=${AUTH_INPUT_STYLE}/>
          ${v.hasCompleteProfileError && html`<div style="font-size:13px;color:var(--red-600);font-weight:600">${v.completeProfileError}</div>`}
        </div>
        <div onClick=${v.canSubmitCompleteProfile ? v.onCompleteProfileSubmit : null} style=${`margin-top:22px;${submitStyle}`}>${v.completeProfileSubmitting ? 'Salvando...' : 'Salvar e continuar'}</div>
      </div>
    </div>
  `;
}

// Self-service rename (point 6 of the plan) — same validation as signup,
// enforced again server-side by trg_validate_display_name_on_update.
function renderChangeNameModal(app, v) {
  const submitStyle = `flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;color:#F4F2F1;background:var(--brand-700);transition:transform 0.15s ease;${v.canSubmitChangeName ? 'cursor:pointer' : 'cursor:not-allowed;opacity:0.5'}`;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:25;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div style="width:420px;max-width:100%;background:var(--neutral-0);border-radius:var(--radius-xl);padding:32px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        <div style="font-size:22px;font-weight:700;margin-bottom:6px">Alterar nome</div>
        <div style="font-size:14px;color:var(--neutral-600);margin-bottom:20px">Este nome é usado para identificação — inclusive nas solicitações que você enviar ao administrador.</div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <input type="text" placeholder="Nome" autocomplete="name" value=${v.changeNameValue} onInput=${v.onChangeNameValueChange} style=${AUTH_INPUT_STYLE}/>
          ${v.hasChangeNameError && html`<div style="font-size:13px;color:var(--red-600);font-weight:600">${v.changeNameError}</div>`}
        </div>
        <div style="display:flex;gap:10px;margin-top:22px">
          <div onClick=${v.onCloseChangeNameModal} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50);transition:transform 0.15s ease">Cancelar</div>
          <div onClick=${v.canSubmitChangeName ? v.onChangeNameSubmit : null} style=${submitStyle}>${v.changeNameSubmitting ? 'Salvando...' : 'Salvar'}</div>
        </div>
      </div>
    </div>
  `;
}

function renderSalesModal(app, v) {
  const f = v.saleForm;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:20;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div style="width:420px;max-width:100%;background:var(--neutral-0);border-radius:var(--radius-xl);padding:32px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        <div style="font-size:20px;font-weight:700;margin-bottom:6px">${v.saleModalTitle}</div>
        <div style="font-size:14px;color:var(--neutral-600);margin-bottom:20px">Informe os dados da venda realizada.</div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--neutral-600);margin-bottom:6px">Valor da Venda (R$)</div>
            <input type="text" placeholder="0,00" value=${f.valor} onInput=${v.onSaleValorChange} style="background:var(--neutral-0);color:var(--neutral-900);width:100%;padding:14px 16px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-size:15px;font-family:var(--font-sans);box-sizing:border-box"/>
          </div>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--neutral-600);margin-bottom:6px">IPC (Itens Vendidos)</div>
            <input type="number" placeholder="0" value=${f.ipc} onInput=${v.onSaleIpcChange} style="background:var(--neutral-0);color:var(--neutral-900);width:100%;padding:14px 16px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-size:15px;font-family:var(--font-sans);box-sizing:border-box"/>
          </div>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--neutral-600);margin-bottom:6px">Dia da Venda</div>
            <input type="date" value=${f.data} onInput=${v.onSaleDataChange} style="background:var(--neutral-0);color:var(--neutral-900);width:100%;padding:14px 16px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-size:15px;font-family:var(--font-sans);box-sizing:border-box"/>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:24px">
          <div onClick=${v.onCloseSalesModal} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50);transition:transform 0.15s ease">Cancelar</div>
          <div onClick=${v.onSaveSale} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer;color:#F4F2F1;background:var(--brand-700);transition:transform 0.15s ease">${v.saleModalSaveLabel}</div>
        </div>
      </div>
    </div>
  `;
}

function renderAltModal(app, v) {
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:flex-end;justify-content:center;z-index:20;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div style="width:100%;max-width:600px;max-height:70%;overflow-y:auto;background:var(--neutral-0);border-radius:var(--radius-xl);padding:28px 32px 32px;box-shadow:var(--shadow-lg);animation:ycSlideUp 0.25s ease">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:20px;font-weight:700">Alternativas para ${v.altModalIngredientNome}</div>
          <div onClick=${v.onCloseAltModal} style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform 0.15s ease,background 0.15s ease">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-900)" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"></path></svg>
          </div>
        </div>
        <div style="font-size:13px;color:var(--neutral-600);margin-bottom:16px">Opções equivalentes disponíveis</div>
        ${v.altOptions.map((opt) => html`
          <div key=${opt.id} style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--neutral-100)">
            <div>
              <div style="font-size:15px;font-weight:600">${opt.nome}</div>
              <div style="font-size:13px;color:var(--neutral-600)">${opt.precoLabel}</div>
            </div>
            <div onClick=${opt.onChoose} style="font-size:14px;font-weight:700;color:var(--brand-700);border:1.5px solid var(--brand-700);padding:9px 16px;border-radius:var(--radius-full);cursor:pointer;transition:transform 0.15s ease">Usar esta</div>
          </div>
        `)}
        ${v.altOptionsEmpty && html`<div style="padding:20px 0;color:var(--neutral-600);font-size:14px">Nenhuma alternativa cadastrada nesta categoria.</div>`}
      </div>
    </div>
  `;
}

function renderConfirmDeleteModal(app, v) {
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:25;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div ref=${app.modalFocusRef('confirmDelete')} role="dialog" aria-modal="true" aria-label="Confirmar exclusão" tabindex="-1" style="width:420px;max-width:100%;background:var(--neutral-0);border-radius:var(--radius-xl);padding:28px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease;outline:none">
        <div style="font-size:18px;font-weight:700;margin-bottom:8px">Confirmar exclusão</div>
        <div style="font-size:14px;color:var(--neutral-600);margin-bottom:20px">${v.confirmDeleteMessage}</div>
        <div style="display:flex;gap:10px">
          <div onClick=${v.onConfirmDeleteNo} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50);transition:transform 0.15s ease">Cancelar</div>
          <div onClick=${v.onConfirmDeleteYes} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer;color:#F4F2F1;background:var(--red-600);transition:transform 0.15s ease">Excluir</div>
        </div>
      </div>
    </div>
  `;
}

function renderReferencesModal(app, v) {
  const m = v.referencesModal;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:26;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div ref=${app.modalFocusRef('referencesModal')} role="dialog" aria-modal="true" aria-label="Referências a resolver" tabindex="-1" className="yc-scroll" style="width:520px;max-width:100%;max-height:90%;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;background:var(--neutral-0);border-radius:var(--radius-xl);padding:28px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease;outline:none">
        <div style="font-size:18px;font-weight:700;margin-bottom:4px">Referências a resolver</div>
        <div style="font-size:14px;color:var(--neutral-600);margin-bottom:6px">A receita <strong>${m ? m.recipeName : ''}</strong> (código ${m ? m.recipeCode : ''})${(m && m.rows.length > 0) ? ' tem vínculos ativos. Resolva cada um antes de excluir.' : '.'}</div>
        ${m && m.showActionChoice && html`
          <div style="border:1px solid var(--neutral-100);border-radius:var(--radius-md);padding:14px;margin-bottom:14px">
            <div style="font-size:13px;font-weight:700;margin-bottom:8px">O que fazer com esta receita?</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
              <div onClick=${() => m.onSetRecipeAction('archive')} style=${REF_ACTION_BTN(m.recipeAction === 'archive')}>Arquivar (mantém histórico)</div>
              <div onClick=${() => m.onSetRecipeAction('delete')} style=${REF_ACTION_BTN(m.recipeAction === 'delete')}>Excluir permanentemente</div>
            </div>
            <div style="font-size:12px;color:var(--neutral-600)">${m.recipeAction === 'archive'
              ? 'Arquivar mantém o registro, preserva histórico/relações e oculta a receita do catálogo público — reversível.'
              : (m.recommendArchive
                ? 'Esta receita já foi publicada e/ou compartilhada. Excluir agora é permanente e não pode ser desfeito.'
                : 'Remove a receita definitivamente. Não pode ser desfeito.')}</div>
          </div>
        `}
        ${(m ? m.rows : []).map(row => html`
          <div key=${row.key} style="border:1px solid var(--neutral-100);border-radius:var(--radius-md);padding:14px;margin-bottom:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px">
              <div style="font-size:14px;font-weight:700">${row.type}</div>
              <span style="background:var(--neutral-50);color:var(--neutral-800);border-radius:var(--radius-full);padding:3px 10px;font-size:12px;font-weight:700">${row.quantity}</span>
            </div>
            <div style="font-size:13px;color:var(--neutral-600);margin-bottom:8px">${row.consequence}</div>
            <div style="font-size:12px;color:var(--neutral-800);font-weight:600;margin-bottom:${row.onToggleResolve ? '8px' : '0'}">Ação necessária: ${row.action}</div>
            ${row.onToggleResolve && html`
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;color:var(--neutral-900)">
                <input type="checkbox" checked=${row.resolved} onChange=${row.onToggleResolve}/> Resolver esta referência antes de excluir
              </label>
            `}
          </div>
        `)}
        <div style="font-size:12px;color:var(--neutral-600);margin:4px 0 18px">Favoritos locais deste dispositivo (se houver) são removidos automaticamente. Cópias próprias feitas por outras pessoas a partir desta receita, se existirem, não têm vínculo rastreável no sistema e continuam existindo de forma independente.</div>
        <div style="display:flex;gap:10px">
          <div onClick=${m ? m.onCancel : null} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50);transition:transform 0.15s ease">Voltar sem excluir</div>
          <div onClick=${(m && m.canConfirm && !m.busy) ? m.onConfirm : null} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:${(m && m.canConfirm && !m.busy) ? 'pointer' : 'not-allowed'};color:#F4F2F1;background:${(m && m.canConfirm && !m.busy) ? 'var(--red-600)' : 'var(--neutral-200)'};transition:transform 0.15s ease">${m && m.busy ? (m.recipeAction === 'archive' ? 'Arquivando...' : 'Excluindo...') : (m && m.showActionChoice && m.recipeAction === 'archive' ? 'Resolver e arquivar' : 'Resolver e excluir permanentemente')}</div>
        </div>
      </div>
    </div>
  `;
}

const REF_SELECT_STYLE = "background:var(--neutral-0);color:var(--neutral-900);padding:8px 10px;border-radius:var(--radius-sm);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:13px;min-width:0;flex:1;box-sizing:border-box";
const REF_ACTION_BTN = (active) => `padding:8px 12px;border-radius:var(--radius-full);font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;border:1.5px solid ${active ? 'var(--brand-700)' : 'var(--neutral-200)'};color:${active ? '#F4F2F1' : 'var(--neutral-800)'};background:${active ? 'var(--brand-700)' : 'var(--neutral-0)'}`;

// "Referências a resolver" for a product (supabase/010_hard_delete_and_
// reference_resolution.sql) — one row per live recipe_ingredients row,
// each requiring an explicit "Substituir"/"Remover" choice before the
// confirm button enables (m.canConfirm, computed in app.js).
function renderProductReferencesModal(app, v) {
  const m = v.productReferencesModal;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:26;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div ref=${app.modalFocusRef('referencesModal')} role="dialog" aria-modal="true" aria-label="Referências a resolver" tabindex="-1" className="yc-scroll" style="width:560px;max-width:100%;max-height:90%;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;background:var(--neutral-0);border-radius:var(--radius-xl);padding:28px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease;outline:none">
        <div style="font-size:18px;font-weight:700;margin-bottom:4px">Referências a resolver</div>
        <div style="font-size:14px;color:var(--neutral-600);margin-bottom:14px">O produto <strong>${m ? m.name : ''}</strong> (código ${m ? m.code : ''}) é usado em ${m ? m.rows.length : 0} receita(s). Escolha o que fazer em cada uma antes de excluir.</div>
        ${(m ? m.rows : []).map(row => html`
          <div key=${row.key} style="border:1px solid var(--neutral-100);border-radius:var(--radius-md);padding:14px;margin-bottom:10px">
            <div style="font-size:14px;font-weight:700;margin-bottom:2px">${row.recipeName}</div>
            <div style="font-size:12px;color:var(--neutral-600);margin-bottom:10px">Quantidade usada: ${row.quantity}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:${row.action === 'replace' ? '8px' : '0'}">
              <div onClick=${() => row.onSetAction('replace')} style=${REF_ACTION_BTN(row.action === 'replace')}>Substituir por outro produto</div>
              <div onClick=${() => row.onSetAction('remove')} style=${REF_ACTION_BTN(row.action === 'remove')}>Remover ingrediente da receita</div>
            </div>
            ${row.action === 'replace' && html`
              <select value=${row.replacementProductId} onChange=${(e) => row.onSetReplacement(e.target.value)} style=${REF_SELECT_STYLE}>
                <option value="">Selecione o produto substituto…</option>
                ${row.replacementOptions.map(o => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}
              </select>
            `}
          </div>
        `)}
        ${m && m.pendingRequestCount > 0 && html`
          <div style="background:rgba(207,176,23,0.12);border:1px solid var(--yellow-500);color:var(--yellow-600);border-radius:var(--radius-md);padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:14px">${m.pendingRequestCount} solicitação(ões) pendente(s) (${m.pendingRequestCodes.join(', ')}) referenciam este produto e permanecerão com seu histórico preservado.</div>
        `}
        ${m && m.foreignNote && html`<div style="background:rgba(195,61,34,0.08);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:14px">${m.foreignNote}</div>`}
        <div style="display:flex;gap:10px;margin-top:8px">
          <div onClick=${m ? m.onCancel : null} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50);transition:transform 0.15s ease">Voltar sem excluir</div>
          <div onClick=${(m && m.canConfirm && !m.busy) ? m.onConfirm : null} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:${(m && m.canConfirm && !m.busy) ? 'pointer' : 'not-allowed'};color:#F4F2F1;background:${(m && m.canConfirm && !m.busy) ? 'var(--red-600)' : 'var(--neutral-200)'};transition:transform 0.15s ease">${m && m.busy ? 'Excluindo...' : 'Resolver e excluir permanentemente'}</div>
        </div>
      </div>
    </div>
  `;
}

// "Referências a resolver" for a category — products.category_id/
// recipes.category_id are NOT NULL (require a replacement of the same
// type); recipe_categories rows (section tags) may instead be removed.
function renderCategoryReferencesModal(app, v) {
  const m = v.categoryReferencesModal;
  const replaceRow = (row, key) => html`
    <div key=${key} style="border:1px solid var(--neutral-100);border-radius:var(--radius-md);padding:14px;margin-bottom:10px">
      <div style="font-size:14px;font-weight:700;margin-bottom:8px">${row.label}</div>
      <select value=${row.replacementCategoryId} onChange=${(e) => row.onSetReplacement(e.target.value)} style=${REF_SELECT_STYLE}>
        <option value="">Selecione a categoria substituta…</option>
        ${row.options.map(o => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}
      </select>
    </div>
  `;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:26;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div ref=${app.modalFocusRef('referencesModal')} role="dialog" aria-modal="true" aria-label="Referências a resolver" tabindex="-1" className="yc-scroll" style="width:560px;max-width:100%;max-height:90%;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;background:var(--neutral-0);border-radius:var(--radius-xl);padding:28px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease;outline:none">
        <div style="font-size:18px;font-weight:700;margin-bottom:4px">Referências a resolver</div>
        <div style="font-size:14px;color:var(--neutral-600);margin-bottom:14px">A categoria <strong>${m ? m.name : ''}</strong> (código ${m ? m.code : ''}) está em uso. Toda referência obrigatória precisa de uma categoria substituta; seções podem ser apenas removidas.</div>
        ${m && m.productRows.length > 0 && html`<div style="font-size:13px;font-weight:700;margin-bottom:6px">Produtos (obrigatório substituir)</div>`}
        ${(m ? m.productRows : []).map(row => replaceRow(row, 'p-' + row.key))}
        ${m && m.recipeRows.length > 0 && html`<div style="font-size:13px;font-weight:700;margin-bottom:6px">Receitas (obrigatório substituir)</div>`}
        ${(m ? m.recipeRows : []).map(row => replaceRow(row, 'r-' + row.key))}
        ${m && m.sectionRows.length > 0 && html`<div style="font-size:13px;font-weight:700;margin-bottom:6px">Seções em receitas (substituir ou remover)</div>`}
        ${(m ? m.sectionRows : []).map(row => html`
          <div key=${'s-' + row.key} style="border:1px solid var(--neutral-100);border-radius:var(--radius-md);padding:14px;margin-bottom:10px">
            <div style="font-size:14px;font-weight:700;margin-bottom:8px">${row.label}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:${row.action === 'replace' ? '8px' : '0'}">
              <div onClick=${() => row.onSetAction('replace')} style=${REF_ACTION_BTN(row.action === 'replace')}>Substituir seção</div>
              <div onClick=${() => row.onSetAction('remove')} style=${REF_ACTION_BTN(row.action === 'remove')}>Remover seção da receita</div>
            </div>
            ${row.action === 'replace' && html`
              <select value=${row.replacementCategoryId} onChange=${(e) => row.onSetReplacement(e.target.value)} style=${REF_SELECT_STYLE}>
                <option value="">Selecione a categoria substituta…</option>
                ${row.options.map(o => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}
              </select>
            `}
          </div>
        `)}
        ${m && m.productSectionRows.length > 0 && html`<div style="font-size:13px;font-weight:700;margin-bottom:6px">Seções em produtos (substituir ou remover)</div>`}
        ${(m ? m.productSectionRows : []).map(row => html`
          <div key=${'ps-' + row.key} style="border:1px solid var(--neutral-100);border-radius:var(--radius-md);padding:14px;margin-bottom:10px">
            <div style="font-size:14px;font-weight:700;margin-bottom:8px">${row.label}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:${row.action === 'replace' ? '8px' : '0'}">
              <div onClick=${() => row.onSetAction('replace')} style=${REF_ACTION_BTN(row.action === 'replace')}>Substituir seção</div>
              <div onClick=${() => row.onSetAction('remove')} style=${REF_ACTION_BTN(row.action === 'remove')}>Remover seção do produto</div>
            </div>
            ${row.action === 'replace' && html`
              <select value=${row.replacementCategoryId} onChange=${(e) => row.onSetReplacement(e.target.value)} style=${REF_SELECT_STYLE}>
                <option value="">Selecione a categoria substituta…</option>
                ${row.options.map(o => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}
              </select>
            `}
          </div>
        `)}
        ${m && m.pendingRequestCount > 0 && html`
          <div style="background:rgba(207,176,23,0.12);border:1px solid var(--yellow-500);color:var(--yellow-600);border-radius:var(--radius-md);padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:14px">${m.pendingRequestCount} solicitação(ões) pendente(s) (${m.pendingRequestCodes.join(', ')}) referenciam esta categoria e permanecerão com seu histórico preservado.</div>
        `}
        ${m && m.foreignNote && html`<div style="background:rgba(195,61,34,0.08);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:14px">${m.foreignNote}</div>`}
        <div style="display:flex;gap:10px;margin-top:8px">
          <div onClick=${m ? m.onCancel : null} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50);transition:transform 0.15s ease">Voltar sem excluir</div>
          <div onClick=${(m && m.canConfirm && !m.busy) ? m.onConfirm : null} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:${(m && m.canConfirm && !m.busy) ? 'pointer' : 'not-allowed'};color:#F4F2F1;background:${(m && m.canConfirm && !m.busy) ? 'var(--red-600)' : 'var(--neutral-200)'};transition:transform 0.15s ease">${m && m.busy ? 'Excluindo...' : 'Resolver e excluir permanentemente'}</div>
        </div>
      </div>
    </div>
  `;
}

function renderSplash(app, v) {
  return html`
    <div style="position:absolute;inset:0;background:var(--brand-700);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:48px;z-index:40;animation:ycFadeIn 0.3s ease">
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#F4F2F1" stroke-width="1.6" style="margin-bottom:20px">
        <path d="M6 2v8a3 3 0 003 3v9M9 2v8M6 2v6M12 2v9a3 3 0 003 3M18 2c-2 2-2 5-2 8s2 4 2 4v6"></path>
      </svg>
      <div style="font-size:36px;font-weight:700;letter-spacing:-0.02em;color:#F4F2F1;margin-bottom:12px;animation:ycPopIn 0.4s ease">Bem-vindo ao Yourcipe</div>
      <div style="font-size:16px;color:rgba(244,242,241,0.88);max-width:440px;line-height:1.5;margin-bottom:36px">Receitas práticas, ingredientes certos e o valor de compra na ponta do lápis — tudo pensado para facilitar o seu dia a dia na cozinha.</div>
      <div onClick=${v.onSplashContinue} style="background:var(--neutral-0);color:var(--brand-700);font-weight:700;font-size:16px;padding:16px 40px;border-radius:var(--radius-full);cursor:pointer;box-shadow:var(--shadow-lg);transition:transform 0.15s ease">${v.splashButtonLabel}</div>
    </div>
  `;
}

function selectionBar(count, onDelete, onCancel, extraAction) {
  return html`
    <div style="position:fixed;left:40px;right:40px;top:14px;z-index:35;display:flex;align-items:center;justify-content:space-between;background:var(--brand-700);color:#F4F2F1;border-radius:var(--radius-md);padding:14px 16px;box-shadow:var(--shadow-md);animation:ycFadeIn 0.2s ease">
      <div style="font-size:14px;font-weight:600">${count}</div>
      <div style="display:flex;gap:10px">
        ${extraAction}
        <div onClick=${onDelete} style="font-size:13px;font-weight:700;cursor:pointer;padding:8px 14px;border-radius:var(--radius-full);background:rgba(244,242,241,0.18)">Excluir</div>
        <div onClick=${onCancel} style="font-size:13px;font-weight:700;cursor:pointer;padding:8px 14px;border-radius:var(--radius-full);background:rgba(244,242,241,0.18)">Cancelar</div>
      </div>
    </div>
  `;
}


function toggleRow(row) {
  return html`
    <div key=${row.key} draggable=${row.draggable} onDragStart=${row.onDragStart} onDragOver=${row.onDragOver} onDrop=${row.onDrop} onMouseDown=${row.onPressStart} onMouseUp=${row.onPressEnd} onMouseLeave=${row.onPressEnd} onTouchStart=${row.onPressStart} onTouchEnd=${row.onPressEnd} onClick=${row.onRowClick} style=${row.rowStyle}>
      ${row.showCheckbox && html`<div style=${row.checkboxStyle}>${row.checkMark}</div>`}
      <div style="font-size:14px;font-weight:600;flex:1">${row.label}</div>
      ${row.showControls && html`
        <div style="display:flex;align-items:center;gap:12px">
          <div onClick=${row.onToggle} style=${row.trackStyle}><div style=${row.thumbStyle}></div></div>
          <div onClick=${row.onRemove} style="width:28px;height:28px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C33D22" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"></path></svg>
          </div>
        </div>
      `}
    </div>
  `;
}

// Icon picker (#4) — a row of clickable swatches shown right above a "Nova
// seção" add-input, creation-time only (no edit-existing-section icon UI).
function iconChoiceRow(selectedKey, onPick) {
  return html`
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      ${ICON_CHOICES.map((c) => html`
        <div key=${c.key} onClick=${() => onPick(c.key)} title=${c.key} style=${`width:34px;height:34px;border-radius:var(--radius-full);display:flex;align-items:center;justify-content:center;cursor:pointer;background:${selectedKey === c.key ? 'var(--brand-700)' : 'var(--neutral-50)'};border:1.5px solid ${selectedKey === c.key ? 'var(--brand-700)' : 'var(--neutral-100)'};transition:background 0.15s ease,border-color 0.15s ease`}>${c.svg}</div>
      `)}
    </div>
  `;
}

// Shared search bar (#2) rendered near the top of every "Modo de Criação"
// admin tab, right after its "+ Novo X" button. One shared v.adminSearchQuery
// works across all 9 tabs since only one tab is ever visible at a time and
// the query is reset on every tab switch (see onSetAdminTabX in app.js).
// Visual style mirrors renderSearch's canonical search input (magnifying
// glass icon + pill input).
function adminSearchBar(v) {
  return html`
    <div style="position:relative;margin-bottom:16px">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-400)" stroke-width="2" style="position:absolute;left:14px;top:50%;transform:translateY(-50%)"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>
      <input type="text" value=${v.adminSearchQuery} onInput=${v.onAdminSearchChange} placeholder="Buscar..." style="color:var(--neutral-900);width:100%;padding:12px 14px 12px 40px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);background:var(--neutral-0);font-family:var(--font-sans);font-size:14px;outline:none;box-sizing:border-box"/>
    </div>
  `;
}

// Local-device-only personalization (Home sections shown, which product
// categories are offered when cadastro/import). NOT the public catalog —
// that is now the Supabase-backed "Catálogo Público" admin tabs below,
// which is also where "Receita do Dia" moved to (recipes.featured, set via
// the site recipe form) once it became a real, syncing column instead of a
// local-only tag. Kept here, clearly labeled, so nothing already working
// is silently dropped (see PR description for why this split exists).
function renderLocalHomeCustomization(app, v) {
  return html`
    <div style="margin-top:24px;border-top:1px solid var(--neutral-100);padding-top:20px">
      <div style="background:rgba(207,176,23,0.12);border:1px solid var(--yellow-500);color:var(--yellow-700);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;margin-bottom:18px">Personalização local — válida apenas neste dispositivo, não é sincronizada com o Supabase.</div>
      <div style="font-size:15px;font-weight:700;margin-top:6px;margin-bottom:4px">Seções de Receitas</div>
      <div style="font-size:13px;color:var(--neutral-600);margin-bottom:14px">Escolha, adicione ou remova as seções que aparecem na Home/Receitas. Arraste para reordenar. Segure uma seção para selecionar várias e excluir de uma vez.</div>
      ${v.sectionSelectionMode && selectionBar(v.selectedSectionCountLabel, v.onBulkDeleteSectionsAsk, v.onCancelSectionSelection)}
      ${v.homeSectionOrderBusy && html`<div style="font-size:12px;color:var(--neutral-600);margin-bottom:8px">Sincronizando ordem das seções...</div>`}
      ${v.sectionToggleRows.map(toggleRow)}
      ${iconChoiceRow(v.newSectionIcon, v.onPickSectionIcon)}
      <div style="display:flex;gap:10px;margin-top:6px">
        <input type="text" placeholder="Nova seção (ex: Sopas de Inverno)" value=${v.newSectionLabel} onInput=${v.onNewSectionLabelChange} style="flex:1;padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);background:var(--neutral-0);color:var(--neutral-900);font-family:var(--font-sans);font-size:14px"/>
        <div onClick=${v.onAddSection} style="padding:12px 18px;border-radius:var(--radius-md);background:var(--brand-700);color:#F4F2F1;font-weight:700;font-size:14px;cursor:pointer;white-space:nowrap">+ Adicionar</div>
      </div>

      <div style="font-size:15px;font-weight:700;margin-top:26px;margin-bottom:4px">Seções de Produtos</div>
      <div style="font-size:13px;color:var(--neutral-600);margin-bottom:14px">Escolha, adicione ou remova as seções que aparecem na página Produtos/Início. Arraste para reordenar. Segure uma seção para selecionar várias e excluir de uma vez.</div>
      ${v.productSectionSelectionMode && selectionBar(v.selectedProductSectionCountLabel, v.onBulkDeleteProductSectionsAsk, v.onCancelProductSectionSelection)}
      ${v.productSectionToggleRows.map(toggleRow)}
      ${iconChoiceRow(v.newProductSectionIcon, v.onPickProductSectionIcon)}
      <div style="display:flex;gap:10px;margin-top:6px">
        <input type="text" placeholder="Nova seção (ex: Promoções)" value=${v.newProductSectionLabel} onInput=${v.onNewProductSectionLabelChange} style="flex:1;padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);background:var(--neutral-0);color:var(--neutral-900);font-family:var(--font-sans);font-size:14px"/>
        <div onClick=${v.onAddProductSection} style="padding:12px 18px;border-radius:var(--radius-md);background:var(--brand-700);color:#F4F2F1;font-weight:700;font-size:14px;cursor:pointer;white-space:nowrap">+ Adicionar</div>
      </div>

      <div style="font-size:15px;font-weight:700;margin-top:26px;margin-bottom:4px">Proteínas / Categorias de Produtos</div>
      <div style="font-size:13px;color:var(--neutral-600);margin-bottom:14px">Escolha quais categorias ficam disponíveis para cadastro e importação de produtos. Segure uma categoria para selecionar várias e excluir de uma vez.</div>
      ${v.proteinSelectionMode && selectionBar(v.selectedProteinCountLabel, v.onBulkDeleteProteinsAsk, v.onCancelProteinSelection)}
      ${v.proteinToggleRows.map(toggleRow)}
      <div style="display:flex;gap:10px;margin-top:6px">
        <input type="text" placeholder="Nova categoria (ex: Caprinos)" value=${v.newProteinLabel} onInput=${v.onNewProteinLabelChange} style="flex:1;padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);background:var(--neutral-0);color:var(--neutral-900);font-family:var(--font-sans);font-size:14px"/>
        <div onClick=${v.onAddProtein} style="padding:12px 18px;border-radius:var(--radius-md);background:var(--brand-700);color:#F4F2F1;font-weight:700;font-size:14px;cursor:pointer;white-space:nowrap">+ Adicionar</div>
      </div>
    </div>
  `;
}

// ==== Catálogo Público (admin-only, Supabase scope='site' — bug #1 fix) ====
function renderSiteRecipesTab(app, v) {
  return html`
    <div style="padding:8px 40px 24px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px">
        <div onClick=${v.onNewSiteRecipe} style="display:flex;align-items:center;justify-content:center;gap:8px;background:var(--brand-700);color:#F4F2F1;border-radius:var(--radius-md);padding:14px;font-weight:600;font-size:15px;cursor:pointer;transition:transform 0.15s ease">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F4F2F1" stroke-width="2.4"><path d="M12 5v14M5 12h14"></path></svg>
          Nova Receita no Catálogo
        </div>
        <div onClick=${v.onOpenImportModal} style="display:flex;align-items:center;justify-content:center;gap:8px;background:var(--neutral-50);color:var(--brand-700);border:1.5px solid var(--brand-500);border-radius:var(--radius-md);padding:14px;font-weight:700;font-size:15px;cursor:pointer;transition:transform 0.15s ease">
          Importar Planilha
        </div>
      </div>
      ${adminSearchBar(v)}
      ${v.siteCatalogLoading && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Carregando...</div>`}
      ${v.selectionMode && v.recipeSelectionScope === 'site' && selectionBar(v.selectedCountLabel, v.onBulkDeleteAsk, v.onCancelSelection)}
      ${!v.siteCatalogLoading && !v.hasSiteRecipeRows && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Nenhuma receita no catálogo público ainda.</div>`}
      ${v.siteRecipeRows.map((row) => html`
        <div key=${row.id} style=${row.rowStyle || "display:flex;align-items:center;gap:14px;background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:10px"} onMouseDown=${row.onPressStart} onMouseUp=${row.onPressEnd} onMouseLeave=${row.onPressEnd} onTouchStart=${row.onPressStart} onTouchEnd=${row.onPressEnd} onClick=${row.onRowClick}>
          ${row.showCheckbox && html`<div style=${row.checkboxStyle}>${row.checkMark}</div>`}
          <div style="flex:1">
            <div style="font-size:15px;font-weight:600">${row.name} <span style=${row.sourceBadgeStyle}>${row.sourceLabel}</span> <span style=${row.statusBadgeStyle}>${row.statusLabel}</span>${row.featured ? html` <span style="font-size:11px;font-weight:700;color:var(--brand-700)">★ Receita do Dia</span>` : ''}</div>
            <div style="font-size:12px;color:var(--neutral-600)">${row.categoryName} · ${row.code}${row.updatedAtLabel ? ` · atualizado em ${row.updatedAtLabel}` : ''}</div>
          </div>
          <div onClick=${row.onToggleStatus} style="font-size:12px;font-weight:700;color:var(--brand-700);cursor:pointer;border:1.5px solid var(--brand-500);padding:8px 12px;border-radius:var(--radius-full);white-space:nowrap">${row.toggleStatusLabel}</div>
          <div onClick=${row.onEdit} style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-900)" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>
          </div>
          <div onClick=${row.onDelete} style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C33D22" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg>
          </div>
        </div>
      `)}
    </div>
  `;
}

function renderSiteProductsTab(app, v) {
  return html`
    <div style="padding:8px 40px 24px">
      <div onClick=${v.onNewSiteProduct} style="display:flex;align-items:center;justify-content:center;gap:8px;background:var(--brand-700);color:#F4F2F1;border-radius:var(--radius-md);padding:14px;font-weight:600;font-size:15px;cursor:pointer;margin-bottom:18px;transition:transform 0.15s ease">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F4F2F1" stroke-width="2.4"><path d="M12 5v14M5 12h14"></path></svg>
        Novo Produto no Catálogo
      </div>
      ${adminSearchBar(v)}
      ${v.siteCatalogLoading && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Carregando...</div>`}
      ${v.productSelectionMode && v.productSelectionScope === 'site' && selectionBar(v.selectedProductCountLabel, v.onBulkDeleteProductsAsk, v.onCancelProductSelection)}
      ${!v.siteCatalogLoading && !v.hasSiteProductRows && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Nenhum produto no catálogo público ainda.</div>`}
      ${v.siteProductRows.map((row) => html`
        <div key=${row.id} style=${row.rowStyle || "display:flex;align-items:center;gap:14px;background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:10px"} onMouseDown=${row.onPressStart} onMouseUp=${row.onPressEnd} onMouseLeave=${row.onPressEnd} onTouchStart=${row.onPressStart} onTouchEnd=${row.onPressEnd} onClick=${row.onRowClick}>
          ${row.showCheckbox && html`<div style=${row.checkboxStyle}>${row.checkMark}</div>`}
          <img loading="lazy" decoding="async" src=${row.imagem} alt="" style="width:36px;height:36px;border-radius:8px;object-fit:cover;flex-shrink:0"/>
          <div style="flex:1">
            <div style="font-size:15px;font-weight:600">${row.name} <span style=${row.statusBadgeStyle}>${row.statusLabel}</span></div>
            <div style="font-size:12px;color:var(--neutral-600)">${row.categoryName} · por ${row.unit} · ${row.code}${row.updatedAtLabel ? ` · atualizado em ${row.updatedAtLabel}` : ''}</div>
          </div>
          <div style="font-size:15px;font-weight:700;color:var(--brand-700)">${row.priceLabel}</div>
          <div onClick=${row.onToggleActive} style="font-size:12px;font-weight:700;color:var(--brand-700);cursor:pointer;border:1.5px solid var(--brand-500);padding:8px 12px;border-radius:var(--radius-full);white-space:nowrap">${row.toggleActiveLabel}</div>
          <div onClick=${row.onEdit} style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-900)" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>
          </div>
          <div onClick=${row.onDelete} title="Excluir permanentemente" style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C33D22" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg>
          </div>
        </div>
      `)}
    </div>
  `;
}

function renderSiteCategoriesTab(app, v) {
  return html`
    <div style="padding:8px 40px 24px">
      <div onClick=${v.onNewSiteCategory} style="display:flex;align-items:center;justify-content:center;gap:8px;background:var(--brand-700);color:#F4F2F1;border-radius:var(--radius-md);padding:14px;font-weight:600;font-size:15px;cursor:pointer;margin-bottom:18px;transition:transform 0.15s ease">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F4F2F1" stroke-width="2.4"><path d="M12 5v14M5 12h14"></path></svg>
        Nova Categoria no Catálogo
      </div>
      ${adminSearchBar(v)}
      ${v.siteCatalogLoading && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Carregando...</div>`}
      ${!v.siteCatalogLoading && !v.hasSiteCategoryRows && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Nenhuma categoria no catálogo público ainda.</div>`}
      ${v.siteCategoryRows.map((row) => html`
        <div key=${row.id} style=${`display:flex;align-items:center;gap:14px;background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:10px;opacity:1`}>
          <div style="flex:1">
            <div style="font-size:15px;font-weight:600">${row.name} <span style=${row.statusBadgeStyle}>${row.statusLabel}</span></div>
            <div style="font-size:12px;color:var(--neutral-600)">${row.typeLabel} · ${row.code}${row.updatedAtLabel ? ` · atualizado em ${row.updatedAtLabel}` : ''}</div>
          </div>
          <div onClick=${row.onToggleActive} style="font-size:12px;font-weight:700;color:var(--brand-700);cursor:pointer;border:1.5px solid var(--brand-500);padding:8px 12px;border-radius:var(--radius-full);white-space:nowrap">${row.toggleActiveLabel}</div>
          <div onClick=${row.onEdit} style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-900)" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>
          </div>
          <div onClick=${row.onDelete} title="Excluir permanentemente" style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C33D22" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg>
          </div>
        </div>
      `)}
      ${v.hasSiteCategoryError && html`<div style="background:rgba(195,61,34,0.1);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;margin-top:8px">${v.siteCategoryError}</div>`}
      ${renderLocalHomeCustomization(app, v)}
    </div>
  `;
}

function renderAdmin(app, v) {
  return html`
    <div style="padding:32px 40px 16px;display:flex;align-items:center;gap:16px">
      <div onClick=${v.onBackFromAdmin} style="width:40px;height:40px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform 0.15s ease">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-900)" stroke-width="2.2"><path d="M15 18l-6-6 6-6"></path></svg>
      </div>
      <div style="font-size:26px;font-weight:700;letter-spacing:-0.02em">Modo de Criação</div>
    </div>

    <div style="padding:0 40px 16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <div onClick=${v.onSetAdminTabMyRecipes} style=${v.adminTabMyRecipesStyle}>Minhas Receitas</div>
      <div onClick=${v.onSetAdminTabMyProducts} style=${v.adminTabMyProductsStyle}>Meus Produtos</div>
      <div onClick=${v.onSetAdminTabMyCategories} style=${v.adminTabMyCategoriesStyle}>Minhas Categorias</div>
      <div onClick=${v.onSetAdminTabSharedRecipes} style=${v.adminTabSharedRecipesStyle}>Receitas Compartilhadas</div>
      <div onClick=${v.onSetAdminTabMyRequests} style=${v.adminTabMyRequestsStyle}>Meus Pedidos</div>
      ${v.isAdminRole && html`
        <div onClick=${v.onSetAdminTabRecipes} style=${v.adminTabRecipesStyle}>Catálogo: Receitas</div>
        <div onClick=${v.onSetAdminTabProducts} style=${v.adminTabProductsStyle}>Catálogo: Produtos</div>
        <div onClick=${v.onSetAdminTabCategories} style=${v.adminTabCategoriesStyle}>Catálogo: Categorias</div>
        <div onClick=${v.onSetAdminTabRequestsInbox} style=${v.adminTabRequestsInboxStyle}>Solicitações Recebidas${v.hasPendingRequestsBadge ? html` (${v.pendingRequestsCount})` : ''}</div>
      `}
    </div>

    ${v.hasAdminFlash && html`<div style="margin:0 40px 16px;background:rgba(52,178,62,0.12);border:1px solid var(--green-500);color:var(--green-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;animation:ycFadeIn 0.2s ease">${v.adminFlash}</div>`}
    ${v.hasMyCreationError && html`
      <div style="margin:0 40px 16px;background:rgba(195,61,34,0.1);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <span>${v.myCreationError}</span>
        <button onClick=${v.onRetryMyCreationData} style="background:var(--red-600);color:#F4F2F1;border:none;border-radius:var(--radius-full);padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Tentar novamente</button>
      </div>
    `}
    ${v.hasSiteCatalogErrorBanner && html`
      <div style="margin:0 40px 16px;background:rgba(195,61,34,0.1);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <span>${v.siteCatalogError}</span>
        <button onClick=${v.onRetrySiteCatalogData} style="background:var(--red-600);color:#F4F2F1;border:none;border-radius:var(--radius-full);padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Tentar novamente</button>
      </div>
    `}

    ${v.isAdminMyRecipesTab && renderMyRecipesTab(app, v)}
    ${v.isAdminMyProductsTab && renderMyProductsTab(app, v)}
    ${v.isAdminMyCategoriesTab && renderMyCategoriesTab(app, v)}
    ${v.isAdminSharedRecipesTab && renderSharedRecipesTab(app, v)}
    ${v.isAdminMyRequestsTab && renderMyRequestsTab(app, v)}
    ${v.isAdminRole && v.isAdminRecipesTab && renderSiteRecipesTab(app, v)}
    ${v.isAdminRole && v.isAdminCategoriesTab && renderSiteCategoriesTab(app, v)}
    ${v.isAdminRole && v.isAdminProductsTab && renderSiteProductsTab(app, v)}
    ${v.isAdminRole && v.isAdminRequestsInboxTab && renderRequestsInboxTab(app, v)}
  `;
}

function renderMyRecipesTab(app, v) {
  return html`
    <div style="padding:8px 40px 24px">
      <div onClick=${v.onNewMyRecipe} style="display:flex;align-items:center;justify-content:center;gap:8px;background:var(--brand-700);color:#F4F2F1;border-radius:var(--radius-md);padding:14px;font-weight:600;font-size:15px;cursor:pointer;margin-bottom:18px;transition:transform 0.15s ease">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F4F2F1" stroke-width="2.4"><path d="M12 5v14M5 12h14"></path></svg>
        Nova Receita
      </div>
      ${adminSearchBar(v)}
      ${v.myCreationLoading && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Carregando...</div>`}
      ${v.selectionMode && v.recipeSelectionScope === 'my' && selectionBar(v.selectedCountLabel, v.onBulkDeleteAsk, v.onCancelSelection)}
      ${!v.myCreationLoading && !v.hasMyRecipeRows && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Você ainda não tem receitas próprias.</div>`}
      ${v.myRecipeRows.map((row) => html`
        <div key=${row.id} style=${row.rowStyle || "display:flex;align-items:center;gap:14px;background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:10px"} onMouseDown=${row.onPressStart} onMouseUp=${row.onPressEnd} onMouseLeave=${row.onPressEnd} onTouchStart=${row.onPressStart} onTouchEnd=${row.onPressEnd} onClick=${row.onRowClick}>
          ${row.showCheckbox && html`<div style=${row.checkboxStyle}>${row.checkMark}</div>`}
          <div onClick=${row.onOpen} style="flex:1;cursor:pointer">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:15px;font-weight:600">${row.name}</span>
              <span style=${row.sourceBadgeStyle}>${row.sourceLabel}</span>
            </div>
            <div style="font-size:12px;color:var(--neutral-600)">${row.categoryName} · ${row.code}</div>
          </div>
          <div onClick=${row.onEdit} style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-900)" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>
          </div>
          <div onClick=${row.onDelete} style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C33D22" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg>
          </div>
        </div>
      `)}
    </div>
  `;
}

function renderMyProductsTab(app, v) {
  return html`
    <div style="padding:8px 40px 24px">
      <div onClick=${v.onNewMyProduct} style="display:flex;align-items:center;justify-content:center;gap:8px;background:var(--brand-700);color:#F4F2F1;border-radius:var(--radius-md);padding:14px;font-weight:600;font-size:15px;cursor:pointer;margin-bottom:18px;transition:transform 0.15s ease">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F4F2F1" stroke-width="2.4"><path d="M12 5v14M5 12h14"></path></svg>
        Novo Produto
      </div>
      ${adminSearchBar(v)}
      ${v.myCreationLoading && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Carregando...</div>`}
      ${v.productSelectionMode && v.productSelectionScope === 'my' && selectionBar(v.selectedProductCountLabel, v.onBulkDeleteProductsAsk, v.onCancelProductSelection)}
      ${!v.myCreationLoading && !v.hasMyProductRows && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Você ainda não tem produtos próprios.</div>`}
      ${v.myProductRows.map((row) => html`
        <div key=${row.id} style=${row.rowStyle || "display:flex;align-items:center;gap:14px;background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:10px"} onMouseDown=${row.onPressStart} onMouseUp=${row.onPressEnd} onMouseLeave=${row.onPressEnd} onTouchStart=${row.onPressStart} onTouchEnd=${row.onPressEnd} onClick=${row.onRowClick}>
          ${row.showCheckbox && html`<div style=${row.checkboxStyle}>${row.checkMark}</div>`}
          <img loading="lazy" decoding="async" src=${row.imagem} alt="" style="width:36px;height:36px;border-radius:8px;object-fit:cover;flex-shrink:0"/>
          <div style="flex:1">
            <div style="font-size:15px;font-weight:600">${row.name}</div>
            <div style="font-size:12px;color:var(--neutral-600)">${row.categoryName} · por ${row.unit} · ${row.code}</div>
          </div>
          <div style="font-size:15px;font-weight:700;color:var(--brand-700)">${row.priceLabel}</div>
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:var(--radius-full);background:${row.active ? '#34B23E22' : '#8A858022'};color:${row.active ? '#34B23E' : '#8A8580'};white-space:nowrap">${row.activeLabel}</span>
          <div onClick=${row.onToggleActive} title=${row.toggleActiveLabel} style="font-size:12px;font-weight:700;color:var(--neutral-800);cursor:pointer;border:1.5px solid var(--neutral-200);padding:8px 12px;border-radius:var(--radius-full);white-space:nowrap">${row.toggleActiveLabel}</div>
          <div onClick=${row.onRequestPublish} style="font-size:12px;font-weight:700;color:var(--brand-700);cursor:pointer;border:1.5px solid var(--brand-500);padding:8px 12px;border-radius:var(--radius-full);white-space:nowrap">Solicitar publicação</div>
          <div onClick=${row.onEdit} title="Editar" style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-900)" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>
          </div>
          <div onClick=${row.onDelete} title="Excluir permanentemente" style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C33D22" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg>
          </div>
        </div>
      `)}
    </div>
  `;
}

function renderMyCategoriesTab(app, v) {
  return html`
    <div style="padding:8px 40px 24px">
      <div onClick=${v.onNewMyCategory} style="display:flex;align-items:center;justify-content:center;gap:8px;background:var(--brand-700);color:#F4F2F1;border-radius:var(--radius-md);padding:14px;font-weight:600;font-size:15px;cursor:pointer;margin-bottom:18px;transition:transform 0.15s ease">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F4F2F1" stroke-width="2.4"><path d="M12 5v14M5 12h14"></path></svg>
        Nova Categoria
      </div>
      ${adminSearchBar(v)}
      ${v.myCreationLoading && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Carregando...</div>`}
      ${!v.myCreationLoading && !v.hasMyCategoryRows && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Você ainda não tem categorias próprias.</div>`}
      ${v.myCategoryRows.map((row) => html`
        <div key=${row.id} style="display:flex;align-items:center;gap:14px;background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:10px">
          <div style="flex:1">
            <div style="font-size:15px;font-weight:600">${row.name}</div>
            <div style="font-size:12px;color:var(--neutral-600)">${row.typeLabel} · ${row.code}</div>
          </div>
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:var(--radius-full);background:${row.active ? '#34B23E22' : '#8A858022'};color:${row.active ? '#34B23E' : '#8A8580'};white-space:nowrap">${row.activeLabel}</span>
          <div onClick=${row.onToggleActive} title=${row.toggleActiveLabel} style="font-size:12px;font-weight:700;color:var(--neutral-800);cursor:pointer;border:1.5px solid var(--neutral-200);padding:8px 12px;border-radius:var(--radius-full);white-space:nowrap">${row.toggleActiveLabel}</div>
          <div onClick=${row.onRequestPublish} style="font-size:12px;font-weight:700;color:var(--brand-700);cursor:pointer;border:1.5px solid var(--brand-500);padding:8px 12px;border-radius:var(--radius-full);white-space:nowrap">Solicitar publicação</div>
          <div onClick=${row.onEdit} title="Editar" style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-900)" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>
          </div>
          <div onClick=${row.onDelete} title="Excluir permanentemente" style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C33D22" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg>
          </div>
        </div>
      `)}
    </div>
  `;
}

function renderRecipeFormModal(app, v) {
  const f = v.recipeForm;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:20;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div className="yc-scroll" style="width:820px;max-width:100%;max-height:90%;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;background:var(--neutral-0);border-radius:var(--radius-xl);padding:32px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        <div style="font-size:22px;font-weight:700;margin-bottom:20px">${v.recipeFormTitle}</div>
        <div className="yc-form-grid">
          <input type="text" placeholder="Nome da receita" value=${f.nome} onInput=${v.recipeFormOnNome} style="background:var(--neutral-0);color:var(--neutral-900);grid-column:span 2;padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:14px"/>
          <${CustomSelect} options=${v.categoriaReceitaOptions} value=${f.categoria} onChange=${v.recipeFormOnCategoriaSet} />
          <${CustomSelect} options=${v.dificuldadeOptions} value=${f.dificuldade} onChange=${v.recipeFormOnDificuldadeSet} />
          <input type="number" placeholder="Tempo (min)" value=${f.tempo} onInput=${v.recipeFormOnTempo} style="background:var(--neutral-0);color:var(--neutral-900);padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:14px"/>
          <input type="number" placeholder="Porções" value=${f.porcoes} onInput=${v.recipeFormOnPorcoes} style="background:var(--neutral-0);color:var(--neutral-900);padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:14px"/>
          <input type="text" placeholder="URL da imagem" value=${f.imagem} onInput=${v.recipeFormOnImagem} style="background:var(--neutral-0);color:var(--neutral-900);padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:14px"/>
          <div onClick=${v.onRandomImage} style="padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--brand-500);color:var(--brand-700);font-weight:600;font-size:14px;text-align:center;cursor:pointer">Gerar imagem aleatória</div>
        </div>

        <div style="display:flex;gap:16px;margin-top:16px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;color:var(--neutral-900)"><input type="checkbox" checked=${!!f.tagDestaque} onChange=${v.recipeFormOnTagDestaque}/> Receita do Dia</label>
          ${v.recipeFormTagRows.map((row) => html`
            <label key=${row.key} style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;color:var(--neutral-900)"><input type="checkbox" checked=${row.checked} onChange=${row.onToggle}/> ${row.label}</label>
          `)}
        </div>

        <div style="font-size:15px;font-weight:700;margin-top:22px;margin-bottom:10px">Ingredientes (produtos cadastrados)</div>
        ${v.recipeIngredientRows.map((row) => html`
          <div key=${row.idx} style="display:flex;gap:10px;margin-bottom:10px;align-items:center;flex-wrap:wrap">
            <div style="flex:1;min-width:160px"><${CustomSelect} options=${v.produtoOptions} value=${row.produtoId} onChange=${row.onProdutoSet} /></div>
            <input type="number" step="0.1" value=${row.qtd} onInput=${row.onQtdChange} style="background:var(--neutral-0);color:var(--neutral-900);width:90px;padding:10px 12px;border-radius:var(--radius-sm);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:13px"/>
            <div onClick=${row.onRemove} style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C33D22" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"></path></svg>
            </div>
          </div>
        `)}
        <div onClick=${v.onAddIngredientRow} style="font-size:13px;font-weight:700;color:var(--brand-700);cursor:pointer;margin-bottom:6px">+ Adicionar ingrediente</div>

        <div style="font-size:15px;font-weight:700;margin-top:20px;margin-bottom:8px">Outros itens necessários (um por linha)</div>
        <textarea value=${f.extrasText} onInput=${v.recipeFormOnExtras} rows="3" style="background:var(--neutral-0);color:var(--neutral-900);width:100%;padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:14px;resize:vertical"></textarea>

        <div style="font-size:15px;font-weight:700;margin-top:20px;margin-bottom:8px">Modo de preparo (um passo por linha)</div>
        <textarea value=${f.modoPreparoText} onInput=${v.recipeFormOnModoPreparo} rows="5" style="background:var(--neutral-0);color:var(--neutral-900);width:100%;padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:14px;resize:vertical"></textarea>

        <div style="font-size:15px;font-weight:700;margin-top:20px;margin-bottom:8px">Dicas (uma por linha)</div>
        <textarea value=${f.dicasText} onInput=${v.recipeFormOnDicas} rows="3" style="background:var(--neutral-0);color:var(--neutral-900);width:100%;padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:14px;resize:vertical"></textarea>

        <div style="display:flex;gap:10px;margin-top:24px">
          <div onClick=${v.onCancelRecipeForm} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50);transition:transform 0.15s ease">Cancelar</div>
          <div onClick=${v.onSaveRecipeForm} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer;color:#F4F2F1;background:var(--brand-700);transition:transform 0.15s ease">Salvar Receita</div>
        </div>
      </div>
    </div>
  `;
}

function renderProductFormModal(app, v) {
  const f = v.productForm;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:20;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div style="width:440px;max-width:100%;background:var(--neutral-0);border-radius:var(--radius-xl);padding:28px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        <div style="font-size:20px;font-weight:700;margin-bottom:18px">${v.productFormTitle}</div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <input type="text" placeholder="Nome do produto" value=${f.nome} onInput=${v.productFormOnNome} style="background:var(--neutral-0);color:var(--neutral-900);padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:14px"/>
          <${CustomSelect} options=${v.categoriaProdutoOptions} value=${f.categoria} onChange=${v.productFormOnCategoriaSet} />
          <${CustomSelect} options=${v.unidadeOptions} value=${f.unidade} onChange=${v.productFormOnUnidadeSet} />
          <input type="number" step="0.01" placeholder="Preço (R$)" value=${f.preco} onInput=${v.productFormOnPreco} style="background:var(--neutral-0);color:var(--neutral-900);padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:14px"/>
          <input type="text" placeholder="URL da imagem" value=${f.imagem} onInput=${v.productFormOnImagem} style="background:var(--neutral-0);color:var(--neutral-900);padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:14px"/>
          <div onClick=${v.onRandomProductImage} style="padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--brand-500);color:var(--brand-700);font-weight:600;font-size:14px;text-align:center;cursor:pointer">Gerar imagem aleatória</div>
        </div>
        ${v.productFormTagRows.length > 0 && html`
          <div style="display:flex;gap:16px;margin-top:14px;flex-wrap:wrap">
            ${v.productFormTagRows.map((row) => html`
              <label key=${row.key} style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;color:var(--neutral-900)"><input type="checkbox" checked=${row.checked} onChange=${row.onToggle}/> ${row.label}</label>
            `)}
          </div>
        `}
        <div style="display:flex;gap:10px;margin-top:22px">
          <div onClick=${v.onCancelProductForm} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50);transition:transform 0.15s ease">Cancelar</div>
          <div onClick=${v.onSaveProductForm} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer;color:#F4F2F1;background:var(--brand-700);transition:transform 0.15s ease">Salvar</div>
        </div>
      </div>
    </div>
  `;
}

function renderMyRecipeFormModal(app, v) {
  const f = v.myRecipeForm;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:20;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div className="yc-scroll" style="width:820px;max-width:100%;max-height:90%;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;background:var(--neutral-0);border-radius:var(--radius-xl);padding:32px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        <div style="font-size:22px;font-weight:700;margin-bottom:20px">${v.myRecipeFormTitle}</div>
        ${v.hasMyFormError && html`<div style="background:rgba(195,61,34,0.1);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;margin-bottom:14px">${v.myFormError}</div>`}
        <div className="yc-form-grid">
          ${field('Nome da receita', html`<input type="text" value=${f.name} onInput=${v.myRecipeFormOnName} style=${FORM_INPUT_STYLE}/>`, { required: true, span: 2 })}
          ${field('Categoria', html`<${CustomSelect} options=${v.myRecipeCategoryOptions} value=${f.categoryId} onChange=${v.myRecipeFormOnCategorySet} />`, { required: true })}
          ${field('Nível de dificuldade', html`<${CustomSelect} options=${v.dificuldadeOptionsMy} value=${f.difficulty} onChange=${v.myRecipeFormOnDifficultySet} />`, { required: true })}
          ${field('Tempo de preparo (minutos)', html`<input type="number" value=${f.prepTime} onInput=${v.myRecipeFormOnPrepTime} style=${FORM_INPUT_STYLE}/>`)}
          ${field('Número de porções', html`<input type="number" value=${f.servings} onInput=${v.myRecipeFormOnServings} style=${FORM_INPUT_STYLE}/>`)}
          ${field('URL da imagem (opcional)', html`<input type="text" value=${f.imageUrl} onInput=${v.myRecipeFormOnImageUrl} style=${FORM_INPUT_STYLE}/>`, { span: 2 })}
        </div>

        ${v.myRecipeCategoryOptions.length === 0 && html`<div style="font-size:12px;color:var(--neutral-600);margin-top:8px">Cadastre antes uma categoria do tipo "Receita" em Minhas Categorias.</div>`}

        <div style="font-size:15px;font-weight:700;margin-top:22px;margin-bottom:6px">Seções (opcional)</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:6px">
          ${v.myRecipeSectionRows.map((row) => html`
            <label key=${row.key} style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;color:var(--neutral-900)"><input type="checkbox" checked=${row.checked} onChange=${row.onToggle}/> ${row.label}</label>
          `)}
        </div>

        <div style="font-size:15px;font-weight:700;margin-top:16px;margin-bottom:10px">Ingredientes (meus produtos)</div>
        ${v.myRecipeIngredientRows.map((row) => html`
          <div key=${row.idx}>
            <div style="display:flex;gap:10px;margin-bottom:${row.confirming ? '4px' : '10px'};align-items:center;flex-wrap:wrap">
              <div style="flex:1;min-width:160px"><${CustomSelect} options=${v.myProductOptionsForIngredients} value=${row.productId} onChange=${row.onProductSet} /></div>
              <input type="number" step="0.1" value=${row.quantity} onInput=${row.onQuantityChange} style="background:var(--neutral-0);color:var(--neutral-900);width:90px;padding:10px 12px;border-radius:var(--radius-sm);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:13px"/>
              <div onClick=${row.onRemove} style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C33D22" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"></path></svg>
              </div>
            </div>
            ${row.confirming && html`
              <div style="background:rgba(195,61,34,0.06);border:1px solid var(--red-500);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:10px">
                <div style="font-size:13px;font-weight:600;margin-bottom:2px">Remover "${row.confirmProductName}" desta receita?</div>
                <div style="font-size:12px;color:var(--neutral-600);margin-bottom:2px">${row.confirmDetailLabel}</div>
                <div style="font-size:12px;color:var(--neutral-600);margin-bottom:8px">${row.confirmUsageLabel}</div>
                <div style="display:flex;gap:8px">
                  <div onClick=${row.onCancelRemove} style="padding:8px 14px;border-radius:var(--radius-full);background:var(--neutral-50);color:var(--neutral-800);font-weight:600;font-size:12px;cursor:pointer">Cancelar</div>
                  <div onClick=${row.onConfirmRemove} style="padding:8px 14px;border-radius:var(--radius-full);background:var(--red-600);color:#F4F2F1;font-weight:700;font-size:12px;cursor:pointer">Remover ingrediente</div>
                </div>
              </div>
            `}
          </div>
        `)}
        <div onClick=${v.onAddMyRecipeIngredient} style="font-size:13px;font-weight:700;color:var(--brand-700);cursor:pointer;margin-bottom:6px">+ Adicionar ingrediente</div>
        ${v.myProductOptionsForIngredients.length === 0 && html`<div style="font-size:12px;color:var(--neutral-600)">Cadastre antes um produto em Meus Produtos.</div>`}
        ${v.myRecipeIngredientRows.length > 0 && html`<div style="font-size:13px;font-weight:700;color:var(--neutral-800);margin-top:4px">Custo estimado dos ingredientes: ${v.myIngredientTotalCostLabel}</div>`}

        ${field('Extras (um por linha)', html`<textarea value=${f.extrasText} onInput=${v.myRecipeFormOnExtras} rows="3" style=${FORM_TEXTAREA_STYLE}></textarea>`, { span: 2 })}

        ${field('Modo de preparo (um passo por linha)', html`<textarea value=${f.instructionsText} onInput=${v.myRecipeFormOnInstructions} rows="5" style=${FORM_TEXTAREA_STYLE}></textarea>`, { span: 2 })}

        ${field('Dicas (uma por linha)', html`<textarea value=${f.tipsText} onInput=${v.myRecipeFormOnTips} rows="3" style=${FORM_TEXTAREA_STYLE}></textarea>`, { span: 2 })}

        <div style="display:flex;gap:10px;margin-top:24px;flex-wrap:wrap">
          <div onClick=${v.onCancelMyRecipeForm} style="flex:1;min-width:120px;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50);transition:transform 0.15s ease">Cancelar</div>
          <div onClick=${v.onSaveMyRecipeForm} style="flex:1;min-width:120px;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer;color:#F4F2F1;background:var(--brand-700);transition:transform 0.15s ease">Salvar Receita</div>
        </div>
      </div>
    </div>
  `;
}

function renderMyProductFormModal(app, v) {
  const f = v.myProductForm;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:20;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div style="width:440px;max-width:100%;background:var(--neutral-0);border-radius:var(--radius-xl);padding:28px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease;box-sizing:border-box">
        <div style="font-size:20px;font-weight:700;margin-bottom:18px">${v.myProductFormTitle}</div>
        ${v.hasMyFormError && html`<div style="background:rgba(195,61,34,0.1);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;margin-bottom:14px">${v.myFormError}</div>`}
        <div style="display:flex;flex-direction:column;gap:14px">
          ${field('Nome do produto', html`<input type="text" value=${f.name} onInput=${v.myProductFormOnName} style=${FORM_INPUT_STYLE}/>`, { required: true })}
          ${field('Categoria (proteína/produto)', html`<${CustomSelect} options=${v.myProteinCategoryOptions} value=${f.categoryId} onChange=${v.myProductFormOnCategorySet} />`, { required: true })}
          ${field('Unidade', html`<${CustomSelect} options=${v.unidadeOptionsMy} value=${f.unit} onChange=${v.myProductFormOnUnitSet} />`, { required: true })}
          ${field('Preço (R$)', html`<input type="number" step="0.01" value=${f.price} onInput=${v.myProductFormOnPrice} style=${FORM_INPUT_STYLE}/>`, { required: true })}
          ${field('URL da imagem (opcional)', html`<input type="text" value=${f.imageUrl} onInput=${v.myProductFormOnImageUrl} style=${FORM_INPUT_STYLE}/>`)}
        </div>
        ${v.myProteinCategoryOptions.length === 0 && html`<div style="font-size:12px;color:var(--neutral-600);margin-top:8px">Cadastre antes uma categoria do tipo "Proteína/Produto" em Minhas Categorias.</div>`}
        <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap">
          <div onClick=${v.onCancelMyProductForm} style="flex:1;min-width:120px;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50);transition:transform 0.15s ease">Cancelar</div>
          <div onClick=${v.onSaveMyProductForm} style="flex:1;min-width:120px;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer;color:#F4F2F1;background:var(--brand-700);transition:transform 0.15s ease">Salvar</div>
        </div>
      </div>
    </div>
  `;
}

function renderMyCategoryFormModal(app, v) {
  const f = v.myCategoryForm;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:20;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div style="width:420px;max-width:100%;background:var(--neutral-0);border-radius:var(--radius-xl);padding:28px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease;box-sizing:border-box">
        <div style="font-size:20px;font-weight:700;margin-bottom:18px">${v.myCategoryFormTitle}</div>
        ${v.hasMyFormError && html`<div style="background:rgba(195,61,34,0.1);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;margin-bottom:14px">${v.myFormError}</div>`}
        <div style="display:flex;flex-direction:column;gap:14px">
          ${field('Nome da categoria', html`<input type="text" value=${f.name} onInput=${v.myCategoryFormOnName} style=${FORM_INPUT_STYLE}/>`, { required: true })}
          ${field('Tipo', html`<${CustomSelect} options=${v.myCategoryTypeOptions} value=${f.type} onChange=${v.myCategoryFormOnTypeSet} />`, { required: true })}
        </div>
        <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap">
          <div onClick=${v.onCancelMyCategoryForm} style="flex:1;min-width:120px;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50);transition:transform 0.15s ease">Cancelar</div>
          <div onClick=${v.onSaveMyCategoryForm} style="flex:1;min-width:120px;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer;color:#F4F2F1;background:var(--brand-700);transition:transform 0.15s ease">Salvar</div>
        </div>
      </div>
    </div>
  `;
}

function renderMyRecipeDetailModal(app, v) {
  const d = v.myRecipeDetail;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:22;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div ref=${app.modalFocusRef('myRecipeDetail')} role="dialog" aria-modal="true" aria-label=${d ? d.name : 'Receita'} tabindex="-1" className="yc-scroll" style="width:640px;max-width:100%;max-height:90%;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;background:var(--neutral-0);border-radius:var(--radius-xl);padding:32px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease;outline:none">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:22px;font-weight:700">${d ? d.name : 'Receita'}</div>
          <div onClick=${v.onCloseMyRecipeDetail} aria-label="Fechar" role="button" tabindex="0" style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-900)" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"></path></svg>
          </div>
        </div>

        ${v.myRecipeDetailLoading && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:30px 0">Carregando...</div>`}
        ${v.hasMyRecipeDetailError && html`
          <div style="padding:12px 0">
            <div style="color:var(--red-600);font-size:13px;font-weight:600;margin-bottom:10px">${v.myRecipeDetailError}</div>
            <button onClick=${v.onRetryMyRecipeDetail} style="background:var(--red-600);color:#F4F2F1;border:none;border-radius:var(--radius-full);padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer">Tentar novamente</button>
          </div>
        `}

        ${d && html`
          <div style="font-size:13px;color:var(--neutral-600);margin-bottom:4px">${d.code} · ${d.categoryName} · ${d.prepTimeLabel} · ${d.servingsLabel} · ${d.difficulty}</div>
          ${v.recipeAuthorName && html`<div style="font-size:13px;font-weight:600;color:var(--brand-700);margin-bottom:14px">Criado por ${v.recipeAuthorName}</div>`}
          ${d.sectionNames && html`<div style="font-size:12px;color:var(--neutral-600);margin-bottom:14px">Seções: ${d.sectionNames}</div>`}

          <div style="font-size:15px;font-weight:700;margin-bottom:8px">Ingredientes</div>
          ${d.ingredientRows.map((row) => html`
            <div key=${row.id} style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--neutral-100);font-size:14px">
              <div>${row.name} <span style="color:var(--neutral-600)">— ${row.quantity} ${row.unit}</span></div>
              <div style="font-weight:600">${row.subtotalLabel}</div>
            </div>
          `)}
          <div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:700;font-size:15px">
            <div>Total (preços atuais)</div>
            <div>${d.totalCostLabel}</div>
          </div>

          ${d.isOwner ? html`
            <div style="margin-top:22px;border-top:1px solid var(--neutral-100);padding-top:18px">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px">
                <div style="font-size:15px;font-weight:700">Compartilhamento — ${d.name}</div>
                <span style=${`font-size:11px;font-weight:700;padding:4px 10px;border-radius:var(--radius-full);white-space:nowrap;background:${v.shareActive ? 'rgba(52,178,62,0.14)' : 'var(--neutral-50)'};color:${v.shareActive ? 'var(--green-600)' : 'var(--neutral-600)'}`}>${v.shareActive ? 'Ativo' : 'Inativo'}</span>
              </div>
              <div style="font-size:13px;color:var(--neutral-600);margin-bottom:12px">${v.shareStatusLabel}</div>
              ${v.hasShareFlash && html`<div style="background:rgba(52,178,62,0.12);border:1px solid var(--green-500);color:var(--green-600);border-radius:var(--radius-md);padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:12px">${v.shareFlash}</div>`}

              ${v.hasShareCode && html`
                <div className="yc-code-box" style="margin-bottom:12px;font-size:22px;font-weight:700;color:var(--brand-700);user-select:all">${v.shareCode}</div>
                <div onClick=${v.onCopyShareCode} style="text-align:center;font-size:14px;font-weight:700;color:${v.shareCopyConfirmed ? 'var(--green-600)' : '#F4F2F1'};cursor:pointer;border:1.5px solid ${v.shareCopyConfirmed ? 'var(--green-600)' : 'var(--brand-700)'};background:${v.shareCopyConfirmed ? 'transparent' : 'var(--brand-700)'};padding:12px;border-radius:var(--radius-full);margin-bottom:6px;transition:transform 0.15s ease" role="button" tabindex="0" onKeyDown=${(e) => (e.key === 'Enter' || e.key === ' ') && v.onCopyShareCode(e)}>${v.shareCopyConfirmed ? 'Código copiado ✓' : 'Copiar código'}</div>
                <div style="font-size:12px;color:var(--neutral-600);margin-bottom:12px">Este é o código YSH — compartilhe-o com quem deve ter acesso somente leitura a esta receita.</div>
              `}
              <div style="font-size:13px;color:var(--neutral-600);margin-bottom:14px">${v.shareGrantCount} acesso(s) ativo(s) concedido(s) por este código.</div>

              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
                ${!v.shareActive && !v.hasShareCode && html`<div onClick=${v.shareBusy ? null : v.onActivateSharing} style="padding:10px 16px;border-radius:var(--radius-full);background:var(--brand-700);color:#F4F2F1;font-weight:600;font-size:13px;cursor:pointer">Ativar compartilhamento</div>`}
                ${v.hasShareCode && html`<div onClick=${v.shareBusy ? null : v.onRegenerateShareCode} style="padding:10px 16px;border-radius:var(--radius-full);border:1.5px solid var(--brand-700);color:var(--brand-700);font-weight:600;font-size:13px;cursor:pointer">Gerar novo código</div>`}
                ${v.shareActive && html`<div onClick=${v.shareBusy ? null : v.onDeactivateSharing} style="padding:10px 16px;border-radius:var(--radius-full);border:1.5px solid var(--neutral-400);color:var(--neutral-800);font-weight:600;font-size:13px;cursor:pointer">Desativar novos acessos</div>`}
                ${!v.shareActive && v.hasShareCode && html`<div onClick=${v.shareBusy ? null : v.onActivateSharing} style="padding:10px 16px;border-radius:var(--radius-full);background:var(--brand-700);color:#F4F2F1;font-weight:600;font-size:13px;cursor:pointer">Reativar código</div>`}
                ${v.shareGrantCount > 0 && !v.shareRevokeConfirming && html`<div onClick=${v.shareBusy ? null : v.onAskRevokeAllAccess} style="padding:10px 16px;border-radius:var(--radius-full);border:1.5px solid var(--red-600);color:var(--red-600);font-weight:600;font-size:13px;cursor:pointer">Revogar acessos existentes</div>`}
              </div>

              ${v.shareRevokeConfirming && html`
                <div style="background:rgba(195,61,34,0.08);border:1px solid var(--red-500);border-radius:var(--radius-md);padding:14px;margin-bottom:12px">
                  <div style="font-size:13px;color:var(--red-600);font-weight:600;margin-bottom:10px">Revogar agora removerá o acesso de ${v.shareGrantCount} pessoa(s) imediatamente. Cópias que já foram criadas a partir desta receita não são afetadas. Confirma?</div>
                  <div style="display:flex;gap:8px">
                    <div onClick=${v.onCancelRevokeAllAccess} style="flex:1;text-align:center;padding:10px;border-radius:var(--radius-md);font-weight:600;font-size:13px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-0)">Cancelar</div>
                    <div onClick=${v.shareBusy ? null : v.onRevokeAllAccess} style="flex:1;text-align:center;padding:10px;border-radius:var(--radius-md);font-weight:700;font-size:13px;cursor:pointer;color:#F4F2F1;background:var(--red-600)">${v.shareBusy ? 'Revogando...' : 'Sim, revogar acessos'}</div>
                  </div>
                </div>
              `}

              <div style="font-size:12px;color:var(--neutral-600);line-height:1.5;background:var(--neutral-50);border-radius:var(--radius-md);padding:12px 14px">
                <strong>Desativar o código</strong> bloqueia novos resgates, mas mantém quem já tem acesso. <strong>Gerar novo código</strong> troca o código para novos resgates, sem afetar acessos já concedidos. <strong>Revogar acessos</strong> remove o acesso de quem já resgatou — nenhuma dessas ações apaga cópias próprias que outras pessoas já tenham criado.
              </div>

              <div onClick=${d.onOpenPublishRequest} style="margin-top:14px;text-align:center;padding:12px;border-radius:var(--radius-md);font-weight:700;font-size:14px;cursor:pointer;color:var(--brand-700);border:1.5px solid var(--brand-500)">Solicitar publicação no catálogo</div>
            </div>
          ` : html`
            <div style="margin-top:22px;border-top:1px solid var(--neutral-100);padding-top:18px">
              <div style="font-size:13px;color:var(--neutral-600);margin-bottom:12px">Você está vendo esta receita em modo somente leitura. As alterações do proprietário e o preço dos produtos aparecem automaticamente aqui.</div>
              <div onClick=${v.copyBusy ? null : v.onStartCopyRecipe} style="text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer;color:#F4F2F1;background:var(--brand-700)">${v.copyBusy ? 'Criando cópia...' : 'Criar cópia própria'}</div>
            </div>
          `}
        `}
      </div>
    </div>
  `;
}

function renderCopyResolveModal(app, v) {
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.6);display:flex;align-items:center;justify-content:center;z-index:24;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div className="yc-scroll" style="width:640px;max-width:100%;max-height:88%;overflow-y:auto;background:var(--neutral-0);border-radius:var(--radius-xl);padding:32px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        <div style="font-size:22px;font-weight:700;margin-bottom:6px">Resolver referências da cópia</div>
        <div style="font-size:13px;color:var(--neutral-600);margin-bottom:18px">Esta receita usa itens pessoais de outro usuário. Decida o que fazer com cada um antes de concluir a cópia — a cópia será totalmente independente da receita original.</div>
        ${v.hasCopyError && html`<div style="background:rgba(195,61,34,0.1);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;margin-bottom:14px">${v.copyError}</div>`}
        ${v.copyRefRows.map((row) => html`
          <div key=${row.key} style="background:var(--neutral-50);border-radius:var(--radius-md);padding:16px;margin-bottom:12px">
            <div style="font-size:14px;font-weight:700;margin-bottom:2px">${row.label}</div>
            <div style="font-size:12px;color:var(--neutral-600);margin-bottom:10px">${row.purposeLabel}</div>
            <${CustomSelect} options=${row.canRemove ? v.copyActionOptions : v.copyActionOptionsNoRemove} value=${row.action} onChange=${row.onSetAction} />
            ${row.action === 'map' && html`
              <div style="margin-top:8px"><${CustomSelect} options=${row.candidateOptions} value=${row.targetId} onChange=${row.onSetTarget} /></div>
            `}
          </div>
        `)}
        <div style="display:flex;gap:10px;margin-top:12px">
          <div onClick=${v.onCloseCopyModal} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50);transition:transform 0.15s ease">Cancelar</div>
          <div onClick=${v.copyBusy ? null : v.onConfirmCopy} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer;color:#F4F2F1;background:var(--brand-700);transition:transform 0.15s ease">${v.copyBusy ? 'Criando...' : 'Concluir cópia'}</div>
        </div>
      </div>
    </div>
  `;
}

function renderSharedRecipesTab(app, v) {
  return html`
    <div style="padding:8px 40px 24px">
      ${adminSearchBar(v)}
      ${v.sharedLibraryLoading && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Carregando...</div>`}
      ${v.hasSharedLibraryError && html`
        <div style="background:rgba(195,61,34,0.1);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span>${v.sharedLibraryError}</span>
          <span onClick=${v.onRetrySharedLibrary} style="cursor:pointer;text-decoration:underline;white-space:nowrap">Tentar novamente</span>
        </div>
      `}
      ${!v.sharedLibraryLoading && !v.hasSharedLibraryError && !v.hasSharedLibraryRows && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Nenhuma receita compartilhada com você ainda. Use "Cadastrar Receita por ID" no Perfil.</div>`}
      ${v.sharedLibraryRows.map((row) => html`
        <div key=${row.id} onClick=${row.onOpen} style=${`display:flex;align-items:center;justify-content:space-between;background:var(--neutral-0);border:1px solid ${row.justRedeemed ? 'var(--brand-500)' : 'var(--neutral-100)'};border-radius:var(--radius-md);padding:14px 16px;margin-bottom:10px;cursor:pointer${row.justRedeemed ? ';box-shadow:0 0 0 3px rgba(52,178,62,0.18)' : ''}`}>
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:15px;font-weight:600">${row.name}</span>
              <span style=${row.sourceBadgeStyle}>${row.sourceLabel}</span>
              ${row.justRedeemed && html`<span style="font-size:11px;font-weight:700;color:var(--brand-700)">Adicionada agora</span>`}
            </div>
            <div style="font-size:12px;color:var(--neutral-600)">${row.categoryName} · ${row.code} · somente leitura${row.authorName ? ` · por ${row.authorName}` : ''}</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-400)" stroke-width="2"><path d="M9 6l6 6-6 6"></path></svg>
        </div>
      `)}
    </div>
  `;
}

function requestFilterBar(v) {
  return html`
    <div className="yc-scroll" style="display:flex;gap:8px;overflow-x:auto;margin-bottom:16px">
      ${v.requestFilterOptions.map((opt) => html`
        <div key=${opt.value} onClick=${() => v.onSetRequestFilterStatus(opt.value)} style=${`padding:8px 16px;border-radius:var(--radius-full);font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;background:${v.requestFilterStatus === opt.value ? 'var(--brand-700)' : 'var(--neutral-50)'};color:${v.requestFilterStatus === opt.value ? '#F4F2F1' : 'var(--neutral-800)'}`}>${opt.label}</div>
      `)}
    </div>
  `;
}

function renderMyRequestsTab(app, v) {
  return html`
    <div style="padding:8px 40px 24px">
      ${adminSearchBar(v)}
      ${requestFilterBar(v)}
      ${v.myRequestsLoading && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Carregando...</div>`}
      ${v.hasMyRequestsError && html`
        <div style="background:rgba(195,61,34,0.1);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <span>${v.myRequestsError}</span>
          <button onClick=${v.onRetryMyRequests} style="background:var(--red-600);color:#F4F2F1;border:none;border-radius:var(--radius-full);padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Tentar novamente</button>
        </div>
      `}
      ${!v.myRequestsLoading && !v.hasMyRequestRows && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Nenhum pedido nesta categoria.</div>`}
      ${v.myRequestRows.map((row) => html`
        <div key=${row.id} style="background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
            <div onClick=${row.onOpenDetail} style="cursor:pointer;flex:1">
              <div style="font-size:15px;font-weight:600">${row.code} <span style=${row.statusBadgeStyle}>${row.statusLabel}</span></div>
              <div style="font-size:12px;color:var(--neutral-600);margin-top:2px">${row.entityLabel} · ${row.actionLabel} · ${row.itemCode} · ${row.dateLabel} · rev. ${row.revision}</div>
              ${row.hasAdminNote && html`<div style="font-size:12px;color:var(--red-600);margin-top:4px">Nota do admin: ${row.adminNote}</div>`}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            ${row.canEdit && html`<div onClick=${row.onEditItem} style="font-size:12px;font-weight:700;color:var(--brand-700);cursor:pointer;border:1.5px solid var(--brand-500);padding:6px 12px;border-radius:var(--radius-full)">Editar item</div>`}
            ${row.canResubmit && html`<div onClick=${row.isResubmitBusy ? null : row.onResubmit} style="font-size:12px;font-weight:700;color:#F4F2F1;cursor:pointer;background:var(--brand-700);padding:6px 12px;border-radius:var(--radius-full)">${row.isResubmitBusy ? 'Reenviando...' : 'Reenviar'}</div>`}
            ${row.canCancel && html`<div onClick=${row.onCancel} style="font-size:12px;font-weight:700;color:var(--red-600);cursor:pointer;border:1.5px solid var(--red-600);padding:6px 12px;border-radius:var(--radius-full)">Cancelar</div>`}
          </div>
        </div>
      `)}
    </div>
  `;
}

function renderRequestsInboxTab(app, v) {
  return html`
    <div style="padding:8px 40px 24px">
      ${adminSearchBar(v)}
      ${requestFilterBar(v)}
      ${v.allRequestsLoading && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Carregando...</div>`}
      ${v.hasAllRequestsError && html`
        <div style="background:rgba(195,61,34,0.1);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <span>${v.allRequestsError}</span>
          <button onClick=${v.onRetryAllRequests} style="background:var(--red-600);color:#F4F2F1;border:none;border-radius:var(--radius-full);padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Tentar novamente</button>
        </div>
      `}
      ${!v.allRequestsLoading && !v.hasAllRequestRows && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Nenhum pedido nesta categoria.</div>`}
      ${v.allRequestRows.map((row) => html`
        <div key=${row.id} onClick=${row.onOpenDetail} style="background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:10px;cursor:pointer">
          <div style="font-size:15px;font-weight:600">${row.code} <span style=${row.statusBadgeStyle}>${row.statusLabel}</span>${row.canReview ? html` <span style="font-size:11px;font-weight:700;color:var(--brand-700)">● aguardando análise</span>` : ''}</div>
          <div style="font-size:12px;color:var(--neutral-600);margin-top:2px">${row.requesterName} · ${row.entityLabel} · ${row.actionLabel} · ${row.itemCode} · ${row.dateLabel} · rev. ${row.revision}</div>
        </div>
      `)}
    </div>
  `;
}

function renderPublishRequestModal(app, v) {
  const pr = v.publishRequest;
  const blockers = pr.blockers;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.6);display:flex;align-items:center;justify-content:center;z-index:26;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div className="yc-scroll" style="width:520px;max-width:100%;max-height:88%;overflow-y:auto;background:var(--neutral-0);border-radius:var(--radius-xl);padding:32px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        <div style="font-size:20px;font-weight:700;margin-bottom:6px">Solicitar publicação</div>
        <div style="font-size:14px;color:var(--neutral-600);margin-bottom:16px">${pr.sourceName}</div>
        ${v.hasPublishRequestError && html`<div style="background:rgba(195,61,34,0.1);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;margin-bottom:14px">${v.publishRequestError}</div>`}
        ${v.publishRequestBusy && !blockers && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:16px 0">Verificando...</div>`}
        ${blockers && blockers.blocked ? html`
          <div style="font-size:14px;color:var(--neutral-800);margin-bottom:14px">Esta receita possui ${blockers.product_refs.length} produto(s) e ${blockers.category_refs.length} categoria(s) que ainda não pertencem ao catálogo público. Publique-os primeiro (ou edite a receita para remover/substituir a referência).</div>
          ${blockers.category_refs.map((ref) => html`
            <div key=${'c' + ref.id} style="display:flex;justify-content:space-between;align-items:center;background:var(--neutral-50);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:8px">
              <div style="font-size:13px;font-weight:600">${ref.name} <span style="color:var(--neutral-600);font-weight:400">(categoria)</span></div>
              <div onClick=${() => v.onOpenPublishRequestForBlocker('category', ref.id, ref.name)} style="font-size:12px;font-weight:700;color:var(--brand-700);cursor:pointer">Solicitar publicação</div>
            </div>
          `)}
          ${blockers.product_refs.map((ref) => html`
            <div key=${'p' + ref.id} style="display:flex;justify-content:space-between;align-items:center;background:var(--neutral-50);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:8px">
              <div style="font-size:13px;font-weight:600">${ref.name} <span style="color:var(--neutral-600);font-weight:400">(produto)</span></div>
              <div onClick=${() => v.onOpenPublishRequestForBlocker('product', ref.id, ref.name)} style="font-size:12px;font-weight:700;color:var(--brand-700);cursor:pointer">Solicitar publicação</div>
            </div>
          `)}
          <div style="font-size:12px;color:var(--neutral-600);margin-top:10px">Para substituir por um item público existente ou remover a referência, use "Editar Receita".</div>
          <div onClick=${v.onClosePublishRequest} style="margin-top:18px;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50)">Fechar</div>
        ` : (!v.publishRequestBusy || blockers) && html`
          <textarea placeholder="Motivo (opcional)" value=${pr.reasonValue} onInput=${v.onPublishReasonChange} rows="3" style="background:var(--neutral-0);color:var(--neutral-900);width:100%;padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:14px;resize:vertical;box-sizing:border-box"></textarea>
          <div style="display:flex;gap:10px;margin-top:16px">
            <div onClick=${v.onClosePublishRequest} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50)">Cancelar</div>
            <div onClick=${v.publishRequestBusy ? null : v.onConfirmPublishRequest} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer;color:#F4F2F1;background:var(--brand-700)">${v.publishRequestBusy ? 'Enviando...' : 'Enviar Solicitação'}</div>
          </div>
        `}
      </div>
    </div>
  `;
}

function renderRequestDetailModal(app, v) {
  const d = v.requestDetail;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.6);display:flex;align-items:center;justify-content:center;z-index:26;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div ref=${app.modalFocusRef('requestDetail')} role="dialog" aria-modal="true" aria-label=${d ? `Pedido ${d.code}` : 'Pedido'} tabindex="-1" className="yc-scroll" style="width:640px;max-width:100%;max-height:88%;overflow-y:auto;background:var(--neutral-0);border-radius:var(--radius-xl);padding:32px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease;outline:none">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div style="font-size:20px;font-weight:700">${d ? d.code : 'Pedido'}</div>
          <div onClick=${v.onCloseRequestDetail} aria-label="Fechar" role="button" tabindex="0" style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-900)" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"></path></svg>
          </div>
        </div>
        ${v.requestDetailLoading && html`<div style="text-align:center;color:var(--neutral-600);font-size:14px;padding:20px 0">Carregando...</div>`}
        ${v.hasRequestDetailError && html`
          <div style="padding:12px 0">
            <div style="color:var(--red-600);font-size:13px;font-weight:600;margin-bottom:10px">${v.requestDetailError}</div>
            <button onClick=${v.onRetryRequestDetail} style="background:var(--red-600);color:#F4F2F1;border:none;border-radius:var(--radius-full);padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer">Tentar novamente</button>
          </div>
        `}
        ${d && html`
          <div style="font-size:13px;color:var(--neutral-600);margin-bottom:4px">${d.entityLabel} · ${d.actionLabel} · ${d.statusLabel}</div>
          <div style="font-size:13px;color:var(--neutral-600);margin-bottom:4px">Solicitado por: <strong>${d.requesterName}</strong></div>
          ${d.sourceCode && html`<div style="font-size:13px;color:var(--neutral-600);margin-bottom:4px">Item original: ${d.sourceCode}</div>`}
          ${d.hasTargetCode && html`
            <div style="font-size:13px;color:var(--neutral-600);margin-bottom:4px">
              Item público: ${d.targetCode}
              ${d.canOpenTargetRecipe && html` · <span onClick=${d.onOpenTargetRecipe} style="color:var(--brand-700);font-weight:700;cursor:pointer;text-decoration:underline">Abrir receita publicada</span>`}
            </div>
          `}
          ${d.hasReason && html`<div style="font-size:13px;color:var(--neutral-800);margin-top:10px"><strong>Justificativa:</strong> ${d.reason}</div>`}
          ${d.hasAdminNote && html`<div style="font-size:13px;color:var(--red-600);margin-top:10px"><strong>Nota do admin:</strong> ${d.adminNote}</div>`}

          <div style="font-size:15px;font-weight:700;margin-top:18px;margin-bottom:8px">Histórico de revisões</div>
          ${d.revisionRows.map((rv) => html`
            <div key=${rv.key} style="display:flex;justify-content:space-between;background:var(--neutral-50);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:6px;font-size:13px">
              <div>Revisão ${rv.number} — ${rv.namePreview}${rv.message ? html` · "${rv.message}"` : ''}</div>
              <div style="color:var(--neutral-600)">${rv.dateLabel}</div>
            </div>
          `)}

          <div style="font-size:15px;font-weight:700;margin-top:18px;margin-bottom:8px">Dados enviados (última revisão)</div>
          <pre style="background:var(--neutral-50);border-radius:var(--radius-md);padding:14px;font-size:12px;overflow-x:auto;white-space:pre-wrap;word-break:break-word">${d.payloadPretty}</pre>

          ${v.hasRequestActionError && html`<div style="background:rgba(195,61,34,0.1);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;margin-top:14px">${v.requestActionError}</div>`}
          ${d.canReview && html`
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px;border-top:1px solid var(--neutral-100);padding-top:16px">
              <div onClick=${v.requestActionBusy ? null : v.onApproveDraft} style="font-size:13px;font-weight:700;color:var(--brand-700);cursor:pointer;border:1.5px solid var(--brand-500);padding:10px 16px;border-radius:var(--radius-full)">Aprovar como rascunho</div>
              <div onClick=${v.requestActionBusy ? null : v.onApproveAndPublish} style="font-size:13px;font-weight:700;color:#F4F2F1;cursor:pointer;background:var(--brand-700);padding:10px 16px;border-radius:var(--radius-full)">Aprovar e publicar</div>
              <div onClick=${v.onOpenReturnRequestModal} style="font-size:13px;font-weight:700;color:var(--neutral-800);cursor:pointer;border:1.5px solid var(--neutral-400);padding:10px 16px;border-radius:var(--radius-full)">Devolver para edição</div>
              <div onClick=${v.onOpenRejectRequestModal} style="font-size:13px;font-weight:700;color:var(--red-600);cursor:pointer;border:1.5px solid var(--red-600);padding:10px 16px;border-radius:var(--radius-full)">Rejeitar</div>
            </div>
          `}
        `}
      </div>
    </div>
  `;
}

function renderReturnRequestModal(app, v) {
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.7);display:flex;align-items:center;justify-content:center;z-index:28;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div style="width:420px;max-width:100%;background:var(--neutral-0);border-radius:var(--radius-xl);padding:28px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        <div style="font-size:20px;font-weight:700;margin-bottom:12px">Devolver para edição</div>
        <textarea placeholder="Explique o que precisa ser ajustado (obrigatório)" value=${v.returnNoteValue} onInput=${v.onReturnNoteChange} rows="4" style="background:var(--neutral-0);color:var(--neutral-900);width:100%;padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:14px;resize:vertical;box-sizing:border-box"></textarea>
        ${v.hasRequestActionError && html`<div style="color:var(--red-600);font-size:13px;font-weight:600;margin-top:10px">${v.requestActionError}</div>`}
        <div style="display:flex;gap:10px;margin-top:16px">
          <div onClick=${v.onCloseReturnRequestModal} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50)">Cancelar</div>
          <div onClick=${v.requestActionBusy ? null : v.onConfirmReturnRequest} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer;color:#F4F2F1;background:var(--brand-700)">${v.requestActionBusy ? 'Enviando...' : 'Devolver'}</div>
        </div>
      </div>
    </div>
  `;
}

function renderRejectRequestModal(app, v) {
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.7);display:flex;align-items:center;justify-content:center;z-index:28;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div style="width:420px;max-width:100%;background:var(--neutral-0);border-radius:var(--radius-xl);padding:28px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        <div style="font-size:20px;font-weight:700;margin-bottom:12px">Rejeitar solicitação</div>
        <textarea placeholder="Explique o motivo da rejeição (obrigatório)" value=${v.rejectNoteValue} onInput=${v.onRejectNoteChange} rows="4" style="background:var(--neutral-0);color:var(--neutral-900);width:100%;padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:14px;resize:vertical;box-sizing:border-box"></textarea>
        ${v.hasRequestActionError && html`<div style="color:var(--red-600);font-size:13px;font-weight:600;margin-top:10px">${v.requestActionError}</div>`}
        <div style="display:flex;gap:10px;margin-top:16px">
          <div onClick=${v.onCloseRejectRequestModal} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50)">Cancelar</div>
          <div onClick=${v.requestActionBusy ? null : v.onConfirmRejectRequest} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer;color:#F4F2F1;background:var(--red-600)">${v.requestActionBusy ? 'Enviando...' : 'Rejeitar'}</div>
        </div>
      </div>
    </div>
  `;
}

// ==== Catálogo Público: form modals (admin) ====
function renderSiteRecipeFormModal(app, v) {
  const f = v.siteRecipeForm;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:20;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div className="yc-scroll" style="width:820px;max-width:100%;max-height:90%;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;background:var(--neutral-0);border-radius:var(--radius-xl);padding:32px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        <div style="font-size:22px;font-weight:700;margin-bottom:20px">${v.siteRecipeFormTitle}</div>
        ${v.hasSiteFormError && html`<div style="background:rgba(195,61,34,0.1);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;margin-bottom:14px">${v.siteFormError}</div>`}
        <div className="yc-form-grid">
          ${field('Nome da receita', html`<input type="text" value=${f.name} onInput=${v.siteRecipeFormOnName} style=${FORM_INPUT_STYLE}/>`, { required: true, span: 2 })}
          ${field('Categoria', html`<${CustomSelect} options=${v.siteRecipeCategoryOptions} value=${f.categoryId} onChange=${v.siteRecipeFormOnCategorySet} />`, { required: true })}
          ${field('Nível de dificuldade', html`<${CustomSelect} options=${v.dificuldadeOptionsMy} value=${f.difficulty} onChange=${v.siteRecipeFormOnDifficultySet} />`, { required: true })}
          ${field('Tempo de preparo (minutos)', html`<input type="number" value=${f.prepTime} onInput=${v.siteRecipeFormOnPrepTime} style=${FORM_INPUT_STYLE}/>`)}
          ${field('Número de porções', html`<input type="number" value=${f.servings} onInput=${v.siteRecipeFormOnServings} style=${FORM_INPUT_STYLE}/>`)}
          ${field('Status', html`<${CustomSelect} options=${v.siteRecipeStatusOptions} value=${f.status} onChange=${v.siteRecipeFormOnStatusSet} />`, { required: true })}
          ${field('URL da imagem', html`<input type="text" value=${f.imageUrl} onInput=${v.siteRecipeFormOnImageUrl} style=${FORM_INPUT_STYLE}/>`, { span: 2 })}
        </div>

        <label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;color:var(--neutral-900);margin-top:14px;flex-wrap:wrap"><input type="checkbox" checked=${!!f.featured} onChange=${v.siteRecipeFormOnFeatured}/> Receita do Dia (destaque na Home)</label>

        <div style="font-size:15px;font-weight:700;margin-top:20px;margin-bottom:6px">Seções (opcional)</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:6px">
          ${v.siteRecipeSectionRows.map((row) => html`
            <label key=${row.key} style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;color:var(--neutral-900)"><input type="checkbox" checked=${row.checked} onChange=${row.onToggle}/> ${row.label}</label>
          `)}
        </div>

        <div style="font-size:15px;font-weight:700;margin-top:16px;margin-bottom:10px">Ingredientes (produtos do catálogo)</div>
        ${v.siteRecipeIngredientRows.map((row) => html`
          <div key=${row.idx}>
            <div style="display:flex;gap:10px;margin-bottom:${row.confirming ? '4px' : '10px'};align-items:center;flex-wrap:wrap">
              <div style="flex:1;min-width:160px"><${CustomSelect} options=${v.siteProductOptionsForIngredients} value=${row.productId} onChange=${row.onProductSet} /></div>
              <input type="number" step="0.1" value=${row.quantity} onInput=${row.onQuantityChange} style="background:var(--neutral-0);color:var(--neutral-900);width:90px;padding:10px 12px;border-radius:var(--radius-sm);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:13px"/>
              <div onClick=${row.onRemove} style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C33D22" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"></path></svg>
              </div>
            </div>
            ${row.confirming && html`
              <div style="background:rgba(195,61,34,0.06);border:1px solid var(--red-500);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:10px">
                <div style="font-size:13px;font-weight:600;margin-bottom:2px">Remover "${row.confirmProductName}" desta receita?</div>
                <div style="font-size:12px;color:var(--neutral-600);margin-bottom:2px">${row.confirmDetailLabel}</div>
                <div style="font-size:12px;color:var(--neutral-600);margin-bottom:8px">${row.confirmUsageLabel}</div>
                <div style="display:flex;gap:8px">
                  <div onClick=${row.onCancelRemove} style="padding:8px 14px;border-radius:var(--radius-full);background:var(--neutral-50);color:var(--neutral-800);font-weight:600;font-size:12px;cursor:pointer">Cancelar</div>
                  <div onClick=${row.onConfirmRemove} style="padding:8px 14px;border-radius:var(--radius-full);background:var(--red-600);color:#F4F2F1;font-weight:700;font-size:12px;cursor:pointer">Remover ingrediente</div>
                </div>
              </div>
            `}
          </div>
        `)}
        <div onClick=${v.onAddSiteRecipeIngredient} style="font-size:13px;font-weight:700;color:var(--brand-700);cursor:pointer;margin-bottom:6px">+ Adicionar ingrediente</div>
        ${v.siteRecipeIngredientRows.length > 0 && html`<div style="font-size:13px;font-weight:700;color:var(--neutral-800);margin-top:4px">Custo estimado dos ingredientes: ${v.siteIngredientTotalCostLabel}</div>`}

        <div style="font-size:15px;font-weight:700;margin-top:20px;margin-bottom:8px">Outros itens necessários (um por linha)</div>
        <textarea value=${f.extrasText} onInput=${v.siteRecipeFormOnExtras} rows="3" style="background:var(--neutral-0);color:var(--neutral-900);width:100%;padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:14px;resize:vertical"></textarea>

        <div style="font-size:15px;font-weight:700;margin-top:20px;margin-bottom:8px">Modo de preparo (um passo por linha)</div>
        <textarea value=${f.instructionsText} onInput=${v.siteRecipeFormOnInstructions} rows="5" style="background:var(--neutral-0);color:var(--neutral-900);width:100%;padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-family:var(--font-sans);font-size:14px;resize:vertical"></textarea>

        ${field('Dicas (uma por linha)', html`<textarea value=${f.tipsText} onInput=${v.siteRecipeFormOnTips} rows="3" style=${FORM_TEXTAREA_STYLE}></textarea>`, { span: 2 })}

        <div style="display:flex;gap:10px;margin-top:24px;flex-wrap:wrap">
          <div onClick=${v.onCancelSiteRecipeForm} style="flex:1;min-width:120px;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50);transition:transform 0.15s ease">Cancelar</div>
          <div onClick=${v.onSaveSiteRecipeForm} style="flex:1;min-width:120px;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer;color:#F4F2F1;background:var(--brand-700);transition:transform 0.15s ease">Salvar</div>
        </div>
      </div>
    </div>
  `;
}

function renderSiteProductFormModal(app, v) {
  const f = v.siteProductForm;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:20;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div style="width:440px;max-width:100%;background:var(--neutral-0);border-radius:var(--radius-xl);padding:28px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        <div style="font-size:20px;font-weight:700;margin-bottom:18px">${v.siteProductFormTitle}</div>
        ${v.hasSiteFormError && html`<div style="background:rgba(195,61,34,0.1);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;margin-bottom:14px">${v.siteFormError}</div>`}
        <div style="display:flex;flex-direction:column;gap:14px">
          ${field('Nome do produto', html`<input type="text" value=${f.name} onInput=${v.siteProductFormOnName} style=${FORM_INPUT_STYLE}/>`, { required: true })}
          ${field('Categoria (proteína/produto)', html`<${CustomSelect} options=${v.siteProteinCategoryOptions} value=${f.categoryId} onChange=${v.siteProductFormOnCategorySet} />`, { required: true })}
          ${field('Unidade', html`<${CustomSelect} options=${v.unidadeOptionsSite} value=${f.unit} onChange=${v.siteProductFormOnUnitSet} />`, { required: true })}
          ${field('Preço (R$)', html`<input type="number" step="0.01" value=${f.price} onInput=${v.siteProductFormOnPrice} style=${FORM_INPUT_STYLE}/>`, { required: true })}
          ${field('URL da imagem (opcional)', html`<input type="text" value=${f.imageUrl} onInput=${v.siteProductFormOnImageUrl} style=${FORM_INPUT_STYLE}/>`)}
          <label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;color:var(--neutral-900);flex-wrap:wrap"><input type="checkbox" checked=${!!f.active} onChange=${v.siteProductFormOnActive}/> Ativo (visível publicamente)</label>
        </div>

        <div style="font-size:15px;font-weight:700;margin-top:20px;margin-bottom:6px">Seções (opcional)</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:6px">
          ${v.siteProductSectionRows.map((row) => html`
            <label key=${row.key} style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;color:var(--neutral-900)"><input type="checkbox" checked=${row.checked} onChange=${row.onToggle}/> ${row.label}</label>
          `)}
        </div>

        <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap">
          <div onClick=${v.onCancelSiteProductForm} style="flex:1;min-width:120px;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50);transition:transform 0.15s ease">Cancelar</div>
          <div onClick=${v.onSaveSiteProductForm} style="flex:1;min-width:120px;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer;color:#F4F2F1;background:var(--brand-700);transition:transform 0.15s ease">Salvar</div>
        </div>
      </div>
    </div>
  `;
}

function renderSiteCategoryFormModal(app, v) {
  const f = v.siteCategoryForm;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:20;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div style="width:420px;max-width:100%;background:var(--neutral-0);border-radius:var(--radius-xl);padding:28px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        <div style="font-size:20px;font-weight:700;margin-bottom:18px">${v.siteCategoryFormTitle}</div>
        ${v.hasSiteFormError && html`<div style="background:rgba(195,61,34,0.1);border:1px solid var(--red-500);color:var(--red-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;margin-bottom:14px">${v.siteFormError}</div>`}
        <div style="display:flex;flex-direction:column;gap:14px">
          ${field('Nome da categoria', html`<input type="text" value=${f.name} onInput=${v.siteCategoryFormOnName} style=${FORM_INPUT_STYLE}/>`, { required: true })}
          ${field('Tipo', html`<${CustomSelect} options=${v.siteCategoryTypeOptions} value=${f.type} onChange=${v.siteCategoryFormOnTypeSet} />`, { required: true })}
          <label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;color:var(--neutral-900);flex-wrap:wrap"><input type="checkbox" checked=${!!f.active} onChange=${v.siteCategoryFormOnActive}/> Ativa (visível publicamente)</label>
        </div>
        <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap">
          <div onClick=${v.onCancelSiteCategoryForm} style="flex:1;min-width:120px;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50);transition:transform 0.15s ease">Cancelar</div>
          <div onClick=${v.onSaveSiteCategoryForm} style="flex:1;min-width:120px;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer;color:#F4F2F1;background:var(--brand-700);transition:transform 0.15s ease">Salvar</div>
        </div>
      </div>
    </div>
  `;
}

function renderImportModal(app, v) {
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:30;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div className="yc-scroll" style="width:640px;max-width:100%;max-height:88%;overflow-y:auto;background:var(--neutral-0);border-radius:var(--radius-xl);padding:32px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:22px;font-weight:700">Importar Planilha (.xlsx, .xls, .csv)</div>
          <div onClick=${v.onCloseImportModal} style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-900)" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"></path></svg>
          </div>
        </div>

        ${v.importStepInstructions && html`
          <div style="font-size:14px;color:var(--neutral-600);margin-bottom:18px">Envie um arquivo <strong>.xlsx</strong> com três abas: <strong>Categorias</strong>, <strong>Produtos</strong> e <strong>Receitas</strong>. Veja o modelo esperado abaixo antes de enviar.</div>

          <div style="background:var(--neutral-50);border-radius:var(--radius-md);padding:16px;margin-bottom:12px">
            <div style="font-weight:700;font-size:14px;margin-bottom:8px">Aba "Produtos"</div>
            <div style="font-size:13px;color:var(--neutral-800);line-height:1.8">
              <strong>nome</strong> — obrigatório<br/>
              <strong>categoria</strong> — obrigatório, uma de: ${v.categoriasProdutoList}<br/>
              <strong>unidade</strong> — obrigatório: kg, un, pacote, caixa, pote<br/>
              <strong>preco</strong> — obrigatório, número (ex: 34.90)<br/>
              <strong>imagem</strong> — obrigatório, URL completa da foto (http ou https)
            </div>
          </div>
          <div style="background:var(--neutral-50);border-radius:var(--radius-md);padding:16px;margin-bottom:16px">
            <div style="font-weight:700;font-size:14px;margin-bottom:8px">Aba "Receitas"</div>
            <div style="font-size:13px;color:var(--neutral-800);line-height:1.8">
              <strong>nome</strong> — obrigatório<br/>
              <strong>categoria</strong> — obrigatório: ${v.categoriasReceitaList}<br/>
              <strong>tempo</strong> — minutos (número), obrigatório<br/>
              <strong>porcoes</strong> — número, obrigatório<br/>
              <strong>dificuldade</strong> — Fácil, Médio ou Difícil<br/>
              <strong>imagem</strong> — URL da foto (opcional)<br/>
              <strong>tags</strong> — opcional, separadas por vírgula: destaque, recomendado, pratico, ocasiao, rapido, churrasco, petisco<br/>
              <strong>ingredientes</strong> — obrigatório. Nome do produto e quantidade, separados por dois-pontos; itens separados por ponto e vírgula. Ex: <em>Picanha:1.5; Sal Grosso:0.2</em><br/>
              <strong>extras</strong> — opcional, itens separados por ponto e vírgula<br/>
              <strong>modoPreparo</strong> — obrigatório, passos separados por ponto e vírgula<br/>
              <strong>dicas</strong> — opcional, itens separados por ponto e vírgula
            </div>
          </div>
          <div style="background:var(--neutral-50);border-radius:var(--radius-md);padding:16px;margin-bottom:16px">
            <div style="font-weight:700;font-size:14px;margin-bottom:8px">Aba "Categorias" (opcional, mas recomendada)</div>
            <div style="font-size:13px;color:var(--neutral-800);line-height:1.8">
              <strong>tipo</strong> — obrigatório: "proteina" (categoria de produto), "receita" (categoria de receita) ou "secao" (seção da home)<br/>
              <strong>nome</strong> — obrigatório, nome da nova categoria ou seção<br/>
              Use esta aba para declarar as categorias/seções que ainda não existem no app antes de referenciá-las nas abas Produtos e Receitas.
            </div>
          </div>
          <div onClick=${v.onDownloadTemplate} style="text-align:center;padding:12px;border-radius:var(--radius-md);border:1.5px solid var(--brand-500);color:var(--brand-700);font-weight:700;font-size:14px;cursor:pointer;margin-bottom:18px">Baixar modelo (.xlsx)</div>

          <label style="display:block;border:2px dashed var(--neutral-200);border-radius:var(--radius-md);padding:24px;text-align:center;cursor:pointer;color:var(--neutral-600);font-size:14px">
            Clique para selecionar o arquivo .xlsx, .xls ou .csv
            <input key=${v.importFileInputKey} type="file" accept=".xlsx,.xls,.csv" onChange=${v.onImportFileChange} style="display:none"/>
          </label>
          ${v.hasImportParseError && html`<div style="color:var(--red-600);font-size:13px;margin-top:10px;font-weight:600">${v.importParseError}</div>`}
        `}

        ${v.importStepResult && html`
          <div style="font-size:14px;color:var(--neutral-800);margin-bottom:14px">Arquivo: <strong>${v.importFileName}</strong> — ${v.importCategoriesCount} categorias, ${v.importProductsCount} produtos e ${v.importRecipesCount} receitas encontrados.</div>
          ${v.importSummary && html`
            <div style="background:var(--neutral-50);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:14px;font-size:13px;color:var(--neutral-800)">
              <strong>Resumo:</strong> ${v.importSummary.totalRows} linha(s) nas três abas; ${v.importSummary.invalid} erro(s) de validação.
            </div>
          `}
          ${v.importResult && html`<div style="background:rgba(52,178,62,0.1);border:1px solid var(--green-500);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:14px;font-size:13px;color:var(--green-600);font-weight:700">${v.importResult}</div>`}
          ${v.hasImportParseError && html`<div role="alert" style="background:rgba(195,61,34,0.08);border:1px solid var(--red-500);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:14px;font-size:13px;color:var(--red-600);font-weight:600">${v.importParseError}</div>`}
          ${v.hasImportNewCategories && html`
            <div style="background:rgba(52,178,62,0.1);border:1px solid var(--green-500);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:14px;font-size:13px;color:var(--neutral-800)">
              Novas categorias/seções a adicionar: ${v.importNewProductCategoriesList}
            </div>
          `}

          ${v.hasImportErrors && html`
            <div style="background:rgba(195,61,34,0.08);border:1px solid var(--red-500);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:14px;max-height:180px;overflow-y:auto">
              <div style="font-weight:700;font-size:14px;color:var(--red-600);margin-bottom:6px">Erros encontrados — corrija a planilha e envie novamente</div>
              ${v.importErrors.map((err, i) => html`<div key=${i} style="font-size:13px;color:var(--red-600);margin-bottom:4px">• ${err}</div>`)}
            </div>
          `}

          ${v.hasImportWarnings && html`
            <div style="background:rgba(207,176,23,0.12);border:1px solid var(--yellow-500);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:14px;max-height:180px;overflow-y:auto">
              <div style="font-weight:700;font-size:14px;color:var(--yellow-600);margin-bottom:6px">Avisos — seções não cadastradas usadas em receitas</div>
              ${v.importWarnings.map((warn, i) => html`<div key=${i} style="font-size:13px;color:var(--neutral-800);margin-bottom:4px">• ${warn}</div>`)}
            </div>
          `}

          ${v.importCanProceed && html`
            <div style="font-weight:700;font-size:14px;margin-bottom:10px">Como deseja importar cada grupo?</div>
            ${[
              ['categories', 'Categorias', v.importCategoriesCount],
              ['products', 'Produtos', v.importProductsCount],
              ['recipes', 'Receitas', v.importRecipesCount],
            ].map(([key, label, count]) => html`
              <div key=${key} style="display:grid;grid-template-columns:minmax(100px,1fr) minmax(220px,2fr);gap:12px;align-items:center;padding:12px 14px;border:1.5px solid var(--neutral-200);border-radius:var(--radius-md);margin-bottom:10px">
                <div><strong>${label}</strong><div style="font-size:12px;color:var(--neutral-600)">${count} item(ns)</div></div>
                <${CustomSelect}
                  ariaLabel=${`Modo de importação de ${label}`}
                  options=${[
                    { value: 'add', label: 'Adicionar (ignorar equivalentes)' },
                    { value: 'upsert', label: 'Substituir equivalentes' },
                    { value: 'replace_all', label: 'Substituir tudo' },
                  ]}
                  value=${v.importModes[key]}
                  onChange=${mode => v.onSetImportMode(key, mode)}
                />
              </div>
            `)}
            <div style="font-size:12px;color:var(--neutral-600);line-height:1.5">As escolhas são independentes. Categorias e produtos ainda não cadastrados podem ser declarados nas respectivas abas e serão tratados conforme a opção selecionada.</div>
          `}

          <div style="display:flex;gap:10px;margin-top:20px">
            <div onClick=${v.importResult ? v.onNewImport : v.onBackToInstructions} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50)">${v.importResult ? 'Nova Importação' : 'Voltar'}</div>
            ${v.importCanProceed && html`<div onClick=${v.onConfirmImport} style=${`flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:${v.importBusy ? 'not-allowed' : 'pointer'};color:#F4F2F1;background:${v.importBusy ? 'var(--neutral-300)' : 'var(--brand-700)'}`}>${v.importBusy ? 'Importando...' : 'Confirmar Importação'}</div>`}
          </div>
        `}
      </div>
    </div>
  `;
}
