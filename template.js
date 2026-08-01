import { html } from './vendor/htm-preact-standalone.js';
import { CustomSelect } from './custom-select.js';

export function renderApp(app) {
  const v = app.computeViewModel();
  return html`
    <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:var(--neutral-800)">
      <div ref=${(el) => { app.frameRef.current = el; }} className=${v.appThemeClass} style=${`width:100%;max-width:${v.frameMaxWidth};height:100%;max-height:${v.frameMaxHeight};min-height:480px;margin:0 auto;background:var(--neutral-0);position:relative;overflow:hidden;font-family:var(--font-sans);color:var(--neutral-900);box-shadow:var(--shadow-lg);transition:background 0.2s ease,color 0.2s ease,max-width 0.2s ease,max-height 0.2s ease`}>

        <div ref=${(el) => { app.scrollRef.current = el; }} className="yc-scroll" style=${`position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;padding-bottom:${v.scrollBottomPad}px`}>
          <div ref=${(el) => { app.stageRef.current = el; }} style=${`padding-left:${v.stagePadLeft}px;padding-right:${v.stagePadRight}px;transition:padding 0.2s ease`}>

            ${v.notLoaded && html`<div style="display:flex;align-items:center;justify-content:center;height:70vh;color:var(--neutral-600);font-size:15px">Carregando receitas...</div>`}
            ${v.isHome && renderHome(app, v)}
            ${renderCustomSections(app, v)}
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
        ${v.showBottomTabBar && renderBottomTabBar(app, v)}
        ${v.showSideNavRail && renderSideNavRail(app, v)}
        ${v.showProfileSetup && renderProfileSetupModal(app, v)}
        ${v.salesModalOpen && renderSalesModal(app, v)}
        ${v.altModalOpen && renderAltModal(app, v)}
        ${v.confirmDeleteOpen && renderConfirmDeleteModal(app, v)}
        ${v.showRecipeForm && renderRecipeFormModal(app, v)}
        ${v.showProductForm && renderProductFormModal(app, v)}
        ${v.showImportModal && renderImportModal(app, v)}
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
    </div>

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

    <div style="padding:20px 0 4px">
      <div className="yc-scroll" style="display:flex;gap:10px;overflow-x:auto;padding:0 40px">
        ${v.homeCategoryChips.map((chip) => html`<div key=${chip.label} onClick=${chip.onClick} style="flex-shrink:0;padding:10px 20px;border-radius:var(--radius-full);background:var(--neutral-50);border:1px solid var(--neutral-100);font-size:13px;font-weight:600;color:var(--neutral-800);cursor:pointer;white-space:nowrap">${chip.label}</div>`)}
      </div>
    </div>

    ${carouselSection(html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M12 2l2.4 6.8L21 11l-6.6 2.2L12 20l-2.4-6.8L3 11l6.6-2.2L12 2z"></path></svg>`, 'Recomendados', v.recommendedList, v.goSearch)}
    ${carouselSection(html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path></svg>`, 'Práticos para o Dia a Dia', v.practicalList, v.goSearch)}
    ${carouselSection(html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M20 12v9H4v-9M2 7h20v5H2V7zM12 7v14M12 7c-1.5-3-6-3-6 0s4.5 1.5 6 0zM12 7c1.5-3 6-3 6 0s-4.5 1.5-6 0z"></path></svg>`, 'Ocasiões Especiais', v.occasionList, v.goSearch)}
    ${carouselSection(html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M13 2L5 14h6l-1 8 9-12h-6l1-8z"></path></svg>`, 'Pronto em 30 Minutos', v.quickList, v.goSearch)}
    ${carouselSection(html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><path d="M12 3c1 3-1 4-1 6 0 1.5 1 2 2 2 1.5 0 2-1.5 1.5-3 2.5 1.5 4 4.5 4 7.5 0 3.6-3.6 6.5-8 6.5s-8-2.9-8-6.5c0-3 1.5-5.8 3.5-7.8-.3 1.3.2 2.3 1 2.8.3-3 1.7-5.5 5-7.5z"></path></svg>`, 'Direto da Churrasqueira', v.churrascoList, v.goSearch)}
    ${carouselSection(html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2"><circle cx="12" cy="13" r="7"></circle><path d="M12 6V3M8 3h8"></path></svg>`, 'Petiscos para Compartilhar', v.snackList, v.goSearch)}
  `;
}

function renderCustomSections(app, v) {
  return html`${v.customHomeSectionBlocks.map((sec) => html`
    <div key=${sec.key} style="padding:18px 0 18px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 40px;margin-bottom:14px">
        <div style="font-size:20px;font-weight:700;letter-spacing:-0.01em">${sec.label}</div>
        <div onClick=${v.goSearch} style="font-size:13px;font-weight:600;color:var(--brand-700);cursor:pointer">Ver todos</div>
      </div>
      <div className="yc-scroll" style="display:flex;gap:16px;overflow-x:auto;padding:0 40px 8px">
        ${sec.items.map(recipeCard)}
      </div>
    </div>
  `)}`;
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
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--brand-700);color:#F4F2F1;border-radius:var(--radius-md);padding:22px 16px 14px;margin-bottom:14px;position:sticky;top:0;z-index:2;box-shadow:var(--shadow-sm);animation:ycFadeIn 0.2s ease">
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
            <div style="font-size:22px;font-weight:700">${v.profile.nome}</div>
            <div style="font-size:14px;color:var(--neutral-600);margin-top:4px">${v.profile.cargo} · ${v.profile.idade} anos · ${v.profile.genero}</div>
            <div style="font-size:13px;color:var(--brand-700);font-weight:600;margin-top:8px">${v.favoritesCount} receitas favoritas</div>
          </div>
          <div onClick=${v.onEditProfile} style="font-size:14px;font-weight:600;color:var(--brand-700);cursor:pointer;border:1.5px solid var(--brand-700);padding:10px 16px;border-radius:var(--radius-full);transition:transform 0.15s ease">Editar</div>
        </div>
      `}

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
            <div style="font-size:16px;font-weight:600">Modo Administrador</div>
            <div style="font-size:13px;color:var(--neutral-600)">${v.adminStatusLabel}</div>
          </div>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-400)" stroke-width="2"><path d="M9 6l6 6-6 6"></path></svg>
      </div>
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
    { onClick: v.goHome, color: v.navHomeColor, label: 'Início', path: html`<path d="M4 11l8-7 8 7"></path><path d="M6 9.5V20h12V9.5"></path>` },
    { onClick: v.goSearch, color: v.navSearchColor, label: 'Buscar', path: html`<circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path>` },
    { onClick: v.goFavorites, color: v.navFavColor, label: 'Favoritos', path: html`<path d="M12 21s-7.5-4.6-10-9.3C.4 8.3 2 4.5 5.6 4c2-.3 3.9.6 5 2.2C11.7 4.6 13.6 3.7 15.6 4c3.6.5 5.2 4.3 3.6 7.7C19.5 16.4 12 21 12 21z"></path>` },
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
          <input type="text" placeholder="Nome" value=${f.nome} onInput=${v.onProfileNomeChange} style="background:var(--neutral-0);color:var(--neutral-900);padding:14px 16px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-size:15px;font-family:var(--font-sans)"/>
          <input type="number" placeholder="Idade" value=${f.idade} onInput=${v.onProfileIdadeChange} style="background:var(--neutral-0);color:var(--neutral-900);padding:14px 16px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-size:15px;font-family:var(--font-sans)"/>
          <${CustomSelect} options=${v.generoOptions} value=${f.genero} onChange=${v.onProfileGeneroSet} />
          <input type="text" placeholder="Cargo (ex: Dono de Açougue, Chef, Comprador)" value=${f.cargo} onInput=${v.onProfileCargoChange} style="background:var(--neutral-0);color:var(--neutral-900);padding:14px 16px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);font-size:15px;font-family:var(--font-sans)"/>
        </div>
        <div onClick=${v.onSaveProfile} style="margin-top:24px;background:var(--brand-700);color:#F4F2F1;text-align:center;padding:16px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer">Salvar</div>
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
      <div style="width:420px;max-width:100%;background:var(--neutral-0);border-radius:var(--radius-xl);padding:28px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
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
    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--brand-700);color:#F4F2F1;border-radius:var(--radius-md);padding:22px 16px 14px;margin-bottom:14px;position:sticky;top:0;z-index:2;box-shadow:var(--shadow-sm);animation:ycFadeIn 0.2s ease">
      <div style="font-size:14px;font-weight:600">${count}</div>
      <div style="display:flex;gap:10px">
        ${extraAction}
        <div onClick=${onDelete} style="font-size:13px;font-weight:700;cursor:pointer;padding:8px 14px;border-radius:var(--radius-full);background:rgba(244,242,241,0.18)">Excluir</div>
        <div onClick=${onCancel} style="font-size:13px;font-weight:700;cursor:pointer;padding:8px 14px;border-radius:var(--radius-full);background:rgba(244,242,241,0.18)">Cancelar</div>
      </div>
    </div>
  `;
}

function renderAdminRecipesTab(app, v) {
  return html`
    <div style="padding:8px 40px 24px">
      <div onClick=${v.onNewRecipe} style="display:flex;align-items:center;justify-content:center;gap:8px;background:var(--brand-700);color:#F4F2F1;border-radius:var(--radius-md);padding:14px;font-weight:600;font-size:15px;cursor:pointer;margin-bottom:18px;transition:transform 0.15s ease">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F4F2F1" stroke-width="2.4"><path d="M12 5v14M5 12h14"></path></svg>
        Nova Receita
      </div>
      ${v.selectionMode && selectionBar(v.selectedCountLabel, v.onBulkDeleteAsk, v.onCancelSelection, html`<div onClick=${v.onBulkHideAsk} style="font-size:13px;font-weight:700;cursor:pointer;padding:8px 14px;border-radius:var(--radius-full);background:rgba(244,242,241,0.18)">Ocultar</div>`)}
      ${v.adminRecipeRows.map((row) => html`
        <div key=${row.id} onMouseDown=${row.onPressStart} onMouseUp=${row.onPressEnd} onMouseLeave=${row.onPressEnd} onTouchStart=${row.onPressStart} onTouchEnd=${row.onPressEnd} onClick=${row.onRowClick} style=${row.rowStyle}>
          ${row.showCheckbox && html`<div style=${row.checkboxStyle}>${row.checkMark}</div>`}
          <img loading="lazy" decoding="async" src=${row.imagem} style=${`width:52px;height:52px;border-radius:var(--radius-sm);object-fit:cover;flex-shrink:0;opacity:${row.imgOpacity}`}/>
          <div style="flex:1">
            <div style="font-size:15px;font-weight:600">${row.nome}${row.isHidden ? html` <span style="font-size:11px;font-weight:700;color:var(--neutral-600);background:var(--neutral-50);border:1px solid var(--neutral-100);padding:2px 8px;border-radius:var(--radius-full);margin-left:6px">Oculta</span>` : ''}</div>
            <div style="font-size:12px;color:var(--neutral-600)">${row.categoria} · ${row.tempoLabel} · ${row.dificuldade}</div>
          </div>
          ${row.showActions && html`
            <div style="position:relative">
              <div onClick=${row.onToggleMenu} style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform 0.15s ease,background 0.15s ease">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--neutral-600)"><circle cx="5" cy="12" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle></svg>
              </div>
              ${row.menuOpen && html`
                <div style="position:absolute;top:42px;right:0;background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-md);box-shadow:var(--shadow-md);min-width:170px;z-index:6;overflow:hidden;animation:ycSelectIn 0.15s cubic-bezier(0.22,0.8,0.24,1)">
                  <div onClick=${row.onEdit} style="padding:12px 16px;font-size:14px;font-weight:600;cursor:pointer;color:var(--neutral-900)">Editar Receita</div>
                  <div onClick=${row.onDuplicate} style="padding:12px 16px;font-size:14px;font-weight:600;cursor:pointer;color:var(--neutral-900);border-top:1px solid var(--neutral-100)">Duplicar Receita</div>
                  <div onClick=${row.onToggleHide} style="padding:12px 16px;font-size:14px;font-weight:600;cursor:pointer;color:var(--neutral-900);border-top:1px solid var(--neutral-100)">${row.hideLabel}</div>
                </div>
              `}
            </div>
            <div onClick=${row.onDelete} style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform 0.15s ease,background 0.15s ease">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C33D22" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg>
            </div>
          `}
        </div>
      `)}
    </div>
  `;
}

function toggleRow(row) {
  return html`
    <div key=${row.key} onMouseDown=${row.onPressStart} onMouseUp=${row.onPressEnd} onMouseLeave=${row.onPressEnd} onTouchStart=${row.onPressStart} onTouchEnd=${row.onPressEnd} onClick=${row.onRowClick} style=${row.rowStyle}>
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

function renderAdminCategoriesTab(app, v) {
  return html`
    <div style="padding:8px 40px 24px">
      <div style="font-size:15px;font-weight:700;margin-bottom:4px">Receita do Dia</div>
      <div style="font-size:13px;color:var(--neutral-600);margin-bottom:14px">Selecione uma ou mais receitas para aparecerem no carrossel de destaque da Home.</div>
      ${v.destaqueRecipeRows.map((row) => html`
        <div key=${row.id} onClick=${row.onToggle} style=${row.rowStyle}>
          <div style=${row.checkboxStyle}>${row.checkMark}</div>
          <img loading="lazy" decoding="async" src=${row.imagem} style="width:44px;height:44px;border-radius:var(--radius-sm);object-fit:cover;flex-shrink:0"/>
          <div style="font-size:14px;font-weight:600;flex:1">${row.nome}</div>
        </div>
      `)}

      <div style="font-size:15px;font-weight:700;margin-top:26px;margin-bottom:4px">Seções da Home</div>
      <div style="font-size:13px;color:var(--neutral-600);margin-bottom:14px">Escolha, adicione ou remova as seções que aparecem na tela inicial. Segure uma seção para selecionar várias e excluir de uma vez.</div>
      ${v.sectionSelectionMode && selectionBar(v.selectedSectionCountLabel, v.onBulkDeleteSectionsAsk, v.onCancelSectionSelection)}
      ${v.sectionToggleRows.map(toggleRow)}
      <div style="display:flex;gap:10px;margin-top:6px">
        <input type="text" placeholder="Nova seção (ex: Sopas de Inverno)" value=${v.newSectionLabel} onInput=${v.onNewSectionLabelChange} style="flex:1;padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid var(--neutral-200);background:var(--neutral-0);color:var(--neutral-900);font-family:var(--font-sans);font-size:14px"/>
        <div onClick=${v.onAddSection} style="padding:12px 18px;border-radius:var(--radius-md);background:var(--brand-700);color:#F4F2F1;font-weight:700;font-size:14px;cursor:pointer;white-space:nowrap">+ Adicionar</div>
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

function renderAdminProductsTab(app, v) {
  return html`
    <div style="padding:8px 40px 24px">
      <div onClick=${v.onNewProduct} style="display:flex;align-items:center;justify-content:center;gap:8px;background:var(--brand-700);color:#F4F2F1;border-radius:var(--radius-md);padding:14px;font-weight:600;font-size:15px;cursor:pointer;margin-bottom:18px;transition:transform 0.15s ease">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F4F2F1" stroke-width="2.4"><path d="M12 5v14M5 12h14"></path></svg>
        Novo Produto
      </div>
      ${v.productSelectionMode && selectionBar(v.selectedProductCountLabel, v.onBulkDeleteProductsAsk, v.onCancelProductSelection)}
      ${v.adminProductRows.map((row) => html`
        <div key=${row.id} onMouseDown=${row.onPressStart} onMouseUp=${row.onPressEnd} onMouseLeave=${row.onPressEnd} onTouchStart=${row.onPressStart} onTouchEnd=${row.onPressEnd} onClick=${row.onRowClick} style=${row.rowStyle}>
          ${row.showCheckbox && html`<div style=${row.checkboxStyle}>${row.checkMark}</div>`}
          <div style="flex:1">
            <div style="font-size:15px;font-weight:600">${row.nome}</div>
            <div style="font-size:12px;color:var(--neutral-600)">${row.categoria} · por ${row.unidade}</div>
          </div>
          ${row.showActions && html`
            ${row.isEditing && html`
              <input type="number" step="0.01" value=${row.editPriceValue} onInput=${row.onEditPriceChange} style="background:var(--neutral-0);color:var(--neutral-900);width:100px;padding:8px 10px;border-radius:var(--radius-sm);border:1.5px solid var(--brand-500);font-family:var(--font-sans);font-size:14px"/>
              <div onClick=${row.onSavePrice} style="font-size:13px;font-weight:700;color:var(--green-600);cursor:pointer;padding:8px 10px">Salvar</div>
            `}
            ${row.isNotEditing && html`<div onClick=${row.onStartEditPrice} style="font-size:15px;font-weight:700;color:var(--brand-700);cursor:pointer">${row.precoLabel}</div>`}
            <div onClick=${row.onDelete} style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform 0.15s ease,background 0.15s ease">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C33D22" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg>
            </div>
          `}
        </div>
      `)}
    </div>
  `;
}

function renderAdmin(app, v) {
  return html`
    <div style="padding:32px 40px 16px;display:flex;align-items:center;gap:16px">
      <div onClick=${v.onBackFromAdmin} style="width:40px;height:40px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform 0.15s ease">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-900)" stroke-width="2.2"><path d="M15 18l-6-6 6-6"></path></svg>
      </div>
      <div style="font-size:26px;font-weight:700;letter-spacing:-0.02em">Modo Administrador</div>
    </div>

    <div className="yc-scroll" style="padding:0 40px 16px;display:flex;gap:10px;overflow-x:auto;flex-wrap:nowrap">
      <div onClick=${v.onSetAdminTabRecipes} style=${v.adminTabRecipesStyle + ';flex-shrink:0'}>Receitas</div>
      <div onClick=${v.onSetAdminTabProducts} style=${v.adminTabProductsStyle + ';flex-shrink:0'}>Produtos</div>
      <div onClick=${v.onSetAdminTabCategories} style=${v.adminTabCategoriesStyle + ';flex-shrink:0'}>Categorias</div>
      <div onClick=${v.onOpenImportModal} style="margin-left:auto;display:flex;align-items:center;gap:8px;padding:10px 18px;border-radius:var(--radius-full);font-size:14px;font-weight:600;cursor:pointer;background:var(--neutral-0);color:var(--brand-700);border:1.5px solid var(--brand-500);transition:transform 0.15s ease;flex-shrink:0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B24019" stroke-width="2.2"><path d="M12 3v12M7 10l5 5 5-5"></path><path d="M4 19h16"></path></svg>
        Importar Planilha
      </div>
    </div>

    ${v.hasAdminFlash && html`<div style="margin:0 40px 16px;background:rgba(52,178,62,0.12);border:1px solid var(--green-500);color:var(--green-600);border-radius:var(--radius-md);padding:12px 16px;font-size:13px;font-weight:600;animation:ycFadeIn 0.2s ease">${v.adminFlash}</div>`}

    ${v.isAdminRecipesTab && renderAdminRecipesTab(app, v)}
    ${v.isAdminCategoriesTab && renderAdminCategoriesTab(app, v)}
    ${v.isAdminProductsTab && renderAdminProductsTab(app, v)}
  `;
}

function renderRecipeFormModal(app, v) {
  const f = v.recipeForm;
  return html`
    <div style="position:absolute;inset:0;background:rgba(14,12,11,0.5);display:flex;align-items:center;justify-content:center;z-index:20;animation:ycFadeIn 0.2s ease;padding:20px;box-sizing:border-box">
      <div className="yc-scroll" style="width:820px;max-width:100%;max-height:90%;overflow-y:auto;background:var(--neutral-0);border-radius:var(--radius-xl);padding:32px;box-shadow:var(--shadow-lg);animation:ycPopIn 0.25s ease">
        <div style="font-size:22px;font-weight:700;margin-bottom:20px">${v.recipeFormTitle}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
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
          <div key=${row.idx} style="display:flex;gap:10px;margin-bottom:10px;align-items:center">
            <div style="flex:1"><${CustomSelect} options=${v.produtoOptions} value=${row.produtoId} onChange=${row.onProdutoSet} /></div>
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
        </div>
        <div style="display:flex;gap:10px;margin-top:22px">
          <div onClick=${v.onCancelProductForm} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50);transition:transform 0.15s ease">Cancelar</div>
          <div onClick=${v.onSaveProductForm} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer;color:#F4F2F1;background:var(--brand-700);transition:transform 0.15s ease">Salvar</div>
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
          <div style="font-size:22px;font-weight:700">Importar Planilha (.xlsx)</div>
          <div onClick=${v.onCloseImportModal} style="width:36px;height:36px;border-radius:var(--radius-full);background:var(--neutral-50);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-900)" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"></path></svg>
          </div>
        </div>

        ${v.importStepInstructions && html`
          <div style="font-size:14px;color:var(--neutral-600);margin-bottom:18px">Envie um arquivo <strong>.xlsx</strong> com duas abas: <strong>Produtos</strong> e <strong>Receitas</strong>. Veja o modelo esperado abaixo antes de enviar.</div>

          <div style="background:var(--neutral-50);border-radius:var(--radius-md);padding:16px;margin-bottom:12px">
            <div style="font-weight:700;font-size:14px;margin-bottom:8px">Aba "Produtos"</div>
            <div style="font-size:13px;color:var(--neutral-800);line-height:1.8">
              <strong>nome</strong> — obrigatório<br/>
              <strong>categoria</strong> — obrigatório, uma de: ${v.categoriasProdutoList}<br/>
              <strong>unidade</strong> — obrigatório: kg, un, pacote, caixa, pote<br/>
              <strong>preco</strong> — obrigatório, número (ex: 34.90)
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
              <strong>tipo</strong> — obrigatório: "proteina" (nova categoria de produto) ou "secao" (nova seção da home)<br/>
              <strong>nome</strong> — obrigatório, nome da nova categoria ou seção<br/>
              Use esta aba para declarar as categorias/seções que ainda não existem no app antes de referenciá-las nas abas Produtos e Receitas.
            </div>
          </div>
          <div onClick=${v.onDownloadTemplate} style="text-align:center;padding:12px;border-radius:var(--radius-md);border:1.5px solid var(--brand-500);color:var(--brand-700);font-weight:700;font-size:14px;cursor:pointer;margin-bottom:18px">Baixar modelo (.xlsx)</div>

          <label style="display:block;border:2px dashed var(--neutral-200);border-radius:var(--radius-md);padding:24px;text-align:center;cursor:pointer;color:var(--neutral-600);font-size:14px">
            Clique para selecionar o arquivo .xlsx
            <input type="file" accept=".xlsx" onChange=${v.onImportFileChange} style="display:none"/>
          </label>
          ${v.hasImportParseError && html`<div style="color:var(--red-600);font-size:13px;margin-top:10px;font-weight:600">${v.importParseError}</div>`}
        `}

        ${v.importStepResult && html`
          <div style="font-size:14px;color:var(--neutral-800);margin-bottom:14px">Arquivo: <strong>${v.importFileName}</strong> — ${v.importProductsCount} produtos e ${v.importRecipesCount} receitas encontrados.</div>
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
              <div style="font-weight:700;font-size:14px;color:var(--yellow-600);margin-bottom:6px">Avisos — produtos não cadastrados usados em receitas</div>
              ${v.importWarnings.map((warn, i) => html`<div key=${i} style="font-size:13px;color:var(--neutral-800);margin-bottom:4px">• ${warn}</div>`)}
            </div>
          `}

          ${v.importCanProceed && html`
            <div style="font-weight:700;font-size:14px;margin-bottom:10px">Como deseja importar?</div>
            <label style=${`display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid ${v.importModeMergeBorder};margin-bottom:10px;cursor:pointer`}>
              <input type="radio" name="importMode" checked=${v.importModeIsMerge} onChange=${v.onSetImportModeMerge}/>
              <div><div style="font-weight:600;font-size:14px">Incluir nos cadastros existentes</div><div style="font-size:12px;color:var(--neutral-600)">Adiciona os novos itens; produtos e receitas com o mesmo nome são atualizados.</div></div>
            </label>
            <label style=${`display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid ${v.importModeReplaceMatchingBorder};margin-bottom:10px;cursor:pointer`}>
              <input type="radio" name="importMode" checked=${v.importModeIsReplaceMatching} onChange=${v.onSetImportModeReplaceMatching}/>
              <div><div style="font-weight:600;font-size:14px">Substituir receitas com o mesmo nome</div><div style="font-size:12px;color:var(--neutral-600)">Receitas da planilha com nome igual a uma já cadastrada são totalmente substituídas; as demais receitas e produtos existentes são mantidos.</div></div>
            </label>
            <label style=${`display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid ${v.importModeReplaceBorder};margin-bottom:6px;cursor:pointer`}>
              <input type="radio" name="importMode" checked=${v.importModeIsReplace} onChange=${v.onSetImportModeReplace}/>
              <div><div style="font-weight:600;font-size:14px">Substituir todos os cadastros</div><div style="font-size:12px;color:var(--neutral-600)">Remove todas as receitas e produtos atuais e usa somente os desta planilha.</div></div>
            </label>
          `}

          <div style="display:flex;gap:10px;margin-top:20px">
            <div onClick=${v.onBackToInstructions} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:600;font-size:15px;cursor:pointer;color:var(--neutral-800);background:var(--neutral-50)">Voltar</div>
            ${v.importCanProceed && html`<div onClick=${v.onConfirmImport} style="flex:1;text-align:center;padding:14px;border-radius:var(--radius-md);font-weight:700;font-size:15px;cursor:pointer;color:#F4F2F1;background:var(--brand-700)">Confirmar Importação</div>`}
          </div>
        `}
      </div>
    </div>
  `;
}
