import { h, html, render, Component } from './vendor/htm-preact-standalone.js?v=20260803-1';
import { CustomSelect } from './custom-select.js?v=20260803-1';
import {
  LS_KEYS, SECTION_DEFS, FALLBACK_IMG,
  CATEGORIAS_PRODUTO, UNIDADES, CATEGORIAS_RECEITA, DIFICULDADES,
  DEFAULT_PRODUCTS, DEFAULT_RECIPES,
} from './data.js?v=20260803-1';
import { generateCredential, normalizeCredential } from './credential.js?v=20260803-1';
import { supabase } from './supabase-client.js?v=20260803-1';
import { signUpAttempt, signInWithCredential, fetchProfile, updateDisplayName, signOut, AUTH_GENERIC_ERROR, MAX_SIGNUP_ATTEMPTS } from './auth.js?v=20260803-1';
import { runSignupRetryLoop } from './signup-retry.js?v=20260803-1';
import { normalizeDisplayName } from './display-name.js?v=20260803-1';
import * as catalog from './catalog.js?v=20260803-1';

// Cache-busting version stamp — see the comment block at the top of
// index.html for the full explanation and the bump procedure. This literal
// must be identical to every `?v=...` query string in index.html and in
// every local import specifier below/in catalog.js/auth.js/custom-select.js/
// template.js (tests/js/cache-busting.test.js checks this can't drift).
const FRONTEND_VERSION = '20260803-1';
// eslint-disable-next-line no-console
console.info(`Yourcipe frontend: ${FRONTEND_VERSION}`);

const TURNSTILE_SITE_KEY = '0x4AAAAAAED4OOkYJr1mKBgo';
const CAPTCHA_FRIENDLY_ERROR = 'Não foi possível validar o CAPTCHA. Tente novamente.';
const TURNSTILE_TOKEN_WAIT_MS = 20000;
const TURNSTILE_MOUNT_POLL_MS = 100;
const TURNSTILE_MOUNT_TIMEOUT_MS = 5000;
// adminTab values that require role==='admin'. Never inferred from
// "has a session"/"creationMode is open"/etc — see applySessionProfile and
// renderAdmin's tab dispatch in template.js, both of which gate on this.
const ADMIN_ONLY_TABS = ['recipes', 'products', 'categories', 'requestsInbox'];

function ref() { return { current: null }; }

class App extends Component {
  categoriasProduto = CATEGORIAS_PRODUTO;
  unidades = UNIDADES;
  categoriasReceita = CATEGORIAS_RECEITA;
  dificuldades = DIFICULDADES;

  frameRef = ref();
  scrollRef = ref();
  stageRef = ref();
  heroRef = ref();

  state = (() => {
    let products = DEFAULT_PRODUCTS, recipes = DEFAULT_RECIPES, favoriteIds = [], profile = null, darkMode = false, hiddenRecipeIds = [], vendas = [];
    let homeSections = SECTION_DEFS.map(d => ({ key: d.key, label: d.label, enabled: true, custom: false }));
    let productCategories = CATEGORIAS_PRODUTO.map(c => ({ key: c, label: c, enabled: true, custom: false }));
    try {
      const sp = localStorage.getItem(LS_KEYS.products); if (sp) products = JSON.parse(sp);
      const sr = localStorage.getItem(LS_KEYS.recipes); if (sr) recipes = JSON.parse(sr);
      const sf = localStorage.getItem(LS_KEYS.favorites); if (sf) favoriteIds = JSON.parse(sf);
      const spr = localStorage.getItem(LS_KEYS.profile); if (spr) profile = JSON.parse(spr);
      const sd = localStorage.getItem(LS_KEYS.darkMode); if (sd) darkMode = JSON.parse(sd);
      const sv = localStorage.getItem(LS_KEYS.vendas); if (sv) vendas = JSON.parse(sv);
      const sh = localStorage.getItem(LS_KEYS.hidden); if (sh) hiddenRecipeIds = JSON.parse(sh);
      const ss = localStorage.getItem(LS_KEYS.sections);
      if (ss) {
        const parsed = JSON.parse(ss);
        if (Array.isArray(parsed)) homeSections = parsed;
        else homeSections = homeSections.map(h => ({ ...h, enabled: parsed[h.key] !== undefined ? parsed[h.key] : h.enabled }));
      }
      const spt = localStorage.getItem(LS_KEYS.proteins);
      if (spt) {
        const parsedP = JSON.parse(spt);
        if (Array.isArray(parsedP)) productCategories = parsedP;
        else productCategories = productCategories.map(c => ({ ...c, enabled: parsedP[c.key] !== undefined ? parsedP[c.key] : c.enabled }));
      }
    } catch (e) {}
    let navRailSide = 'right';
    try { navRailSide = localStorage.getItem(LS_KEYS.navRailSide) || 'right'; } catch (e) {}
    let weekStartDay = 1;
    try { const sw = localStorage.getItem(LS_KEYS.weekStartDay); if (sw !== null) weekStartDay = Number(sw); } catch (e) {}
    let fontSize = 'normal';
    try { const sfz = localStorage.getItem(LS_KEYS.fontSize); if (sfz === 'small' || sfz === 'large' || sfz === 'normal') fontSize = sfz; } catch (e) {}
    return {
      frameW: (typeof window !== 'undefined') ? window.innerWidth : 1200,
      deviceMode: (typeof window !== 'undefined' && window.innerWidth >= 1200 && window.innerHeight >= 700) ? 'desktop' : (typeof window !== 'undefined' && (window.innerWidth >= 768 || window.innerWidth > window.innerHeight)) ? 'tablet' : 'mobile',
      darkMode, hiddenRecipeIds, homeSections, productCategories, newSectionLabel: '', newProteinLabel: '', navRailSide, weekStartDay, fontSize,
      selectionMode: false, selectedRecipeIds: [], recipeMenuOpenId: null,
      saleSelectionMode: false, selectedSaleIds: [],
      productSelectionMode: false, selectedProductIds: [],
      sectionSelectionMode: false, selectedSectionKeys: [],
      proteinSelectionMode: false, selectedProteinKeys: [],
      heroIndex: 0,
      screen: 'home',
      isFullscreen: false,
      products, recipes, favoriteIds, profile,
      vendas, salesModalOpen: false, saleForm: { valor: '', ipc: '', data: '' }, editingSaleId: null,
      weatherTab: 'temperatura',
      weatherNow: { temp: 22, chuva: 5, umidade: 58, vento: 12, condLabel: 'Predominantemente nublado', cidade: 'São Paulo, SP', cond: 'cloud' },
      hourly: [
        { hora: '11:00', temp: 22, chuva: 5, vento: 10 },
        { hora: '14:00', temp: 24, chuva: 5, vento: 12 },
        { hora: '17:00', temp: 23, chuva: 10, vento: 14 },
        { hora: '20:00', temp: 18, chuva: 15, vento: 11 },
        { hora: '23:00', temp: 16, chuva: 10, vento: 9 },
        { hora: '02:00', temp: 14, chuva: 8, vento: 8 },
        { hora: '05:00', temp: 13, chuva: 5, vento: 10 },
        { hora: '08:00', temp: 14, chuva: 5, vento: 12 },
      ],
      weatherForecast: [
        { dia: 'Hoje', tempMax: 24, tempMin: 12, precip: 5, cond: 'sun' },
        { dia: 'Qui', tempMax: 23, tempMin: 11, precip: 10, cond: 'cloud' },
        { dia: 'Sex', tempMax: 22, tempMin: 13, precip: 20, cond: 'cloud' },
        { dia: 'Sáb', tempMax: 21, tempMin: 12, precip: 35, cond: 'rain' },
        { dia: 'Dom', tempMax: 23, tempMin: 11, precip: 10, cond: 'sun' },
        { dia: 'Seg', tempMax: 25, tempMin: 12, precip: 5, cond: 'sun' },
        { dia: 'Ter', tempMax: 24, tempMin: 13, precip: 10, cond: 'cloud' },
      ],
      economicData: {
        ipca: { value: 5.15, base: 5.15, unit: '%', variacao: '+0,05 p.p.', trend: 'up' },
        dolar: { value: 5.12, base: 5.12, unit: 'R$', variacao: '-0,10%', trend: 'down' },
        euro: { value: 5.95, base: 5.95, unit: 'R$', variacao: '+0,08%', trend: 'up' },
        selic: { value: 15.00, base: 15.00, unit: '%', variacao: '0,00 p.p.', trend: 'up' },
      },
      indicatorsUpdatedAt: Date.now(),
      showProfileSetup: false,
      profileForm: { idade: '', genero: 'Prefiro não informar', cargo: '' },
      searchQuery: '',
      activeFilter: 'Todas',
      selectedRecipeId: null,
      checklists: {},
      ingredientOverrides: {},
      altModal: null,
      // Bug #3 fix: this used to default to 'recipes' (the admin-only
      // public-catalog tab) — since PR8 hid the TAB BUTTONS for non-admins
      // but never changed this default or gated the tab *content* dispatch,
      // every non-admin landed on the admin catalog editor's content (full
      // edit/delete controls) the instant they opened "Modo de Criação",
      // even though they could never see a button to get there on purpose.
      // 'myRecipes' is available to every authenticated user, so it is safe
      // as the universal default. See renderAdmin's dispatch in
      // template.js for the second, defense-in-depth half of this fix
      // (gating admin-tab content on isAdminRole too, not just the tab
      // buttons).
      adminTab: 'myRecipes',
      showRecipeForm: false,
      recipeFormMode: 'new',
      recipeForm: null,
      showProductForm: false,
      productFormMode: 'new',
      productForm: null,
      confirmDelete: null,
      editingProductId: null,
      editPriceValue: '',
      dataLoaded: true,
      showSplash: true,
      showImportModal: false,
      importStep: 'instructions',
      importFileName: '',
      importParseError: '',
      importParsedProducts: [],
      importParsedRecipes: [],
      importErrors: [],
      importWarnings: [],
      importNewProductCategories: [],
      importNewSections: [],
      importMode: 'merge',
      adminFlash: '',
      session: null,
      authRole: null,
      authDisplayName: null,
      showLoginModal: false,
      loginCredential: '', loginPassword: '', loginError: '', loginSubmitting: false, loginTurnstileToken: '', loginTurnstileReady: false,
      showSignupModal: false,
      signupDisplayName: '',
      signupPassword: '', signupConfirmPassword: '', signupError: '', signupSubmitting: false, signupTurnstileToken: '', signupTurnstileReady: false,
      signupResult: null, credentialCopied: false,
      // Legacy accounts created before display_name existed (see
      // supabase/002_profiles_display_name_phase1.sql) have authDisplayName
      // = null. This modal is shown right after session resolution (fresh
      // login/signup, or session restore on reload) whenever that's true,
      // and cannot be dismissed without submitting a valid name — it is the
      // "complete your profile at next login" side of the phased migration.
      showCompleteProfileModal: false,
      completeProfileName: '', completeProfileError: '', completeProfileSubmitting: false,
      // Self-service rename (point 6): change my own display_name.
      showChangeNameModal: false,
      changeNameValue: '', changeNameError: '', changeNameSubmitting: false,

      // ---- Modo de Criação: personal recipes/products/categories (Supabase-backed) ----
      myCreationLoading: false, myCreationError: '',
      myCategories: [], myProducts: [], myRecipes: [], sharedLibrary: [], sharedLibraryAuthorNames: {},
      // Public (scope='site', active=true) categories/products, loaded
      // alongside the caller's own personal rows so every category/product
      // picker in "Modo de Criação" can offer "public active UNION my own
      // active", per type — never only the caller's own rows, and never
      // requiring the caller to have created anything of their own first.
      pickerPublicCategories: [], pickerPublicProducts: [],
      showMyCategoryForm: false, myCategoryFormMode: 'new', myCategoryForm: null,
      showMyProductForm: false, myProductFormMode: 'new', myProductForm: null,
      showMyRecipeForm: false, myRecipeFormMode: 'new', myRecipeForm: null,
      myFormError: '',
      // Recipe detail (own or shared-with-me) — sharing controls, authorship, copy.
      selectedMyRecipe: null, myRecipeDetailLoading: false, myRecipeDetailError: '', myRecipeDetailRequestedId: null,
      recipeAuthorName: '',
      shareStatus: null, shareGrantCount: 0, shareBusy: false, shareFlash: '',
      // "Cadastrar Receita por ID" (Perfil).
      redeemCode: '', redeemBusy: false, redeemMessage: '', redeemMessageKind: '',
      // "Criar cópia própria" + resolução de referências.
      copyModalOpen: false, copyRefs: [], copyDecisions: {}, copyCandidateCategories: [], copyCandidateProducts: [], copyBusy: false, copyError: '',

      // ---- Public catalog (Home/Search data source) — bug #1 fix.
      // 'loading' until the first Supabase attempt resolves; 'supabase' once
      // real published/active data is showing (even if empty — an empty
      // public catalog is a valid state, never treated as an error);
      // 'demo-fallback' ONLY when the Supabase fetch itself genuinely
      // failed, and always shown with a visible banner (see
      // renderHome/publicCatalogSource in template.js) — never silently.
      publicCatalogSource: 'loading', publicCatalogError: '',

      // ---- Modo de Criação: "Catálogo Público" (admin-only direct authoring
      // of scope='site' rows — supabase/006_admin_catalog_publishing.sql).
      siteCatalogLoading: false, siteCatalogError: '',
      siteCategories: [], siteProducts: [], siteRecipes: [],
      showSiteCategoryForm: false, siteCategoryFormMode: 'new', siteCategoryForm: null,
      showSiteProductForm: false, siteProductFormMode: 'new', siteProductForm: null,
      showSiteRecipeForm: false, siteRecipeFormMode: 'new', siteRecipeForm: null,
      siteFormError: '',

      // ---- Change requests (publicação): submission, "Meus Pedidos",
      // "Solicitações Recebidas" — supabase/007_change_requests.sql.
      myRequests: [], myRequestsLoading: false, myRequestsError: '',
      allRequests: [], allRequestsLoading: false, allRequestsError: '',
      requestFilterStatus: 'all',
      selectedRequestId: null, selectedRequestRevisions: [], requestDetailLoading: false, requestDetailError: '',
      requestActionBusy: false, requestActionError: '',
      showReturnRequestModal: false, returnNoteValue: '',
      showRejectRequestModal: false, rejectNoteValue: '',
      resubmitBusyRequestId: null,
      // Generic "Solicitar publicação" modal, reused for recipe/product/category.
      publishRequest: null, publishRequestBusy: false, publishRequestError: '',
    };
  })();

  scrollHeroTo = (i) => {
    const el = this.heroRef.current;
    if (el) el.scrollTo({ left: el.clientWidth * i, behavior: 'smooth' });
    this.setState({ heroIndex: i });
  };
  onHeroScroll = (e) => {
    const el = e.target;
    if (!el || !el.clientWidth) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== this.state.heroIndex) this.setState({ heroIndex: idx });
  };

  componentDidMount() {
    const frameEl = this.frameRef.current;
    const rect0 = frameEl ? frameEl.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
    this.updateDeviceMode(rect0.width, rect0.height);
    this._ro = new ResizeObserver((entries) => {
      const r = entries[0] && entries[0].contentRect;
      this.updateDeviceMode(r ? r.width : window.innerWidth, r ? r.height : window.innerHeight);
    });
    if (frameEl) this._ro.observe(frameEl);
    this._onResize = () => this.updateDeviceMode(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    this._onFsChange = () => this.setState({ isFullscreen: !!document.fullscreenElement });
    document.addEventListener('fullscreenchange', this._onFsChange);
    this.loadPublicCatalog();
    this.onRefreshIndicators();
    this.onRefreshWeather();
    this.initAuth();
  }
  componentWillUnmount() {
    if (this._ro) this._ro.disconnect();
    if (this._onResize) { window.removeEventListener('resize', this._onResize); window.removeEventListener('orientationchange', this._onResize); }
    if (this._onFsChange) document.removeEventListener('fullscreenchange', this._onFsChange);
    if (this._authSub) this._authSub.data.subscription.unsubscribe();
  }

  // Shared by initial session resolution and every future auth state change
  // (fresh login, fresh signup, session restored on reload). Whenever a
  // session resolves to a profile with no display_name — a legacy account
  // created before supabase/002_profiles_display_name_phase1.sql, or the
  // brief nullable-migration window — this is the "direcionar para concluir
  // o perfil no próximo login" gate: the modal cannot be dismissed without
  // submitting a valid name (see renderCompleteProfileModal/
  // onCompleteProfileSubmit).
  applySessionProfile = (session, profile) => {
    this.setState({ session, authRole: profile.role, authDisplayName: profile.displayName });
    if (session && !profile.displayName) {
      this.setState({ showCompleteProfileModal: true, completeProfileName: '', completeProfileError: '' });
    }
    // Bug #3 defense in depth: if the resolved role isn't admin (including
    // profile.role === null while it's still loading, or a fetchProfile
    // failure — auth.js's fetchProfile always defaults to 'user' on error,
    // never 'admin', so this is the restrictive-by-default path required),
    // never leave adminTab pointed at an admin-only tab. This matters most
    // right after a role *downgrade* mid-session is impossible today, but
    // also covers the ordinary case where adminTab was left on an
    // admin-only value from a previous admin session on the same device.
    if (profile.role !== 'admin' && ADMIN_ONLY_TABS.includes(this.state.adminTab)) {
      this.setState({ adminTab: 'myRecipes' });
    }
  };

  initAuth = async () => {
    const { data } = await supabase.auth.getSession();
    const session = data.session || null;
    const profile = session ? await fetchProfile(session.user.id) : { role: null, displayName: null };
    this.applySessionProfile(session, profile);
    this._authSub = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) { this.setState({ session: null, authRole: null, authDisplayName: null }); return; }
      const profile = await fetchProfile(session.user.id);
      this.applySessionProfile(session, profile);
    });
  };
  updateDeviceMode = (w, h) => {
    h = h || window.innerHeight;
    const landscape = w > h;
    let mode;
    if (w >= 1200 && h >= 700) mode = 'desktop';
    else if (w >= 768 || landscape) mode = 'tablet';
    else mode = 'mobile';
    if (mode !== this.state.deviceMode || w !== this.state.frameW) this.setState({ deviceMode: mode, frameW: w });
  };

  screenOrder = { home: 0, search: 1, favorites: 2, dados: 3, profile: 4, detail: 5, admin: 6, salesHistory: 7 };
  animateTo = (next) => {
    const prev = this.state.screen;
    if (prev === next) return;
    if (next === 'detail' || prev === 'detail') {
      const stg = this.stageRef.current;
      if (stg) {
        stg.style.transition = 'none';
        requestAnimationFrame(() => requestAnimationFrame(() => { stg.style.transition = ''; }));
      }
    }
    requestAnimationFrame(() => {
      const sc = this.scrollRef.current; if (sc) sc.scrollTop = 0;
      const st = this.stageRef.current; if (!st) return;
      const from = this.screenOrder[prev] || 0, to = this.screenOrder[next] || 0;
      const isHorizontalMode = this.state.deviceMode !== 'mobile';
      const name = next === 'detail' ? 'ycFadeIn' : (isHorizontalMode ? (to >= from ? 'ycInUpNav' : 'ycInDown') : (to >= from ? 'ycInRight' : 'ycInLeft'));
      st.style.animation = 'none';
      void st.offsetWidth;
      st.style.animation = name + ' 0.36s cubic-bezier(0.22,0.8,0.24,1)';
    });
  };

  persist(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
  formatBRL(n) { return 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ','); }
  weekStart(d) { const dt = new Date(d); const base = this.state.weekStartDay ?? 1; const day = (dt.getDay() - base + 7) % 7; dt.setHours(0, 0, 0, 0); dt.setDate(dt.getDate() - day); return dt; }
  todayDateInputValue = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  onOpenSalesModal = () => this.setState({ salesModalOpen: true, saleForm: { valor: '', ipc: '', data: this.todayDateInputValue() }, editingSaleId: null });
  onCloseSalesModal = () => this.setState({ salesModalOpen: false, editingSaleId: null });
  onSaleValorChange = (e) => this.setState({ saleForm: { ...this.state.saleForm, valor: e.target.value } });
  onSaleIpcChange = (e) => this.setState({ saleForm: { ...this.state.saleForm, ipc: e.target.value } });
  onSaleDataChange = (e) => this.setState({ saleForm: { ...this.state.saleForm, data: e.target.value } });
  onSaveSale = () => {
    const f = this.state.saleForm;
    const valor = parseFloat(String(f.valor || '').replace(',', '.')) || 0;
    if (!valor) return;
    const ipc = parseInt(f.ipc, 10) || 0;
    const dataISO = f.data ? new Date(f.data + 'T12:00:00').toISOString() : new Date().toISOString();
    const editId = this.state.editingSaleId;
    let vendas;
    if (editId) {
      vendas = this.state.vendas.map(v => v.id === editId ? { ...v, valor, ipc, data: dataISO } : v);
    } else {
      const venda = { id: 'v_' + Date.now(), data: dataISO, valor, ipc };
      vendas = [...this.state.vendas, venda];
    }
    this.persist(LS_KEYS.vendas, vendas);
    this.setState({ vendas, salesModalOpen: false, editingSaleId: null });
  };
  goSalesHistory = () => { this.animateTo('salesHistory'); this.setState({ screen: 'salesHistory' }); };
  onBackFromSalesHistory = () => { this.animateTo('dados'); this.setState({ screen: 'dados' }); };
  onEditSale = (id) => {
    const v = this.state.vendas.find(x => x.id === id); if (!v) return;
    const d = new Date(v.data);
    const dataVal = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    this.setState({ salesModalOpen: true, editingSaleId: id, saleForm: { valor: String(v.valor).replace('.', ','), ipc: String(v.ipc || 0), data: dataVal } });
  };
  askDeleteSale = (id) => this.setState({ confirmDelete: { type: 'sale', id, message: 'Excluir este registro de venda? Esta ação não pode ser desfeita.' } });
  startSaleRowPress = (id) => {
    clearTimeout(this._salePressTimer);
    this._salePressTimer = setTimeout(() => {
      this.setState(s => ({ saleSelectionMode: true, selectedSaleIds: s.selectedSaleIds.includes(id) ? s.selectedSaleIds : [...s.selectedSaleIds, id] }));
    }, 480);
  };
  endSaleRowPress = () => clearTimeout(this._salePressTimer);
  toggleSaleSelected = (id) => this.setState(s => {
    const has = s.selectedSaleIds.includes(id);
    const selectedSaleIds = has ? s.selectedSaleIds.filter(x => x !== id) : [...s.selectedSaleIds, id];
    return { selectedSaleIds, saleSelectionMode: selectedSaleIds.length > 0 };
  });
  onCancelSaleSelection = () => this.setState({ saleSelectionMode: false, selectedSaleIds: [] });
  askBulkDeleteSales = () => this.setState({ confirmDelete: { type: 'bulk-delete-sales', ids: [...this.state.selectedSaleIds], message: `Excluir ${this.state.selectedSaleIds.length} venda(s) selecionada(s)? Esta ação não pode ser desfeita.` } });

  onRefreshWeather = async () => {
    // Open-Meteo (sem chave) - São Paulo, SP (-23.5505, -46.6333)
    const condFromCode = (code) => {
      if (code === 0) return 'sun';
      if ([1, 2, 3, 45, 48].includes(code)) return 'cloud';
      return 'rain';
    };
    const condLabelFromCode = (code) => ({
      0: 'Céu limpo', 1: 'Predominantemente limpo', 2: 'Parcialmente nublado', 3: 'Nublado',
      45: 'Neblina', 48: 'Neblina com geada', 51: 'Garoa fraca', 53: 'Garoa moderada', 55: 'Garoa forte',
      61: 'Chuva fraca', 63: 'Chuva moderada', 65: 'Chuva forte', 66: 'Chuva congelante', 67: 'Chuva congelante forte',
      71: 'Neve fraca', 73: 'Neve moderada', 75: 'Neve forte', 80: 'Pancadas de chuva fracas', 81: 'Pancadas de chuva moderadas',
      82: 'Pancadas de chuva fortes', 95: 'Trovoadas', 96: 'Trovoadas com granizo', 99: 'Trovoadas com granizo forte',
    }[code] || 'Condições variáveis');
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=-23.5505&longitude=-46.6333&current=temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m,weather_code&hourly=temperature_2m,precipitation_probability,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=America%2FSao_Paulo&forecast_days=7';
      const res = await fetch(url);
      if (!res.ok) throw new Error('open-meteo-fetch-failed');
      const data = await res.json();
      const cur = data.current;
      const weatherNow = {
        temp: Math.round(cur.temperature_2m), chuva: Math.round(cur.precipitation_probability),
        umidade: Math.round(cur.relative_humidity_2m), vento: Math.round(cur.wind_speed_10m),
        condLabel: condLabelFromCode(cur.weather_code), cidade: 'São Paulo, SP', cond: condFromCode(cur.weather_code),
      };
      const nowIdx = data.hourly.time.findIndex(t => new Date(t).getTime() >= Date.now());
      const startIdx = Math.max(0, nowIdx);
      const hourly = data.hourly.time.slice(startIdx, startIdx + 8).map((t, i) => ({
        hora: new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        temp: Math.round(data.hourly.temperature_2m[startIdx + i]),
        chuva: Math.round(data.hourly.precipitation_probability[startIdx + i]),
        vento: Math.round(data.hourly.wind_speed_10m[startIdx + i]),
      }));
      const diaNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const weatherForecast = data.daily.time.map((t, i) => ({
        dia: i === 0 ? 'Hoje' : diaNames[new Date(t + 'T12:00:00').getDay()],
        tempMax: Math.round(data.daily.temperature_2m_max[i]), tempMin: Math.round(data.daily.temperature_2m_min[i]),
        precip: Math.round(data.daily.precipitation_probability_max[i]), cond: condFromCode(data.daily.weather_code[i]),
      }));
      this.setState({ weatherNow, hourly, weatherForecast });
    } catch (e) {
      console.warn('Falha ao buscar previsão do tempo (Open-Meteo):', e);
    }
  };
  onRefreshIndicators = async () => {
    const fmtNum = (n) => n.toFixed(2).replace('.', ',');
    const mkTrend = (val, prev, unit, isPct) => {
      const diff = val - prev;
      const pctDiff = isPct ? diff : (diff / prev) * 100;
      return { value: val, base: prev, unit, variacao: (pctDiff >= 0 ? '+' : '') + fmtNum(pctDiff) + (isPct ? ' p.p.' : '%'), trend: pctDiff >= 0 ? 'up' : 'down' };
    };
    // Banco Central do Brasil - Sistema Gerenciador de Séries Temporais (SGS)
    // 433: IPCA variação mensal (%) | 1: Dólar PTAX venda | 21619: Euro PTAX venda | 432: Meta Selic (% a.a.)
    const fetchSeries = async (code) => {
      const res = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/2?formato=json`);
      if (!res.ok) throw new Error('bcb-fetch-failed');
      const data = await res.json();
      return data.map(d => parseFloat(d.valor.replace(',', '.')));
    };
    try {
      const [[ipcaPrev, ipcaCur], [dolarPrev, dolarCur], [euroPrev, euroCur], [selicPrev, selicCur]] = await Promise.all([
        fetchSeries(433), fetchSeries(1), fetchSeries(21619), fetchSeries(432),
      ]);
      this.setState({
        economicData: {
          ipca: mkTrend(ipcaCur, ipcaPrev, '%', true),
          dolar: mkTrend(dolarCur, dolarPrev, 'R$', false),
          euro: mkTrend(euroCur, euroPrev, 'R$', false),
          selic: mkTrend(selicCur, selicPrev, '%', true),
        },
        indicatorsUpdatedAt: Date.now(),
      });
    } catch (e) {
      console.warn('Falha ao buscar indicadores do Banco Central (SGS):', e);
      this.setState({ indicatorsUpdatedAt: Date.now(), indicatorsFetchError: true });
    }
  };
  formatQtd(n) {
    const num = Number(n) || 0;
    const whole = Math.floor(num);
    const frac = +(num - whole).toFixed(2);
    const map = { 0.25: '¼', 0.5: '½', 0.75: '¾', 0.33: '⅓', 0.67: '⅔' };
    const symbol = map[frac];
    if (!symbol) return String(num);
    return whole > 0 ? `${whole}${symbol}` : symbol;
  }
  pluralUnidade(unidade, qtd) {
    const n = Number(qtd) || 0;
    if (n <= 1 || unidade === 'kg') return unidade;
    const map = { un: 'un', pacote: 'pacotes', caixa: 'caixas', pote: 'potes' };
    return map[unidade] || unidade;
  }

  onSplashContinue = () => {
    this.setState({ showSplash: false });
    if (!this.state.profile) this.setState({ showProfileSetup: true, profileForm: { idade: '', genero: 'Prefiro não informar', cargo: '' } });
  };
  goHome = () => { this.animateTo('home'); this.setState({ screen: 'home' }); };
  goSearch = () => { this.animateTo('search'); this.setState({ screen: 'search' }); };
  goFavorites = () => { this.animateTo('favorites'); this.setState({ screen: 'favorites' }); };
  goDados = () => { this.animateTo('dados'); this.setState({ screen: 'dados' }); };
  goSearchWithFilter = (cat) => { this.animateTo('search'); this.setState({ screen: 'search', activeFilter: cat }); };
  goProfile = () => {
    this.animateTo('profile');
    this.setState({ screen: 'profile' });
    if (!this.state.profile) this.setState({ showProfileSetup: true, profileForm: { idade: '', genero: 'Prefiro não informar', cargo: '' } });
  };

  selectRecipe = (id) => { this.animateTo('detail'); this.setState({ screen: 'detail', selectedRecipeId: id }); };
  backFromDetail = () => {
    const back = this.state.previousDetailScreen || 'home';
    this.animateTo(back);
    this.setState({ screen: back, selectedRecipeId: null });
  };

  toggleFavorite = (id) => {
    const has = this.state.favoriteIds.includes(id);
    const favoriteIds = has ? this.state.favoriteIds.filter(x => x !== id) : [...this.state.favoriteIds, id];
    this.setState({ favoriteIds });
    this.persist(LS_KEYS.favorites, favoriteIds);
  };

  onSearchChange = (e) => this.setState({ searchQuery: e.target.value });
  setFilter = (cat) => this.setState({ activeFilter: cat });

  onProfileIdadeChange = (e) => this.setState(s => ({ profileForm: { ...s.profileForm, idade: e.target.value } }));
  onProfileCargoChange = (e) => this.setState(s => ({ profileForm: { ...s.profileForm, cargo: e.target.value } }));
  onEditProfile = () => this.setState({ showProfileSetup: true, profileForm: { ...this.state.profile } });
  onSaveProfile = () => {
    const profile = { ...this.state.profileForm };
    this.setState({ profile, showProfileSetup: false });
    this.persist(LS_KEYS.profile, profile);
  };

  // Mounting a brand-new modal subtree means this ref can fire before `el`'s
  // ancestor chain is fully attached to `document` (Preact fires a leaf's
  // ref as soon as its own immediate parent is built, which happens before
  // that parent itself is appended further up — see PR description for the
  // full trace). So `el.isConnected` can genuinely be false on the very
  // first call here; that used to be treated as fatal (`return;`, no
  // retry), which silently aborted the whole mount forever with no error,
  // no widget, and a permanently-disabled submit button. Retry like the
  // `!window.turnstile` branch below already did, with a bounded timeout
  // that surfaces a visible error instead of failing silently.
  mountTurnstileWidget = (el, kind) => {
    const readyKey = kind === 'login' ? 'loginTurnstileReady' : 'signupTurnstileReady';
    const errorKey = kind === 'login' ? 'loginError' : 'signupError';
    let waitedMs = 0;
    const attempt = () => {
      if (!el.isConnected) {
        waitedMs += TURNSTILE_MOUNT_POLL_MS;
        if (waitedMs >= TURNSTILE_MOUNT_TIMEOUT_MS) {
          this.setState({ [errorKey]: 'Não foi possível carregar a verificação de segurança. Feche e abra novamente.' });
          return;
        }
        setTimeout(attempt, TURNSTILE_MOUNT_POLL_MS);
        return;
      }
      if (!window.turnstile) {
        waitedMs += TURNSTILE_MOUNT_POLL_MS;
        if (waitedMs >= TURNSTILE_MOUNT_TIMEOUT_MS) {
          this.setState({ [errorKey]: 'Não foi possível carregar a verificação de segurança. Feche e abra novamente.' });
          return;
        }
        setTimeout(attempt, TURNSTILE_MOUNT_POLL_MS);
        return;
      }
      const widgetId = window.turnstile.render(el, {
        sitekey: TURNSTILE_SITE_KEY,
        language: 'pt-BR',
        theme: 'auto',
        callback: (token) => {
          this.setState(kind === 'login' ? { loginTurnstileToken: token, loginError: '' } : { signupTurnstileToken: token, signupError: '' });
          // Settle a pending requestFreshTurnstileToken() wait, if one is in flight (signup collision-retry loop).
          const resolverKey = kind === 'login' ? '_loginTokenSettle' : '_signupTokenSettle';
          if (this[resolverKey]) this[resolverKey]({ token });
        },
        'expired-callback': () => this.resetTurnstileWidget(kind),
        'error-callback': () => this.setState(kind === 'login' ? { loginTurnstileToken: '', loginError: CAPTCHA_FRIENDLY_ERROR } : { signupTurnstileToken: '', signupError: CAPTCHA_FRIENDLY_ERROR }),
      });
      if (kind === 'login') this._loginTurnstileId = widgetId; else this._signupTurnstileId = widgetId;
      this.setState({ [readyKey]: true });
    };
    attempt();
  };
  resetTurnstileWidget = (kind) => {
    const id = kind === 'login' ? this._loginTurnstileId : this._signupTurnstileId;
    if (window.turnstile && id != null) window.turnstile.reset(id);
    this.setState(kind === 'login' ? { loginTurnstileToken: '' } : { signupTurnstileToken: '' });
  };
  // Resets the widget and waits for the next solved token — used by the
  // signup collision-retry loop, since each Turnstile token is single-use.
  // Resolves { token } once solved, or { timeout: true } after a generous
  // wait (this is a safety net, not the primary mechanism: the primary path
  // is the widget's own callback firing). Callers must show a friendly,
  // retryable error on timeout rather than silently giving up.
  requestFreshTurnstileToken = (kind) => new Promise((resolve) => {
    const resolverKey = kind === 'login' ? '_loginTokenSettle' : '_signupTokenSettle';
    const id = kind === 'login' ? this._loginTurnstileId : this._signupTurnstileId;
    if (!window.turnstile || id == null) { resolve({ timeout: true }); return; }
    const settle = (result) => {
      if (this[resolverKey] !== settle) return;
      this[resolverKey] = null;
      resolve(result);
    };
    this[resolverKey] = settle;
    window.turnstile.reset(id);
    setTimeout(() => settle({ timeout: true }), TURNSTILE_TOKEN_WAIT_MS);
  });
  // Remove the widget, then clear its token/ready state — always in that
  // order, before the caller's own setState hides the modal (and with it,
  // the container). See callers below (closeLoginModal, etc).
  removeTurnstileWidget = (kind) => {
    const id = kind === 'login' ? this._loginTurnstileId : this._signupTurnstileId;
    if (window.turnstile && id != null) { try { window.turnstile.remove(id); } catch (e) {} }
    if (kind === 'login') this._loginTurnstileId = null; else this._signupTurnstileId = null;
    // Unstick any in-flight requestFreshTurnstileToken() wait so it doesn't hang until the wait timeout.
    // (Call the stored settle() itself rather than clearing the slot first — settle() clears it via its own identity check.)
    const resolverKey = kind === 'login' ? '_loginTokenSettle' : '_signupTokenSettle';
    if (this[resolverKey]) this[resolverKey]({ timeout: true });
    this.setState(kind === 'login'
      ? { loginTurnstileToken: '', loginTurnstileReady: false }
      : { signupTurnstileToken: '', signupTurnstileReady: false });
  };
  turnstileLoginRef = (el) => {
    if (el && this._loginTurnstileId == null) this.mountTurnstileWidget(el, 'login');
    else if (!el && this._loginTurnstileId != null) this.removeTurnstileWidget('login');
  };
  turnstileSignupRef = (el) => {
    if (el && this._signupTurnstileId == null) this.mountTurnstileWidget(el, 'signup');
    else if (!el && this._signupTurnstileId != null) this.removeTurnstileWidget('signup');
  };

  // "Modo de Criação": any authenticated user may open it, scoped to their
  // own data (Minhas Receitas / Meus Produtos / Minhas Categorias — see
  // catalog.js and supabase/004_catalog_schema.sql's "*_insert_personal"
  // policies, which already allow any authenticated user to CRUD their own
  // scope='personal' rows, with no role check). Public-catalog admin
  // functions remain exclusive to role='admin' but are out of scope for
  // this screen entirely — see supabase/005_creation_mode_sharing.sql's
  // header comment.
  onOpenAdminAttempt = () => {
    if (this.state.session) {
      this.animateTo('admin'); this.setState({ screen: 'admin' });
      this.loadMyCreationData(this.state.session.user.id);
      this.loadMyRequests(this.state.session.user.id);
      this.loadSiteCatalogData();
      this.loadAllRequests();
      return;
    }
    this.openLoginModal();
  };
  openLoginModal = () => this.setState({ showLoginModal: true, loginCredential: '', loginPassword: '', loginError: '', loginTurnstileToken: '', loginSubmitting: false });
  closeLoginModal = () => { this.removeTurnstileWidget('login'); this.setState({ showLoginModal: false }); };
  openSignupModal = () => {
    this.removeTurnstileWidget('login');
    this.setState({ showLoginModal: false, showSignupModal: true, signupPassword: '', signupConfirmPassword: '', signupError: '', signupTurnstileToken: '', signupSubmitting: false, signupResult: null });
  };
  backToLoginFromSignup = () => {
    this.removeTurnstileWidget('signup');
    this.setState({ showSignupModal: false, showLoginModal: true, loginError: '', loginCredential: '', loginPassword: '', loginTurnstileToken: '' });
  };
  closeSignupModal = () => { this.removeTurnstileWidget('signup'); this.setState({ showSignupModal: false, signupResult: null }); };
  onFinishSignup = () => { this.removeTurnstileWidget('signup'); this.setState({ showSignupModal: false, signupResult: null }); };

  onLoginCredentialChange = (e) => this.setState({ loginCredential: e.target.value });
  onLoginPasswordChange = (e) => this.setState({ loginPassword: e.target.value });
  onLoginSubmit = async () => {
    const { loginCredential, loginPassword, loginTurnstileToken, loginSubmitting } = this.state;
    if (loginSubmitting) return;
    if (!loginTurnstileToken) { this.setState({ loginError: 'Confirme o CAPTCHA para continuar.' }); return; }
    if (!normalizeCredential(loginCredential) || !loginPassword) {
      this.setState({ loginError: AUTH_GENERIC_ERROR });
      this.resetTurnstileWidget('login');
      return;
    }
    this.setState({ loginSubmitting: true, loginError: '' });
    const result = await signInWithCredential(loginCredential, loginPassword, loginTurnstileToken);
    this.resetTurnstileWidget('login');
    if (result.error) {
      this.setState({ loginSubmitting: false, loginError: AUTH_GENERIC_ERROR, loginPassword: '' });
      return;
    }
    const profile = await fetchProfile(result.user.id);
    this.applySessionProfile(result.session, profile);
    this.setState({ loginSubmitting: false, showLoginModal: false, loginCredential: '', loginPassword: '' });
    this.animateTo('admin');
    this.setState({ screen: 'admin' });
    // Pass result.user.id / profile.role directly (not this.state) — see
    // the bug #2 fix comment on loadMyCreationData's definition. session/
    // authRole were just setState()'d above via applySessionProfile in this
    // same tick, so this.state would still be stale here.
    this.loadMyCreationData(result.user.id);
    this.loadMyRequests(result.user.id);
    this.loadSiteCatalogData(profile.role);
    this.loadAllRequests(profile.role);
  };

  onSignupDisplayNameChange = (e) => this.setState({ signupDisplayName: e.target.value });
  onSignupPasswordChange = (e) => this.setState({ signupPassword: e.target.value });
  onSignupConfirmChange = (e) => this.setState({ signupConfirmPassword: e.target.value });
  onSignupSubmit = async () => {
    const { signupDisplayName, signupPassword, signupConfirmPassword, signupTurnstileToken, signupSubmitting } = this.state;
    if (signupSubmitting) return;
    // Client-side check only, for immediate feedback — supabase/002_...sql's
    // handle_new_user() trigger re-validates independently and is what
    // actually enforces this; see display-name.js.
    const cleanName = normalizeDisplayName(signupDisplayName);
    if (!cleanName) { this.setState({ signupError: 'Informe um nome entre 2 e 80 caracteres.' }); return; }
    if (!signupTurnstileToken) { this.setState({ signupError: 'Confirme o CAPTCHA para continuar.' }); return; }
    if (!signupPassword || signupPassword.length < 6) { this.setState({ signupError: 'A senha deve ter pelo menos 6 caracteres.' }); return; }
    if (signupPassword !== signupConfirmPassword) { this.setState({ signupError: 'As senhas não coincidem.' }); return; }
    this.setState({ signupSubmitting: true, signupError: '' });

    const retryResult = await runSignupRetryLoop({
      initialToken: signupTurnstileToken,
      maxAttempts: MAX_SIGNUP_ATTEMPTS,
      generateCredential,
      // cleanName is bound once here and sent identically on every retry
      // attempt — a fresh credential and a fresh Turnstile token per
      // attempt, but the same password and the same display_name every
      // time. See auth.js signUpAttempt for why a retry can never end up
      // creating a profile with a different (or missing) name.
      attemptSignUp: (credential, token) => signUpAttempt(signupPassword, token, credential, cleanName),
      requestFreshToken: () => this.requestFreshTurnstileToken('signup'),
    });
    this.resetTurnstileWidget('signup');

    if (retryResult.captchaTimedOut) {
      this.setState({ signupSubmitting: false, signupError: 'Não foi possível confirmar o CAPTCHA a tempo. Tente novamente.' });
      return;
    }
    const outcome = retryResult.outcome;
    if (!outcome || outcome.error) {
      this.setState({ signupSubmitting: false, signupError: 'Não foi possível concluir o cadastro. Tente novamente.' });
      return;
    }
    const profile = outcome.session ? await fetchProfile(outcome.user.id) : { role: null, displayName: null };
    this.applySessionProfile(outcome.session, profile);
    this.setState({
      signupSubmitting: false, signupResult: { credential: outcome.credential },
      signupPassword: '', signupConfirmPassword: '', signupDisplayName: '',
    });
  };
  onCopyCredential = () => {
    const cred = this.state.signupResult && this.state.signupResult.credential;
    if (!cred || !navigator.clipboard) return;
    navigator.clipboard.writeText(cred).then(() => {
      this.setState({ credentialCopied: true });
      setTimeout(() => this.setState({ credentialCopied: false }), 2000);
    }).catch(() => {});
  };
  onLogout = async () => {
    await signOut();
    this.setState({ session: null, authRole: null, authDisplayName: null });
    if (this.state.screen === 'admin') { this.animateTo('profile'); this.setState({ screen: 'profile' }); }
  };

  // ---- Complete-profile gate for legacy accounts without display_name ----
  onCompleteProfileNameChange = (e) => this.setState({ completeProfileName: e.target.value });
  onCompleteProfileSubmit = async () => {
    const { completeProfileName, completeProfileSubmitting, session } = this.state;
    if (completeProfileSubmitting || !session) return;
    const cleanName = normalizeDisplayName(completeProfileName);
    if (!cleanName) { this.setState({ completeProfileError: 'Informe um nome entre 2 e 80 caracteres.' }); return; }
    this.setState({ completeProfileSubmitting: true, completeProfileError: '' });
    const result = await updateDisplayName(session.user.id, cleanName);
    if (result.error) {
      this.setState({ completeProfileSubmitting: false, completeProfileError: 'Não foi possível salvar o nome. Tente novamente.' });
      return;
    }
    this.setState({
      completeProfileSubmitting: false, showCompleteProfileModal: false,
      completeProfileName: '', authDisplayName: result.displayName,
    });
  };

  // ---- Self-service rename (point 6) ----
  onOpenChangeNameModal = () => this.setState({ showChangeNameModal: true, changeNameValue: this.state.authDisplayName || '', changeNameError: '' });
  onCloseChangeNameModal = () => this.setState({ showChangeNameModal: false });
  onChangeNameValueChange = (e) => this.setState({ changeNameValue: e.target.value });
  onChangeNameSubmit = async () => {
    const { changeNameValue, changeNameSubmitting, session } = this.state;
    if (changeNameSubmitting || !session) return;
    const cleanName = normalizeDisplayName(changeNameValue);
    if (!cleanName) { this.setState({ changeNameError: 'Informe um nome entre 2 e 80 caracteres.' }); return; }
    this.setState({ changeNameSubmitting: true, changeNameError: '' });
    const result = await updateDisplayName(session.user.id, cleanName);
    if (result.error) {
      this.setState({ changeNameSubmitting: false, changeNameError: 'Não foi possível salvar o nome. Tente novamente.' });
      return;
    }
    this.setState({ changeNameSubmitting: false, showChangeNameModal: false, authDisplayName: result.displayName });
  };
  onSetWeekStartDay = (v) => { this.setState({ weekStartDay: Number(v) }); this.persist(LS_KEYS.weekStartDay, Number(v)); };
  onBackFromAdmin = () => { this.animateTo('profile'); this.setState({ screen: 'profile' }); };
  setAdminTabRecipes = () => this.setState({ adminTab: 'recipes' });
  setAdminTabProducts = () => this.setState({ adminTab: 'products' });
  setAdminTabCategories = () => this.setState({ adminTab: 'categories' });
  setAdminTabMyRecipes = () => this.setState({ adminTab: 'myRecipes' });
  setAdminTabMyProducts = () => this.setState({ adminTab: 'myProducts' });
  setAdminTabMyCategories = () => this.setState({ adminTab: 'myCategories' });

  flashAdmin = (msg) => { this.setState({ adminFlash: msg }); setTimeout(() => this.setState({ adminFlash: '' }), 4000); };
  flashShare = (msg) => { this.setState({ shareFlash: msg }); setTimeout(() => this.setState({ shareFlash: '' }), 3500); };

  // Category/product pickers for personal recipe/product forms show public
  // (scope='site', active=true) rows UNION the caller's own active personal
  // rows of the matching type — never another user's personal rows
  // (pickerPublicCategories/pickerPublicProducts only ever contain
  // scope='site' rows, per fetchPublicCategories/fetchPublicProducts'
  // RLS-backed filters; this.state.myCategories/myProducts only ever
  // contain the caller's own rows, per fetchMyCategories/fetchMyProducts'
  // owner_id filter) — and never require the caller to have created their
  // own category/product first.
  pickerCategoriesByType = (type) => [
    ...this.state.pickerPublicCategories.filter(c => c.type === type),
    ...this.state.myCategories.filter(c => c.type === type),
  ];
  myRecipeCategories = () => this.pickerCategoriesByType('receita');
  mySectionCategories = () => this.pickerCategoriesByType('secao');
  myProteinCategories = () => this.pickerCategoriesByType('proteina');
  pickerProducts = () => [...this.state.pickerPublicProducts, ...this.state.myProducts];

  // ---- Modo de Criação: load "Minhas Receitas / Meus Produtos / Minhas
  // Categorias" + the shared-with-me library, all scoped to the caller's own
  // rows by RLS (supabase/004_catalog_schema.sql, supabase/005_creation_mode_sharing.sql)
  // — never filtered client-side, since RLS is the actual boundary.
  //
  // Bug #2 fix: this used to read `this.state.session.user.id` instead of
  // taking it as a parameter. Preact's setState is asynchronous — it merges
  // into a pending buffer and only flushes into `this.state` on the next
  // microtask-scheduled render (see vendor/htm-preact-standalone.js,
  // Component.prototype.setState) — so calling this synchronously right
  // after applySessionProfile()'s own setState (e.g. straight after login,
  // in onLoginSubmit) read a *stale* `this.state.session`, which was still
  // null at that point in the same tick. That made `uid` fall through to
  // undefined and this function return silently with nothing loaded and no
  // error surfaced — "doesn't load" with no visible cause. Every caller
  // below now passes the uid it already has in hand from a resolved value
  // (session.user.id it just received, or the current session it already
  // confirmed truthy), never from a just-set piece of state.
  // Returns `{ ok: true }` or `{ ok: false, error }` — every caller that
  // needs to know whether THIS refetch itself succeeded (as opposed to
  // reading `this.state.myCreationError` right after calling this, which
  // would be stale in the same tick for the same reason bug #2 was: Preact's
  // setState only flushes into `this.state` on the next microtask-scheduled
  // render) uses this return value instead. See
  // refreshAfterMyCreationMutation below for why this matters.
  loadMyCreationData = async (uid) => {
    if (!uid) return { ok: false, error: 'missing uid' };
    this.setState({ myCreationLoading: true, myCreationError: '' });
    try {
      const [cats, prods, recs, shared, publicCats, publicProds] = await Promise.all([
        catalog.fetchMyCategories(uid), catalog.fetchMyProducts(uid), catalog.fetchMyRecipes(uid), catalog.fetchSharedLibrary(uid),
        // Public (scope='site', active=true) categories/products — every
        // category/product picker below unions these with the caller's own
        // personal rows, so pickers work immediately from a freshly-seeded
        // catalog (supabase/008_seed_default_catalog.sql) with no dependency
        // on the caller having created anything personal first.
        catalog.fetchPublicCategories(), catalog.fetchPublicProducts(),
      ]);
      const failed = cats.error || prods.error || recs.error || shared.error || publicCats.error || publicProds.error;
      if (failed) {
        // catalog.js already logged the full { code, message, details, hint }
        // to the console (see logSupabaseError) — this is the same real
        // message, just also surfaced in the UI instead of only a generic
        // string, per the explicit "não manter somente a mensagem genérica"
        // requirement.
        const detail = failed.message ? `${failed.message}${failed.code ? ` (${failed.code})` : ''}` : 'erro desconhecido';
        this.setState({ myCreationError: `Não foi possível carregar seus dados: ${detail}` });
        return { ok: false, error: detail };
      }
      const sharedLibrary = (shared.data || []).filter(row => row.recipe).map(row => ({ ...row.recipe, grantedAt: row.granted_at }));
      // Author display_name for every shared-with-me recipe, so the "Receitas
      // Compartilhadas" tab can show whose recipe it is — never invented or
      // read off `owner_id` directly (RLS already hides other users' rows
      // outright), always resolved through the same safe RPC the recipe
      // detail screen already uses. Best-effort: a failure here must not
      // fail the whole load (the recipe list itself already succeeded above)
      // — a row simply falls back to no author label if its lookup fails.
      const authorEntries = await Promise.all(sharedLibrary.map(async (r) => {
        const res = await catalog.getRecipeAuthorName(r.id);
        return [r.id, res.error ? '' : (res.data || '')];
      }));
      const sharedLibraryAuthorNames = Object.fromEntries(authorEntries);
      this.setState({
        myCategories: cats.data || [], myProducts: prods.data || [], myRecipes: recs.data || [],
        sharedLibrary, sharedLibraryAuthorNames,
        pickerPublicCategories: publicCats.data || [], pickerPublicProducts: publicProds.data || [],
      });
      return { ok: true };
    } catch (e) {
      // Defensive net for an unexpected synchronous throw elsewhere in this
      // body (e.g. a `.map()` over an unexpectedly-shaped response) — every
      // ordinary Supabase error already comes back as a normal `{ error }`
      // value via catalog.js's unwrap() and is handled by the branch above;
      // this only guards against something genuinely unforeseen so the UI
      // never gets stuck on "Carregando..." forever.
      const detail = (e && e.message) || 'erro inesperado';
      this.setState({ myCreationError: `Não foi possível carregar seus dados: ${detail}` });
      return { ok: false, error: detail };
    } finally {
      this.setState({ myCreationLoading: false });
    }
  };

  // Shared post-mutation refresh for every "Modo de Criação" personal
  // mutation path (recipe/product/category create, edit, delete; copy;
  // share-code redemption). By the time this runs, the mutation itself has
  // ALREADY succeeded — every caller only reaches this after its own
  // create/update/delete call came back without an error. If THIS refetch
  // fails (e.g. a transient network error right after a successful insert),
  // the user must not be told "a criação falhou": that would be misleading,
  // since the write already landed. Instead this surfaces a distinct,
  // explicitly-worded, retryable `myCreationError` banner (already rendered
  // with a "Tentar novamente" button wired to `onRetryMyCreationData` — see
  // template.js) that says the save worked and only the list refresh needs
  // a retry, instead of silently doing nothing or reusing the generic
  // "não foi possível carregar" wording that would read as if the save
  // itself had failed.
  refreshAfterMyCreationMutation = async (uid, successMessage) => {
    const result = await this.loadMyCreationData(uid);
    if (result && result.ok === false) {
      this.setState({ myCreationError: `${successMessage} A lista não pôde ser atualizada automaticamente: ${result.error}` });
      return;
    }
    this.flashAdmin(successMessage);
  };

  // ---- Minhas Categorias ----
  onNewMyCategory = () => this.setState({ showMyCategoryForm: true, myCategoryFormMode: 'new', myFormError: '', myCategoryForm: { id: null, type: 'receita', name: '' } });
  onEditMyCategory = (c) => this.setState({ showMyCategoryForm: true, myCategoryFormMode: 'edit', myFormError: '', myCategoryForm: { id: c.id, type: c.type, name: c.name } });
  onCancelMyCategoryForm = () => this.setState({ showMyCategoryForm: false, myCategoryForm: null, myFormError: '' });
  myCategoryFormField = (field) => (e) => this.setState(s => ({ myCategoryForm: { ...s.myCategoryForm, [field]: e.target.value } }));
  onSaveMyCategoryForm = async () => {
    const f = this.state.myCategoryForm;
    const uid = this.state.session.user.id;
    if (!f.name || !f.name.trim()) { this.setState({ myFormError: 'Informe o nome da categoria.' }); return; }
    const res = f.id ? await catalog.updateCategoryName(f.id, f.name.trim()) : await catalog.createCategory(uid, { type: f.type, name: f.name.trim() });
    if (res.error) { this.setState({ myFormError: 'Não foi possível salvar a categoria.' }); return; }
    this.setState({ showMyCategoryForm: false, myCategoryForm: null });
    this.refreshAfterMyCreationMutation(uid, 'Categoria salva com sucesso.');
  };
  askDeleteMyCategory = (id, name) => this.setState({ confirmDelete: { type: 'myCategory', id, message: `Excluir a categoria "${name}"? Produtos ou receitas que a usam podem deixar de funcionar corretamente.` } });

  // ---- Meus Produtos ----
  onNewMyProduct = () => this.setState({ showMyProductForm: true, myProductFormMode: 'new', myFormError: '', myProductForm: { id: null, name: '', categoryId: (this.myProteinCategories()[0] && this.myProteinCategories()[0].id) || '', unit: 'kg', price: 0 } });
  onEditMyProduct = (p) => this.setState({ showMyProductForm: true, myProductFormMode: 'edit', myFormError: '', myProductForm: { id: p.id, name: p.name, categoryId: p.category_id, unit: p.unit, price: p.price } });
  onCancelMyProductForm = () => this.setState({ showMyProductForm: false, myProductForm: null, myFormError: '' });
  myProductFormField = (field) => (e) => this.setState(s => ({ myProductForm: { ...s.myProductForm, [field]: e.target.value } }));
  onSaveMyProductForm = async () => {
    const f = this.state.myProductForm;
    const uid = this.state.session.user.id;
    if (!f.name || !f.name.trim() || !f.categoryId) { this.setState({ myFormError: 'Informe o nome e a categoria do produto.' }); return; }
    const patch = { name: f.name.trim(), category_id: f.categoryId, unit: f.unit, price: parseFloat(String(f.price).replace(',', '.')) || 0 };
    const res = f.id
      ? await catalog.updateProduct(f.id, patch)
      : await catalog.createProduct(uid, { name: patch.name, categoryId: patch.category_id, unit: patch.unit, price: patch.price });
    if (res.error) { this.setState({ myFormError: 'Não foi possível salvar o produto.' }); return; }
    this.setState({ showMyProductForm: false, myProductForm: null });
    this.refreshAfterMyCreationMutation(uid, 'Produto salvo com sucesso.');
  };
  askDeleteMyProduct = (id, name) => this.setState({ confirmDelete: { type: 'myProduct', id, message: `Excluir o produto "${name}"? Ele será removido também das receitas que o usam.` } });

  // ---- Minhas Receitas ----
  onNewMyRecipe = () => this.setState({
    showMyRecipeForm: true, myRecipeFormMode: 'new', myFormError: '',
    myRecipeForm: {
      id: null, name: '', categoryId: (this.myRecipeCategories()[0] && this.myRecipeCategories()[0].id) || '',
      prepTime: 30, servings: 4, difficulty: 'Fácil', imageUrl: '',
      ingredients: [{ productId: this.pickerProducts()[0] ? this.pickerProducts()[0].id : '', quantity: 1 }],
      sectionCategoryIds: [], extrasText: '', instructionsText: '', tipsText: '',
    },
  });
  onEditMyRecipe = async (row) => {
    this.setState({ myRecipeDetailLoading: true, myFormError: '' });
    const { data, error } = await catalog.fetchRecipeDetail(row.id);
    this.setState({ myRecipeDetailLoading: false });
    if (error || !data) { this.flashAdmin('Não foi possível carregar a receita.'); return; }
    this.setState({
      showMyRecipeForm: true, myRecipeFormMode: 'edit', myFormError: '',
      myRecipeForm: {
        id: data.recipe.id, name: data.recipe.name, categoryId: data.recipe.category_id,
        prepTime: data.recipe.prep_time, servings: data.recipe.servings, difficulty: data.recipe.difficulty,
        imageUrl: data.recipe.image_url || '',
        ingredients: data.ingredients.map(i => ({ productId: i.product_id, quantity: i.quantity })),
        sectionCategoryIds: data.sections.map(s => s.category_id),
        extrasText: (data.recipe.extras || []).join('\n'),
        instructionsText: (data.recipe.instructions || []).join('\n'),
        tipsText: (data.recipe.tips || []).join('\n'),
      },
    });
  };
  onCancelMyRecipeForm = () => this.setState({ showMyRecipeForm: false, myRecipeForm: null, myFormError: '' });
  myRecipeFormField = (field) => (e) => this.setState(s => ({ myRecipeForm: { ...s.myRecipeForm, [field]: e.target.value } }));
  onMyRecipeIngredientChange = (idx, field, value) => this.setState(s => ({ myRecipeForm: { ...s.myRecipeForm, ingredients: s.myRecipeForm.ingredients.map((row, i) => i === idx ? { ...row, [field]: value } : row) } }));
  addMyRecipeIngredient = () => this.setState(s => ({ myRecipeForm: { ...s.myRecipeForm, ingredients: [...s.myRecipeForm.ingredients, { productId: this.pickerProducts()[0] ? this.pickerProducts()[0].id : '', quantity: 1 }] } }));
  removeMyRecipeIngredient = (idx) => this.setState(s => ({ myRecipeForm: { ...s.myRecipeForm, ingredients: s.myRecipeForm.ingredients.filter((_, i) => i !== idx) } }));
  toggleMyRecipeSection = (categoryId) => this.setState(s => {
    const cur = s.myRecipeForm.sectionCategoryIds;
    const sectionCategoryIds = cur.includes(categoryId) ? cur.filter(id => id !== categoryId) : [...cur, categoryId];
    return { myRecipeForm: { ...s.myRecipeForm, sectionCategoryIds } };
  });
  onSaveMyRecipeForm = async () => {
    const f = this.state.myRecipeForm;
    const uid = this.state.session.user.id;
    if (!f.name || !f.name.trim() || !f.categoryId) { this.setState({ myFormError: 'Informe o nome e a categoria da receita.' }); return; }
    const validIngredients = f.ingredients.filter(i => i.productId);
    const fields = {
      name: f.name.trim(), categoryId: f.categoryId, prepTime: parseInt(f.prepTime, 10) || 0, servings: parseInt(f.servings, 10) || 0,
      difficulty: f.difficulty, imageUrl: f.imageUrl.trim() || null,
      extras: f.extrasText.split('\n').map(s => s.trim()).filter(Boolean),
      instructions: f.instructionsText.split('\n').map(s => s.trim()).filter(Boolean),
      tips: f.tipsText.split('\n').map(s => s.trim()).filter(Boolean),
    };
    this.setState({ myFormError: '' });
    let recipeId = f.id;
    if (f.id) {
      const { error } = await catalog.updateRecipe(f.id, {
        name: fields.name, category_id: fields.categoryId, prep_time: fields.prepTime, servings: fields.servings,
        difficulty: fields.difficulty, image_url: fields.imageUrl, extras: fields.extras, instructions: fields.instructions, tips: fields.tips,
      });
      if (error) { this.setState({ myFormError: 'Não foi possível salvar a receita.' }); return; }
    } else {
      const { data, error } = await catalog.createRecipe(uid, fields);
      if (error || !data) { this.setState({ myFormError: 'Não foi possível criar a receita.' }); return; }
      recipeId = data.id;
    }
    const [ingRes, catRes] = await Promise.all([
      catalog.replaceRecipeIngredients(recipeId, validIngredients.map(i => ({ productId: i.productId, quantity: parseFloat(String(i.quantity).replace(',', '.')) || 0 }))),
      catalog.replaceRecipeCategories(recipeId, f.sectionCategoryIds),
    ]);
    this.setState({ showMyRecipeForm: false, myRecipeForm: null });
    if (ingRes.error || catRes.error) {
      // Ingredients/sections failed to save, but the recipe row itself did
      // save — same "don't imply the whole save failed" reasoning as
      // refreshAfterMyCreationMutation below, just for a different half of
      // the same mutation. Still refresh the list afterwards so whatever
      // did save is visible.
      this.flashAdmin('A receita foi salva, mas houve um erro ao salvar ingredientes ou seções.');
      this.loadMyCreationData(uid);
      return;
    }
    this.refreshAfterMyCreationMutation(uid, 'Receita salva com sucesso.');
  };
  askDeleteMyRecipe = (id, name) => this.setState({ confirmDelete: { type: 'myRecipe', id, message: `Excluir a receita "${name}"? Esta ação não pode ser desfeita.` } });

  // ---- Recipe detail (own or shared-with-me): sharing controls, authorship, copy ----
  onOpenMyRecipeDetail = async (recipeId) => {
    this.setState({
      myRecipeDetailLoading: true, myRecipeDetailError: '', myRecipeDetailRequestedId: recipeId,
      selectedMyRecipe: null, shareStatus: null, shareGrantCount: 0, recipeAuthorName: '',
    });
    try {
      const uid = this.state.session.user.id;
      const [detailRes, authorRes] = await Promise.all([catalog.fetchRecipeDetail(recipeId), catalog.getRecipeAuthorName(recipeId)]);
      if (detailRes.error || !detailRes.data) { this.setState({ myRecipeDetailError: 'Não foi possível carregar a receita.' }); return; }
      const isOwner = detailRes.data.recipe.owner_id === uid;
      this.setState({ selectedMyRecipe: { ...detailRes.data, id: recipeId, isOwner }, recipeAuthorName: authorRes.data || '' });
      if (isOwner) {
        const [shareRes, countRes] = await Promise.all([catalog.fetchShareStatus(recipeId), catalog.fetchActiveGrantCount(recipeId)]);
        this.setState({ shareStatus: shareRes.data || null, shareGrantCount: countRes.data || 0 });
      }
    } catch (e) {
      this.setState({ myRecipeDetailError: `Não foi possível carregar a receita: ${(e && e.message) || 'erro inesperado'}` });
    } finally {
      this.setState({ myRecipeDetailLoading: false });
    }
  };
  onRetryMyRecipeDetail = () => { if (this.state.myRecipeDetailRequestedId) this.onOpenMyRecipeDetail(this.state.myRecipeDetailRequestedId); };
  onCloseMyRecipeDetail = () => this.setState({ selectedMyRecipe: null, shareStatus: null, shareGrantCount: 0, recipeAuthorName: '', shareFlash: '', myRecipeDetailError: '', myRecipeDetailRequestedId: null });

  onActivateSharing = async () => {
    const rid = this.state.selectedMyRecipe.id;
    this.setState({ shareBusy: true });
    const { data, error } = await catalog.activateSharing(rid);
    this.setState({ shareBusy: false });
    if (error) { this.flashShare('Não foi possível ativar o compartilhamento.'); return; }
    this.setState({ shareStatus: { share_code: data, active: true } });
    this.flashShare('Compartilhamento ativado.');
  };
  onRegenerateShareCode = async () => {
    const rid = this.state.selectedMyRecipe.id;
    this.setState({ shareBusy: true });
    const { data, error } = await catalog.regenerateShareCode(rid);
    this.setState({ shareBusy: false });
    if (error) { this.flashShare('Não foi possível gerar um novo ID.'); return; }
    this.setState({ shareStatus: { share_code: data, active: true } });
    this.flashShare('Novo ID de compartilhamento gerado. O ID anterior deixou de funcionar.');
  };
  onDeactivateSharing = async () => {
    const rid = this.state.selectedMyRecipe.id;
    this.setState({ shareBusy: true });
    const { error } = await catalog.deactivateSharing(rid);
    this.setState({ shareBusy: false });
    if (error) { this.flashShare('Não foi possível desativar o compartilhamento.'); return; }
    this.setState(s => ({ shareStatus: s.shareStatus ? { ...s.shareStatus, active: false } : s.shareStatus }));
    this.flashShare('Novos compartilhamentos desativados. Acessos já concedidos continuam valendo.');
  };
  onRevokeAllAccess = async () => {
    const rid = this.state.selectedMyRecipe.id;
    this.setState({ shareBusy: true });
    const { data, error } = await catalog.revokeAccess(rid, null);
    this.setState({ shareBusy: false });
    if (error) { this.flashShare('Não foi possível revogar os acessos.'); return; }
    this.setState({ shareGrantCount: 0 });
    this.flashShare(`${data || 0} acesso(s) revogado(s).`);
  };
  onCopyShareCode = () => {
    const code = this.state.shareStatus && this.state.shareStatus.share_code;
    if (!code || !navigator.clipboard) return;
    navigator.clipboard.writeText(code).then(() => this.flashShare('ID copiado.')).catch(() => {});
  };

  // ---- Perfil: "Cadastrar Receita por ID" ----
  onRedeemCodeChange = (e) => this.setState({ redeemCode: e.target.value, redeemMessage: '' });
  onRedeemSubmit = async () => {
    const code = this.state.redeemCode.trim();
    if (!code || this.state.redeemBusy) return;
    this.setState({ redeemBusy: true, redeemMessage: '' });
    const { error } = await catalog.redeemShareCode(code);
    if (error) { this.setState({ redeemBusy: false, redeemMessage: error.friendly || 'Código inválido.', redeemMessageKind: 'error' }); return; }
    this.setState({ redeemBusy: false, redeemMessage: 'Receita adicionada à sua biblioteca, em modo somente leitura.', redeemMessageKind: 'success', redeemCode: '' });
    // Redemption already succeeded (redeemMessage above already says so) —
    // if the refetch that populates "Receitas Compartilhadas" fails, that
    // must not read as if the redemption itself failed. Same differentiation
    // as every other personal-data mutation (see refreshAfterMyCreationMutation).
    const refresh = await this.loadMyCreationData(this.state.session.user.id);
    if (refresh && refresh.ok === false) {
      this.setState({ myCreationError: `Código resgatado com sucesso. A lista não pôde ser atualizada automaticamente: ${refresh.error}` });
    }
  };

  // ---- "Criar cópia própria" + resolução de referências ----
  onStartCopyRecipe = async () => {
    const detail = this.state.selectedMyRecipe;
    if (!detail) return;
    const uid = this.state.session.user.id;
    const refs = catalog.computeForeignReferences(detail, uid);
    if (!refs.length) {
      this.setState({ copyBusy: true, copyError: '' });
      const { error } = await catalog.createRecipeCopy(detail.id, []);
      this.setState({ copyBusy: false });
      if (error) { this.setState({ copyError: 'Não foi possível criar a cópia.' }); return; }
      this.refreshAfterMyCreationMutation(uid, 'Cópia própria criada em Minhas Receitas.');
      this.onCloseMyRecipeDetail();
      return;
    }
    const decisions = {};
    refs.forEach(r => { decisions[r.refType + ':' + r.refId] = { action: 'add', targetId: '' }; });
    this.setState({
      copyModalOpen: true, copyRefs: refs, copyDecisions: decisions, copyError: '',
      copyCandidateCategories: this.state.myCategories, copyCandidateProducts: this.state.myProducts,
    });
  };
  onCloseCopyModal = () => this.setState({ copyModalOpen: false, copyRefs: [], copyDecisions: {}, copyError: '' });
  // CustomSelect calls onChange(value) directly (not a DOM event) — see custom-select.js.
  onSetCopyDecisionAction = (refType, refId) => (value) => this.setState(s => ({ copyDecisions: { ...s.copyDecisions, [refType + ':' + refId]: { ...s.copyDecisions[refType + ':' + refId], action: value, targetId: '' } } }));
  onSetCopyDecisionTarget = (refType, refId) => (value) => this.setState(s => ({ copyDecisions: { ...s.copyDecisions, [refType + ':' + refId]: { ...s.copyDecisions[refType + ':' + refId], targetId: value } } }));
  onConfirmCopy = async () => {
    const { copyRefs, copyDecisions, selectedMyRecipe } = this.state;
    for (const r of copyRefs) {
      const d = copyDecisions[r.refType + ':' + r.refId];
      if (!d || !d.action || (d.action === 'map' && !d.targetId)) { this.setState({ copyError: 'Resolva todas as referências antes de continuar.' }); return; }
    }
    const resolutions = copyRefs.map(r => {
      const d = copyDecisions[r.refType + ':' + r.refId];
      return { ref_type: r.refType, ref_id: r.refId, action: d.action, target_id: d.action === 'map' ? d.targetId : null };
    });
    this.setState({ copyBusy: true, copyError: '' });
    const { error } = await catalog.createRecipeCopy(selectedMyRecipe.id, resolutions);
    this.setState({ copyBusy: false });
    if (error) { this.setState({ copyError: 'Não foi possível criar a cópia. Verifique as associações escolhidas.' }); return; }
    this.setState({ copyModalOpen: false, copyRefs: [], copyDecisions: {} });
    this.refreshAfterMyCreationMutation(this.state.session.user.id, 'Cópia própria criada em Minhas Receitas.');
    this.onCloseMyRecipeDetail();
  };

  // =========================================================================
  // Public catalog (Home/Search data source) — bug #1 fix. Before this, the
  // app ALWAYS rendered Home/Search from data.js's DEFAULT_RECIPES/
  // DEFAULT_PRODUCTS (plus any localStorage overrides), and separately the
  // "admin catalog" screen only ever mutated that SAME local state — never
  // called Supabase at all. So nothing an admin created there could ever
  // reach another user or a visitor, regardless of role or RLS: the write
  // path to Supabase's scope='site' rows didn't exist in the UI, and even
  // if it had, nothing ever read scope='site' rows back for the public
  // pages either. This is the actual fix for both halves of that gap.
  // =========================================================================
  loadPublicCatalog = async () => {
    // Reset to 'loading' on every call (not just the very first, initial
    // one) so a retry after a demo-fallback error shows the loading state
    // again instead of leaving the stale fallback banner up mid-request.
    this.setState({ publicCatalogSource: 'loading', publicCatalogError: '' });
    try {
      const [catsRes, prodsRes, recsRes] = await Promise.all([
        catalog.fetchPublicCategories(), catalog.fetchPublicProducts(), catalog.fetchPublicRecipes(),
      ]);
      const firstError = catsRes.error || prodsRes.error || recsRes.error;
      if (firstError) {
        // Fallback is explicit and visible (see hasPublicCatalogFallback/
        // publicCatalogError in computeViewModel + the banner in
        // renderHome) — never a silent substitution, and the real Supabase
        // error is both logged (catalog.js) and kept here for the banner.
        this.setState({
          publicCatalogSource: 'demo-fallback',
          publicCatalogError: `${firstError.message || 'erro desconhecido'}${firstError.code ? ` (${firstError.code})` : ''}`,
          products: DEFAULT_PRODUCTS, recipes: DEFAULT_RECIPES,
        });
        return;
      }
      const recipeIds = (recsRes.data || []).map(r => r.id);
      const [ingRes, secRes] = await Promise.all([
        catalog.fetchRecipeIngredientsBulk(recipeIds), catalog.fetchRecipeSectionsBulk(recipeIds),
      ]);
      const secondError = ingRes.error || secRes.error;
      if (secondError) {
        this.setState({
          publicCatalogSource: 'demo-fallback',
          publicCatalogError: `${secondError.message || 'erro desconhecido'}${secondError.code ? ` (${secondError.code})` : ''}`,
          products: DEFAULT_PRODUCTS, recipes: DEFAULT_RECIPES,
        });
        return;
      }
      const ingByRecipe = {};
      (ingRes.data || []).forEach(i => { (ingByRecipe[i.recipe_id] = ingByRecipe[i.recipe_id] || []).push(i); });
      const secByRecipe = {};
      (secRes.data || []).forEach(s => { (secByRecipe[s.recipe_id] = secByRecipe[s.recipe_id] || []).push(s); });

      // Mapped into the exact same shape data.js's DEFAULT_PRODUCTS/
      // DEFAULT_RECIPES already used, so the rest of the (already extensive)
      // Home/Search/Detail rendering pipeline needs no changes at all — only
      // the data source changes, from a local seed to live Supabase data.
      const products = (prodsRes.data || []).map(p => ({
        id: p.id, nome: p.name, categoria: (p.category && p.category.name) || '', unidade: p.unit, preco: Number(p.price) || 0,
      }));
      const recipes = (recsRes.data || []).map(r => {
        const tags = (secByRecipe[r.id] || []).map(s => s.category && s.category.slug).filter(Boolean);
        if (r.featured) tags.push('destaque');
        return {
          id: r.id, nome: r.name, categoria: (r.category && r.category.name) || '', tempo: r.prep_time, porcoes: r.servings,
          dificuldade: r.difficulty, imagem: r.image_url || FALLBACK_IMG, tags,
          ingredientes: (ingByRecipe[r.id] || []).map(i => ({ produtoId: i.product_id, qtd: Number(i.quantity) || 0 })),
          extras: r.extras || [], modoPreparo: r.instructions || [], dicas: r.tips || [],
        };
      });
      this.setState({ publicCatalogSource: 'supabase', publicCatalogError: '', products, recipes });
    } catch (e) {
      // Same defensive net as loadMyCreationData: an unexpected synchronous
      // throw here (not a normal Supabase `{ error }` response, which is
      // already handled above) must still resolve publicCatalogSource out
      // of 'loading' instead of leaving Home stuck.
      this.setState({
        publicCatalogSource: 'demo-fallback',
        publicCatalogError: (e && e.message) || 'erro inesperado',
        products: DEFAULT_PRODUCTS, recipes: DEFAULT_RECIPES,
      });
    }
  };

  // =========================================================================
  // Modo de Criação: "Catálogo Público" — admin-only direct authoring of
  // scope='site' rows (supabase/006_admin_catalog_publishing.sql). Mirrors
  // the "Minhas Receitas/Produtos/Categorias" CRUD above, parametrized for
  // the public catalog instead of personal data.
  // =========================================================================
  siteRecipeCategories = () => this.state.siteCategories.filter(c => c.type === 'receita');
  siteSectionCategories = () => this.state.siteCategories.filter(c => c.type === 'secao');
  siteProteinCategories = () => this.state.siteCategories.filter(c => c.type === 'proteina');

  // `role` is optional and defaults to reading this.state.authRole — pass
  // it explicitly when calling synchronously right after applySessionProfile
  // in the same tick (e.g. onLoginSubmit), for the same reason
  // loadMyCreationData takes an explicit uid: this.state.authRole would
  // still be stale there (Preact setState hasn't flushed yet).
  loadSiteCatalogData = async (role) => {
    const effectiveRole = role !== undefined ? role : this.state.authRole;
    if (effectiveRole !== 'admin') return;
    this.setState({ siteCatalogLoading: true, siteCatalogError: '' });
    try {
      const [cats, prods, recs] = await Promise.all([
        catalog.fetchAdminCategories(), catalog.fetchAdminProducts(), catalog.fetchAdminRecipes(),
      ]);
      const failed = cats.error || prods.error || recs.error;
      if (failed) {
        const detail = failed.message ? `${failed.message}${failed.code ? ` (${failed.code})` : ''}` : 'erro desconhecido';
        this.setState({ siteCatalogError: `Não foi possível carregar o catálogo público: ${detail}` });
        return;
      }
      this.setState({ siteCategories: cats.data || [], siteProducts: prods.data || [], siteRecipes: recs.data || [] });
    } catch (e) {
      this.setState({ siteCatalogError: `Não foi possível carregar o catálogo público: ${(e && e.message) || 'erro inesperado'}` });
    } finally {
      this.setState({ siteCatalogLoading: false });
    }
  };

  onNewSiteCategory = () => this.setState({ showSiteCategoryForm: true, siteCategoryFormMode: 'new', siteFormError: '', siteCategoryForm: { id: null, type: 'receita', name: '', active: true } });
  onEditSiteCategory = (c) => this.setState({ showSiteCategoryForm: true, siteCategoryFormMode: 'edit', siteFormError: '', siteCategoryForm: { id: c.id, type: c.type, name: c.name, active: c.active } });
  onCancelSiteCategoryForm = () => this.setState({ showSiteCategoryForm: false, siteCategoryForm: null, siteFormError: '' });
  siteCategoryFormField = (field) => (e) => this.setState(s => ({ siteCategoryForm: { ...s.siteCategoryForm, [field]: e.target.value } }));
  toggleSiteCategoryFormActive = (e) => this.setState(s => ({ siteCategoryForm: { ...s.siteCategoryForm, active: e.target.checked } }));
  onSaveSiteCategoryForm = async () => {
    const f = this.state.siteCategoryForm;
    if (!f.name || !f.name.trim()) { this.setState({ siteFormError: 'Informe o nome da categoria.' }); return; }
    const res = f.id
      ? await catalog.updateSiteCategory(f.id, { name: f.name.trim(), active: !!f.active })
      : await catalog.createSiteCategory({ type: f.type, name: f.name.trim(), active: !!f.active });
    if (res.error) { this.setState({ siteFormError: `Não foi possível salvar: ${res.error.message || 'erro desconhecido'}` }); return; }
    this.setState({ showSiteCategoryForm: false, siteCategoryForm: null });
    this.loadSiteCatalogData();
  };
  onToggleSiteCategoryActive = async (c) => {
    const res = await catalog.updateSiteCategory(c.id, { active: !c.active });
    if (res.error) { this.flashAdmin(`Não foi possível atualizar: ${res.error.message || 'erro desconhecido'}`); return; }
    this.loadSiteCatalogData();
  };

  onNewSiteProduct = () => this.setState({ showSiteProductForm: true, siteProductFormMode: 'new', siteFormError: '', siteProductForm: { id: null, name: '', categoryId: (this.siteProteinCategories()[0] && this.siteProteinCategories()[0].id) || '', unit: 'kg', price: 0, active: true } });
  onEditSiteProduct = (p) => this.setState({ showSiteProductForm: true, siteProductFormMode: 'edit', siteFormError: '', siteProductForm: { id: p.id, name: p.name, categoryId: p.category_id, unit: p.unit, price: p.price, active: p.active } });
  onCancelSiteProductForm = () => this.setState({ showSiteProductForm: false, siteProductForm: null, siteFormError: '' });
  siteProductFormField = (field) => (e) => this.setState(s => ({ siteProductForm: { ...s.siteProductForm, [field]: e.target.value } }));
  toggleSiteProductFormActive = (e) => this.setState(s => ({ siteProductForm: { ...s.siteProductForm, active: e.target.checked } }));
  onSaveSiteProductForm = async () => {
    const f = this.state.siteProductForm;
    if (!f.name || !f.name.trim() || !f.categoryId) { this.setState({ siteFormError: 'Informe o nome e a categoria do produto.' }); return; }
    const patch = { name: f.name.trim(), category_id: f.categoryId, unit: f.unit, price: parseFloat(String(f.price).replace(',', '.')) || 0, active: !!f.active };
    const res = f.id
      ? await catalog.updateSiteProduct(f.id, patch)
      : await catalog.createSiteProduct({ name: patch.name, categoryId: patch.category_id, unit: patch.unit, price: patch.price, active: patch.active });
    if (res.error) { this.setState({ siteFormError: `Não foi possível salvar: ${res.error.message || 'erro desconhecido'}` }); return; }
    this.setState({ showSiteProductForm: false, siteProductForm: null });
    this.loadSiteCatalogData();
  };
  onToggleSiteProductActive = async (p) => {
    const res = await catalog.updateSiteProduct(p.id, { active: !p.active });
    if (res.error) { this.flashAdmin(`Não foi possível atualizar: ${res.error.message || 'erro desconhecido'}`); return; }
    this.loadSiteCatalogData();
  };

  onNewSiteRecipe = () => this.setState({
    showSiteRecipeForm: true, siteRecipeFormMode: 'new', siteFormError: '',
    siteRecipeForm: {
      id: null, name: '', categoryId: (this.siteRecipeCategories()[0] && this.siteRecipeCategories()[0].id) || '',
      prepTime: 30, servings: 4, difficulty: 'Fácil', imageUrl: '', featured: false, status: 'draft',
      ingredients: [{ productId: this.state.siteProducts[0] ? this.state.siteProducts[0].id : '', quantity: 1 }],
      sectionCategoryIds: [], extrasText: '', instructionsText: '', tipsText: '',
    },
  });
  onEditSiteRecipe = async (row) => {
    this.setState({ myRecipeDetailLoading: true, siteFormError: '' });
    const { data, error } = await catalog.fetchRecipeDetail(row.id);
    this.setState({ myRecipeDetailLoading: false });
    if (error || !data) { this.flashAdmin('Não foi possível carregar a receita.'); return; }
    this.setState({
      showSiteRecipeForm: true, siteRecipeFormMode: 'edit', siteFormError: '',
      siteRecipeForm: {
        id: data.recipe.id, name: data.recipe.name, categoryId: data.recipe.category_id,
        prepTime: data.recipe.prep_time, servings: data.recipe.servings, difficulty: data.recipe.difficulty,
        imageUrl: data.recipe.image_url || '', featured: !!data.recipe.featured, status: data.recipe.status,
        ingredients: data.ingredients.map(i => ({ productId: i.product_id, quantity: i.quantity })),
        sectionCategoryIds: data.sections.map(s => s.category_id),
        extrasText: (data.recipe.extras || []).join('\n'),
        instructionsText: (data.recipe.instructions || []).join('\n'),
        tipsText: (data.recipe.tips || []).join('\n'),
      },
    });
  };
  onCancelSiteRecipeForm = () => this.setState({ showSiteRecipeForm: false, siteRecipeForm: null, siteFormError: '' });
  siteRecipeFormField = (field) => (e) => this.setState(s => ({ siteRecipeForm: { ...s.siteRecipeForm, [field]: e.target.value } }));
  toggleSiteRecipeFormFeatured = (e) => this.setState(s => ({ siteRecipeForm: { ...s.siteRecipeForm, featured: e.target.checked } }));
  onSiteRecipeIngredientChange = (idx, field, value) => this.setState(s => ({ siteRecipeForm: { ...s.siteRecipeForm, ingredients: s.siteRecipeForm.ingredients.map((row, i) => i === idx ? { ...row, [field]: value } : row) } }));
  addSiteRecipeIngredient = () => this.setState(s => ({ siteRecipeForm: { ...s.siteRecipeForm, ingredients: [...s.siteRecipeForm.ingredients, { productId: this.state.siteProducts[0] ? this.state.siteProducts[0].id : '', quantity: 1 }] } }));
  removeSiteRecipeIngredient = (idx) => this.setState(s => ({ siteRecipeForm: { ...s.siteRecipeForm, ingredients: s.siteRecipeForm.ingredients.filter((_, i) => i !== idx) } }));
  toggleSiteRecipeSection = (categoryId) => this.setState(s => {
    const cur = s.siteRecipeForm.sectionCategoryIds;
    const sectionCategoryIds = cur.includes(categoryId) ? cur.filter(id => id !== categoryId) : [...cur, categoryId];
    return { siteRecipeForm: { ...s.siteRecipeForm, sectionCategoryIds } };
  });
  onSaveSiteRecipeForm = async () => {
    const f = this.state.siteRecipeForm;
    if (!f.name || !f.name.trim() || !f.categoryId) { this.setState({ siteFormError: 'Informe o nome e a categoria da receita.' }); return; }
    if (f.status !== 'draft' && f.status !== 'published') { this.setState({ siteFormError: 'Escolha "Rascunho" ou "Publicada".' }); return; }
    const validIngredients = f.ingredients.filter(i => i.productId);
    const fields = {
      name: f.name.trim(), categoryId: f.categoryId, prepTime: parseInt(f.prepTime, 10) || 0, servings: parseInt(f.servings, 10) || 0,
      difficulty: f.difficulty, imageUrl: f.imageUrl.trim() || null, featured: !!f.featured, status: f.status,
      extras: f.extrasText.split('\n').map(s => s.trim()).filter(Boolean),
      instructions: f.instructionsText.split('\n').map(s => s.trim()).filter(Boolean),
      tips: f.tipsText.split('\n').map(s => s.trim()).filter(Boolean),
    };
    this.setState({ siteFormError: '' });
    let recipeId = f.id;
    if (f.id) {
      const { error } = await catalog.updateSiteRecipe(f.id, {
        name: fields.name, category_id: fields.categoryId, prep_time: fields.prepTime, servings: fields.servings,
        difficulty: fields.difficulty, image_url: fields.imageUrl, featured: fields.featured, status: fields.status,
        extras: fields.extras, instructions: fields.instructions, tips: fields.tips,
      });
      if (error) { this.setState({ siteFormError: `Não foi possível salvar: ${error.message || 'erro desconhecido'}` }); return; }
    } else {
      const { data, error } = await catalog.createSiteRecipe(fields);
      if (error || !data) { this.setState({ siteFormError: `Não foi possível criar: ${(error && error.message) || 'erro desconhecido'}` }); return; }
      recipeId = data.id;
    }
    const [ingRes, catRes] = await Promise.all([
      catalog.replaceRecipeIngredients(recipeId, validIngredients.map(i => ({ productId: i.productId, quantity: parseFloat(String(i.quantity).replace(',', '.')) || 0 }))),
      catalog.replaceRecipeCategories(recipeId, f.sectionCategoryIds),
    ]);
    if (ingRes.error || catRes.error) this.flashAdmin('A receita foi salva, mas houve um erro ao salvar ingredientes ou seções.');
    this.setState({ showSiteRecipeForm: false, siteRecipeForm: null });
    this.loadSiteCatalogData();
    this.loadPublicCatalog();
  };
  onToggleSiteRecipeStatus = async (r) => {
    const nextStatus = r.status === 'published' ? 'draft' : 'published';
    const res = await catalog.updateSiteRecipe(r.id, { status: nextStatus });
    if (res.error) { this.flashAdmin(`Não foi possível atualizar: ${res.error.message || 'erro desconhecido'}`); return; }
    this.loadSiteCatalogData();
    this.loadPublicCatalog();
  };

  // =========================================================================
  // Change requests (fluxo de solicitações de publicação) —
  // supabase/007_change_requests.sql.
  // =========================================================================
  friendlyPublishError = (error) => {
    const msg = (error && error.message) || '';
    if (msg.includes('request_already_pending')) return 'Já existe uma solicitação em andamento para este item.';
    if (msg.includes('recipe_has_personal_dependencies')) return 'Esta receita ainda possui referências pessoais não publicadas.';
    if (msg.includes('product_has_personal_dependencies')) return 'A categoria deste produto ainda não é pública. Publique a categoria primeiro.';
    if (msg.includes('display_name_required')) return 'Complete seu perfil (nome) antes de enviar solicitações.';
    if (msg.includes('not_found_or_not_owned')) return 'Item não encontrado ou não pertence a você.';
    return `Não foi possível enviar a solicitação: ${msg || 'erro desconhecido'}`;
  };

  // "Solicitar publicação" — one generic modal reused for recipe/product/category.
  onOpenPublishRequest = async (entityType, sourceId, sourceName) => {
    this.setState({ publishRequest: { entityType, sourceId, sourceName, blockers: null, reasonValue: '' }, publishRequestError: '' });
    if (entityType === 'recipe') {
      this.setState({ publishRequestBusy: true });
      const { data, error } = await catalog.checkRecipePublishDependencies(sourceId);
      this.setState({ publishRequestBusy: false });
      if (error) { this.setState({ publishRequestError: `Não foi possível verificar dependências: ${error.message || 'erro desconhecido'}` }); return; }
      if (data && data.blocked) this.setState(s => ({ publishRequest: s.publishRequest ? { ...s.publishRequest, blockers: data } : s.publishRequest }));
    }
  };
  onClosePublishRequest = () => this.setState({ publishRequest: null, publishRequestError: '', publishRequestBusy: false });
  onPublishReasonChange = (e) => this.setState(s => ({ publishRequest: { ...s.publishRequest, reasonValue: e.target.value } }));
  onConfirmPublishRequest = async () => {
    const pr = this.state.publishRequest;
    if (!pr) return;
    this.setState({ publishRequestBusy: true, publishRequestError: '' });
    const fn = pr.entityType === 'recipe' ? catalog.submitRecipeRequest : pr.entityType === 'product' ? catalog.submitProductRequest : catalog.submitCategoryRequest;
    const { error } = await fn(pr.sourceId, pr.reasonValue.trim() || null);
    this.setState({ publishRequestBusy: false });
    if (error) { this.setState({ publishRequestError: this.friendlyPublishError(error) }); return; }
    this.setState({ publishRequest: null });
    this.flashAdmin('Solicitação de publicação enviada.');
    if (this.state.session) this.loadMyRequests(this.state.session.user.id);
  };

  // ---- "Meus Pedidos" (any authenticated user) ----
  loadMyRequests = async (uid) => {
    if (!uid) return;
    this.setState({ myRequestsLoading: true, myRequestsError: '' });
    try {
      const { data, error } = await catalog.fetchMyChangeRequests(uid);
      if (error) {
        this.setState({ myRequestsError: `Não foi possível carregar seus pedidos: ${error.message || 'erro desconhecido'}` });
        return;
      }
      this.setState({ myRequests: data || [] });
    } catch (e) {
      this.setState({ myRequestsError: `Não foi possível carregar seus pedidos: ${(e && e.message) || 'erro inesperado'}` });
    } finally {
      this.setState({ myRequestsLoading: false });
    }
  };
  setAdminTabMyRequests = () => { this.setState({ adminTab: 'myRequests' }); if (this.state.session) this.loadMyRequests(this.state.session.user.id); };
  setRequestFilterStatus = (status) => this.setState({ requestFilterStatus: status });
  onCancelMyRequest = async (id) => {
    const { error } = await catalog.cancelChangeRequest(id);
    if (error) { this.flashAdmin(`Não foi possível cancelar: ${error.message || 'erro desconhecido'}`); return; }
    this.flashAdmin('Solicitação cancelada.');
    this.loadMyRequests(this.state.session.user.id);
  };
  onResubmitMyRequest = async (req) => {
    this.setState({ resubmitBusyRequestId: req.id });
    const fn = req.entity_type === 'recipe' ? catalog.resubmitRecipeRequest : req.entity_type === 'product' ? catalog.resubmitProductRequest : catalog.resubmitCategoryRequest;
    const { error } = await fn(req.id, null);
    this.setState({ resubmitBusyRequestId: null });
    if (error) { this.flashAdmin(this.friendlyPublishError(error)); return; }
    this.flashAdmin('Solicitação reenviada.');
    this.loadMyRequests(this.state.session.user.id);
  };
  // "Editar item" for a changes_requested recipe/product/category request:
  // reuses the ordinary personal edit forms already built above — editing
  // there is exactly "corrija e reenvie", and onResubmitMyRequest reloads
  // the item fresh from the server regardless, per spec ("carregar
  // novamente o item pessoal do servidor").
  onEditRequestedItem = (req) => {
    if (req.entity_type === 'recipe') { this.onEditMyRecipe({ id: req.source_id }); return; }
    if (req.entity_type === 'product') { const p = this.state.myProducts.find(x => x.id === req.source_id); if (p) this.onEditMyProduct(p); return; }
    if (req.entity_type === 'category') { const c = this.state.myCategories.find(x => x.id === req.source_id); if (c) this.onEditMyCategory(c); }
  };

  // ---- Request detail (shared by "Meus Pedidos" and "Solicitações Recebidas") ----
  onOpenRequestDetail = async (id) => {
    this.setState({ selectedRequestId: id, requestDetailLoading: true, requestDetailError: '', selectedRequestRevisions: [], requestActionError: '' });
    try {
      const { data, error } = await catalog.fetchChangeRequestRevisions(id);
      if (error) { this.setState({ requestDetailError: `Não foi possível carregar o histórico: ${error.message || 'erro desconhecido'}` }); return; }
      this.setState({ selectedRequestRevisions: data || [] });
    } catch (e) {
      this.setState({ requestDetailError: `Não foi possível carregar o histórico: ${(e && e.message) || 'erro inesperado'}` });
    } finally {
      this.setState({ requestDetailLoading: false });
    }
  };
  onRetryRequestDetail = () => { if (this.state.selectedRequestId) this.onOpenRequestDetail(this.state.selectedRequestId); };
  onCloseRequestDetail = () => this.setState({ selectedRequestId: null, selectedRequestRevisions: [], requestDetailError: '' });

  // ---- "Solicitações Recebidas" (admin only) ----
  loadAllRequests = async (role) => {
    const effectiveRole = role !== undefined ? role : this.state.authRole;
    if (effectiveRole !== 'admin') return;
    this.setState({ allRequestsLoading: true, allRequestsError: '' });
    try {
      const { data, error } = await catalog.fetchAllChangeRequests();
      if (error) {
        this.setState({ allRequestsError: `Não foi possível carregar as solicitações: ${error.message || 'erro desconhecido'}` });
        return;
      }
      this.setState({ allRequests: data || [] });
    } catch (e) {
      this.setState({ allRequestsError: `Não foi possível carregar as solicitações: ${(e && e.message) || 'erro inesperado'}` });
    } finally {
      this.setState({ allRequestsLoading: false });
    }
  };
  setAdminTabRequestsInbox = () => { this.setState({ adminTab: 'requestsInbox' }); this.loadAllRequests(); };

  onOpenReturnRequestModal = () => this.setState({ showReturnRequestModal: true, returnNoteValue: '', requestActionError: '' });
  onCloseReturnRequestModal = () => this.setState({ showReturnRequestModal: false });
  onReturnNoteChange = (e) => this.setState({ returnNoteValue: e.target.value });
  onConfirmReturnRequest = async () => {
    const id = this.state.selectedRequestId;
    const note = this.state.returnNoteValue.trim();
    if (!note) { this.setState({ requestActionError: 'A nota é obrigatória para devolver.' }); return; }
    this.setState({ requestActionBusy: true, requestActionError: '' });
    const { error } = await catalog.returnChangeRequest(id, note);
    this.setState({ requestActionBusy: false });
    if (error) { this.setState({ requestActionError: `Não foi possível devolver: ${error.message || 'erro desconhecido'}` }); return; }
    this.setState({ showReturnRequestModal: false, selectedRequestId: null });
    this.flashAdmin('Solicitação devolvida para edição.');
    this.loadAllRequests();
  };

  onOpenRejectRequestModal = () => this.setState({ showRejectRequestModal: true, rejectNoteValue: '', requestActionError: '' });
  onCloseRejectRequestModal = () => this.setState({ showRejectRequestModal: false });
  onRejectNoteChange = (e) => this.setState({ rejectNoteValue: e.target.value });
  onConfirmRejectRequest = async () => {
    const id = this.state.selectedRequestId;
    const note = this.state.rejectNoteValue.trim();
    if (!note) { this.setState({ requestActionError: 'A nota é obrigatória para rejeitar.' }); return; }
    this.setState({ requestActionBusy: true, requestActionError: '' });
    const { error } = await catalog.reviewChangeRequest(id, 'reject', note, null);
    this.setState({ requestActionBusy: false });
    if (error) { this.setState({ requestActionError: `Não foi possível rejeitar: ${error.message || 'erro desconhecido'}` }); return; }
    this.setState({ showRejectRequestModal: false, selectedRequestId: null });
    this.flashAdmin('Solicitação rejeitada.');
    this.loadAllRequests();
  };

  friendlyReviewError = (error) => {
    const msg = (error && error.message) || '';
    if (msg.includes('version_conflict')) return 'O item público foi alterado desde o envio da solicitação (conflito de versão). Recuse ou peça reenvio.';
    if (msg.includes('stale_dependency')) return 'Uma das referências desta solicitação não está mais pública/ativa.';
    if (msg.includes('target_no_longer_exists')) return 'O item público de destino não existe mais.';
    return `Não foi possível aprovar: ${msg || 'erro desconhecido'}`;
  };
  onApproveRequest = async (publishMode) => {
    const id = this.state.selectedRequestId;
    this.setState({ requestActionBusy: true, requestActionError: '' });
    const { error } = await catalog.reviewChangeRequest(id, 'approve', null, publishMode);
    this.setState({ requestActionBusy: false });
    if (error) { this.setState({ requestActionError: this.friendlyReviewError(error) }); return; }
    this.setState({ selectedRequestId: null });
    this.flashAdmin(publishMode === 'published' ? 'Solicitação aprovada e publicada.' : 'Solicitação aprovada como rascunho.');
    this.loadAllRequests();
    this.loadPublicCatalog();
    this.loadSiteCatalogData();
  };

  setNavRailLeft = () => { this.setState({ navRailSide: 'left' }); this.persist(LS_KEYS.navRailSide, 'left'); };
  setNavRailRight = () => { this.setState({ navRailSide: 'right' }); this.persist(LS_KEYS.navRailSide, 'right'); };
  onSetFontSize = (fontSize) => { this.setState({ fontSize }); this.persist(LS_KEYS.fontSize, fontSize); };
  toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      const el = document.documentElement;
      (el.requestFullscreen && el.requestFullscreen()) || {};
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  };
  toggleDarkMode = () => {
    const darkMode = !this.state.darkMode;
    this.setState({ darkMode });
    this.persist(LS_KEYS.darkMode, darkMode);
  };
  toggleSection = (key) => this.setState(s => {
    const homeSections = s.homeSections.map(h => h.key === key ? { ...h, enabled: !h.enabled } : h);
    this.persist(LS_KEYS.sections, homeSections);
    return { homeSections };
  });
  onNewSectionLabelChange = (e) => this.setState({ newSectionLabel: e.target.value });
  addHomeSection = () => {
    const label = this.state.newSectionLabel.trim();
    if (!label) return;
    const slug = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || ('secao_' + Date.now());
    this.setState(s => {
      if (s.homeSections.some(h => h.key === slug)) return {};
      const homeSections = [...s.homeSections, { key: slug, label, enabled: true, custom: true }];
      this.persist(LS_KEYS.sections, homeSections);
      return { homeSections, newSectionLabel: '' };
    });
  };
  removeHomeSection = (key) => this.setState(s => {
    const homeSections = s.homeSections.filter(h => h.key !== key);
    this.persist(LS_KEYS.sections, homeSections);
    return { homeSections };
  });
  startSectionRowPress = (key) => {
    clearTimeout(this._sectionPressTimer);
    this._sectionPressTimer = setTimeout(() => {
      this.setState(s => ({ sectionSelectionMode: true, selectedSectionKeys: s.selectedSectionKeys.includes(key) ? s.selectedSectionKeys : [...s.selectedSectionKeys, key] }));
    }, 480);
  };
  endSectionRowPress = () => clearTimeout(this._sectionPressTimer);
  toggleSectionSelected = (key) => this.setState(s => {
    const has = s.selectedSectionKeys.includes(key);
    const selectedSectionKeys = has ? s.selectedSectionKeys.filter(x => x !== key) : [...s.selectedSectionKeys, key];
    return { selectedSectionKeys, sectionSelectionMode: selectedSectionKeys.length > 0 };
  });
  onCancelSectionSelection = () => this.setState({ sectionSelectionMode: false, selectedSectionKeys: [] });
  askBulkDeleteSections = () => this.setState({ confirmDelete: { type: 'bulk-delete-sections', ids: [...this.state.selectedSectionKeys], message: `Excluir ${this.state.selectedSectionKeys.length} seção(ões) selecionada(s)? Esta ação não pode ser desfeita.` } });
  toggleProtein = (key) => this.setState(s => {
    const productCategories = s.productCategories.map(c => c.key === key ? { ...c, enabled: !c.enabled } : c);
    this.persist(LS_KEYS.proteins, productCategories);
    return { productCategories };
  });
  onNewProteinLabelChange = (e) => this.setState({ newProteinLabel: e.target.value });
  addProductCategory = () => {
    const label = this.state.newProteinLabel.trim();
    if (!label) return;
    this.setState(s => {
      if (s.productCategories.some(c => c.label.toLowerCase() === label.toLowerCase())) return {};
      const productCategories = [...s.productCategories, { key: label, label, enabled: true, custom: true }];
      this.persist(LS_KEYS.proteins, productCategories);
      return { productCategories, newProteinLabel: '' };
    });
  };
  removeProductCategory = (key) => this.setState(s => {
    const productCategories = s.productCategories.filter(c => c.key !== key);
    this.persist(LS_KEYS.proteins, productCategories);
    return { productCategories };
  });
  startProteinRowPress = (key) => {
    clearTimeout(this._proteinPressTimer);
    this._proteinPressTimer = setTimeout(() => {
      this.setState(s => ({ proteinSelectionMode: true, selectedProteinKeys: s.selectedProteinKeys.includes(key) ? s.selectedProteinKeys : [...s.selectedProteinKeys, key] }));
    }, 480);
  };
  endProteinRowPress = () => clearTimeout(this._proteinPressTimer);
  toggleProteinSelected = (key) => this.setState(s => {
    const has = s.selectedProteinKeys.includes(key);
    const selectedProteinKeys = has ? s.selectedProteinKeys.filter(x => x !== key) : [...s.selectedProteinKeys, key];
    return { selectedProteinKeys, proteinSelectionMode: selectedProteinKeys.length > 0 };
  });
  onCancelProteinSelection = () => this.setState({ proteinSelectionMode: false, selectedProteinKeys: [] });
  askBulkDeleteProteins = () => this.setState({ confirmDelete: { type: 'bulk-delete-proteins', ids: [...this.state.selectedProteinKeys], message: `Excluir ${this.state.selectedProteinKeys.length} categoria(s) selecionada(s)? Esta ação não pode ser desfeita.` } });

  onToggleRecipeMenu = (id) => this.setState(s => ({ recipeMenuOpenId: s.recipeMenuOpenId === id ? null : id }));
  duplicateRecipe = (r) => {
    const copy = { ...r, id: 'r_' + Date.now(), nome: r.nome + ' (cópia)', ingredientes: r.ingredientes.map(i => ({ ...i })), extras: [...(r.extras || [])], modoPreparo: [...(r.modoPreparo || [])], dicas: [...(r.dicas || [])], tags: [...(r.tags || [])] };
    const recipes = [...this.state.recipes, copy];
    this.setState({ recipes, recipeMenuOpenId: null });
    this.persist(LS_KEYS.recipes, recipes);
  };
  toggleHideRecipe = (id) => this.setState(s => {
    const has = s.hiddenRecipeIds.includes(id);
    const hiddenRecipeIds = has ? s.hiddenRecipeIds.filter(x => x !== id) : [...s.hiddenRecipeIds, id];
    this.persist(LS_KEYS.hidden, hiddenRecipeIds);
    return { hiddenRecipeIds, recipeMenuOpenId: null };
  });
  toggleDestaqueTag = (id) => this.setState(s => {
    const recipes = s.recipes.map(r => r.id === id ? { ...r, tags: r.tags.includes('destaque') ? r.tags.filter(t => t !== 'destaque') : [...r.tags, 'destaque'] } : r);
    this.persist(LS_KEYS.recipes, recipes);
    return { recipes };
  });

  startRowPress = (id) => {
    clearTimeout(this._pressTimer);
    this._pressTimer = setTimeout(() => {
      this.setState(s => ({ selectionMode: true, selectedRecipeIds: s.selectedRecipeIds.includes(id) ? s.selectedRecipeIds : [...s.selectedRecipeIds, id] }));
    }, 480);
  };
  endRowPress = () => clearTimeout(this._pressTimer);
  toggleRecipeSelected = (id) => this.setState(s => {
    const has = s.selectedRecipeIds.includes(id);
    const selectedRecipeIds = has ? s.selectedRecipeIds.filter(x => x !== id) : [...s.selectedRecipeIds, id];
    return { selectedRecipeIds, selectionMode: selectedRecipeIds.length > 0 };
  });
  onCancelSelection = () => this.setState({ selectionMode: false, selectedRecipeIds: [] });
  askBulkHide = () => this.setState({ confirmDelete: { type: 'bulk-hide', ids: [...this.state.selectedRecipeIds], message: `Ocultar ${this.state.selectedRecipeIds.length} receita(s) selecionada(s)? Elas deixarão de aparecer para os usuários.` } });
  askBulkDelete = () => this.setState({ confirmDelete: { type: 'bulk-delete', ids: [...this.state.selectedRecipeIds], message: `Excluir ${this.state.selectedRecipeIds.length} receita(s) selecionada(s)? Esta ação não pode ser desfeita.` } });

  toggleChecklist = (recipeId, idx) => {
    this.setState(s => {
      const cur = s.checklists[recipeId] || {};
      return { checklists: { ...s.checklists, [recipeId]: { ...cur, [idx]: !cur[idx] } } };
    });
  };

  openAltModal = (recipeId, idx, categoria, currentProdutoId) => {
    this.setState({ altModal: { recipeId, idx, categoria, currentProdutoId } });
  };
  closeAltModal = () => this.setState({ altModal: null });
  chooseAlt = (recipeId, idx, newProdutoId) => {
    this.setState(s => ({
      ingredientOverrides: { ...s.ingredientOverrides, [recipeId]: { ...(s.ingredientOverrides[recipeId] || {}), [idx]: newProdutoId } },
      altModal: null,
    }));
  };

  findProduct = (id) => this.state.products.find(p => p.id === id);

  makeRecipeCard = (r, fromScreen, idx) => {
    const d = Math.min(idx || 0, 12) * 65;
    const rise = `animation:ycRise 0.5s cubic-bezier(0.22,0.8,0.24,1) ${d}ms backwards`;
    return {
      id: r.id, nome: r.nome, imagem: r.imagem, categoria: r.categoria, dificuldade: r.dificuldade,
      tempoLabel: r.tempo + ' min', porcoesLabel: r.porcoes + ' porções',
      carouselStyle: `flex:0 0 ${this.state.deviceMode === 'desktop' ? 280 : (this.state.deviceMode === 'tablet' ? 260 : 240)}px;cursor:pointer;transition:transform 0.18s ease,flex-basis 0.2s ease;scroll-snap-align:start;${rise}`,
      gridCardStyle: `position:relative;cursor:pointer;background:var(--neutral-0);border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-sm);border:1px solid var(--neutral-100);transition:transform 0.18s ease,box-shadow 0.18s ease;${rise}`,
      onOpen: () => { this.setState({ previousDetailScreen: fromScreen }); this.selectRecipe(r.id); },
      onToggleFavorite: () => this.toggleFavorite(r.id),
    };
  };

  askDeleteRecipe = (id, nome) => this.setState({ confirmDelete: { type: 'recipe', id, message: `Excluir a receita "${nome}"? Esta ação não pode ser desfeita.` } });
  askDeleteProduct = (id, nome) => this.setState({ confirmDelete: { type: 'product', id, message: `Excluir o produto "${nome}"? Ele será removido também das receitas que o usam.` } });
  onConfirmDeleteNo = () => this.setState({ confirmDelete: null });
  onConfirmDeleteYes = async () => {
    const cd = this.state.confirmDelete; if (!cd) return;
    if (cd.type === 'myRecipe' || cd.type === 'myProduct' || cd.type === 'myCategory') {
      const uid = this.state.session.user.id;
      const fn = cd.type === 'myRecipe' ? catalog.deleteRecipe : cd.type === 'myProduct' ? catalog.deleteProduct : catalog.deleteCategory;
      const { error } = await fn(cd.id);
      this.setState({ confirmDelete: null });
      if (error) {
        // The delete itself failed (e.g. FK restriction from another row
        // still referencing it) — nothing to refetch differently for, the
        // list on screen is already accurate since nothing changed server-side.
        this.flashAdmin('Não foi possível excluir. Verifique se o item ainda está em uso em outra receita.');
        return;
      }
      // Delete succeeded — refetch to drop it from every list, differentiating
      // a refresh-only failure from a delete failure the same way every other
      // personal mutation does (see refreshAfterMyCreationMutation).
      this.refreshAfterMyCreationMutation(uid, 'Item excluído com sucesso.');
      return;
    }
    if (cd.type === 'recipe') {
      const recipes = this.state.recipes.filter(r => r.id !== cd.id);
      this.setState({ recipes, confirmDelete: null }); this.persist(LS_KEYS.recipes, recipes);
    } else if (cd.type === 'product') {
      const products = this.state.products.filter(p => p.id !== cd.id);
      this.setState({ products, confirmDelete: null }); this.persist(LS_KEYS.products, products);
    } else if (cd.type === 'bulk-hide') {
      const hiddenRecipeIds = Array.from(new Set([...this.state.hiddenRecipeIds, ...cd.ids]));
      this.setState({ hiddenRecipeIds, confirmDelete: null, selectionMode: false, selectedRecipeIds: [] });
      this.persist(LS_KEYS.hidden, hiddenRecipeIds);
    } else if (cd.type === 'bulk-delete') {
      const recipes = this.state.recipes.filter(r => !cd.ids.includes(r.id));
      this.setState({ recipes, confirmDelete: null, selectionMode: false, selectedRecipeIds: [] });
      this.persist(LS_KEYS.recipes, recipes);
    } else if (cd.type === 'sale') {
      const vendas = this.state.vendas.filter(v => v.id !== cd.id);
      this.setState({ vendas, confirmDelete: null });
      this.persist(LS_KEYS.vendas, vendas);
    } else if (cd.type === 'bulk-delete-sales') {
      const vendas = this.state.vendas.filter(v => !cd.ids.includes(v.id));
      this.setState({ vendas, confirmDelete: null, saleSelectionMode: false, selectedSaleIds: [] });
      this.persist(LS_KEYS.vendas, vendas);
    } else if (cd.type === 'bulk-delete-products') {
      const products = this.state.products.filter(p => !cd.ids.includes(p.id));
      this.setState({ products, confirmDelete: null, productSelectionMode: false, selectedProductIds: [] });
      this.persist(LS_KEYS.products, products);
    } else if (cd.type === 'bulk-delete-sections') {
      const homeSections = this.state.homeSections.filter(h => !cd.ids.includes(h.key));
      this.setState({ homeSections, confirmDelete: null, sectionSelectionMode: false, selectedSectionKeys: [] });
      this.persist(LS_KEYS.sections, homeSections);
    } else if (cd.type === 'bulk-delete-proteins') {
      const productCategories = this.state.productCategories.filter(c => !cd.ids.includes(c.key));
      this.setState({ productCategories, confirmDelete: null, proteinSelectionMode: false, selectedProteinKeys: [] });
      this.persist(LS_KEYS.proteins, productCategories);
    }
  };

  startEditPrice = (id, current) => this.setState({ editingProductId: id, editPriceValue: String(current) });
  onEditPriceChange = (e) => this.setState({ editPriceValue: e.target.value });
  savePrice = (id) => {
    const val = parseFloat(this.state.editPriceValue.replace(',', '.'));
    const products = this.state.products.map(p => p.id === id ? { ...p, preco: isNaN(val) ? p.preco : val } : p);
    this.setState({ products, editingProductId: null });
    this.persist(LS_KEYS.products, products);
  };
  startProductRowPress = (id) => {
    clearTimeout(this._productPressTimer);
    this._productPressTimer = setTimeout(() => {
      this.setState(s => ({ productSelectionMode: true, selectedProductIds: s.selectedProductIds.includes(id) ? s.selectedProductIds : [...s.selectedProductIds, id] }));
    }, 480);
  };
  endProductRowPress = () => clearTimeout(this._productPressTimer);
  toggleProductSelected = (id) => this.setState(s => {
    const has = s.selectedProductIds.includes(id);
    const selectedProductIds = has ? s.selectedProductIds.filter(x => x !== id) : [...s.selectedProductIds, id];
    return { selectedProductIds, productSelectionMode: selectedProductIds.length > 0 };
  });
  onCancelProductSelection = () => this.setState({ productSelectionMode: false, selectedProductIds: [] });
  askBulkDeleteProducts = () => this.setState({ confirmDelete: { type: 'bulk-delete-products', ids: [...this.state.selectedProductIds], message: `Excluir ${this.state.selectedProductIds.length} produto(s) selecionado(s)? Eles serão removidos também das receitas que os usam.` } });

  onNewRecipe = () => this.setState({
    showRecipeForm: true, recipeFormMode: 'new',
    recipeForm: {
      id: null, nome: '', categoria: this.categoriasReceita[0] || 'Bovina', tempo: 30, porcoes: 4, dificuldade: 'Fácil',
      imagem: `https://picsum.photos/seed/novo${Date.now()}/900/650`, tagDestaque: false, tags: ['pratico'],
      ingredientes: [{ produtoId: this.state.products[0] ? this.state.products[0].id : '', qtd: 1 }],
      extrasText: '', modoPreparoText: '', dicasText: '',
    },
  });
  onEditRecipe = (r) => this.setState({
    showRecipeForm: true, recipeFormMode: 'edit', recipeMenuOpenId: null,
    recipeForm: {
      id: r.id, nome: r.nome, categoria: r.categoria, tempo: r.tempo, porcoes: r.porcoes, dificuldade: r.dificuldade, imagem: r.imagem,
      tagDestaque: r.tags.includes('destaque'), tags: r.tags.filter(t => t !== 'destaque'),
      ingredientes: r.ingredientes.map(i => ({ ...i })), extrasText: (r.extras || []).join('\n'), modoPreparoText: (r.modoPreparo || []).join('\n'), dicasText: (r.dicas || []).join('\n'),
    },
  });
  onCancelRecipeForm = () => this.setState({ showRecipeForm: false, recipeForm: null });
  recipeFormField = (field) => (e) => this.setState(s => ({ recipeForm: { ...s.recipeForm, [field]: e.target.value } }));
  recipeFormCheck = (field) => (e) => this.setState(s => ({ recipeForm: { ...s.recipeForm, [field]: e.target.checked } }));
  setFormField = (stateKey, field) => (value) => this.setState(s => ({ [stateKey]: { ...s[stateKey], [field]: value } }));
  toggleFormTag = (key) => this.setState(s => {
    const cur = s.recipeForm.tags || [];
    const tags = cur.includes(key) ? cur.filter(t => t !== key) : [...cur, key];
    return { recipeForm: { ...s.recipeForm, tags } };
  });
  onRandomImage = () => this.setState(s => ({ recipeForm: { ...s.recipeForm, imagem: `https://picsum.photos/seed/r${Date.now()}/900/650` } }));
  updateIngredientRow = (idx, field, value) => this.setState(s => {
    const ingredientes = s.recipeForm.ingredientes.map((row, i) => i === idx ? { ...row, [field]: value } : row);
    return { recipeForm: { ...s.recipeForm, ingredientes } };
  });
  addIngredientRow = () => this.setState(s => ({ recipeForm: { ...s.recipeForm, ingredientes: [...s.recipeForm.ingredientes, { produtoId: this.state.products[0] ? this.state.products[0].id : '', qtd: 1 }] } }));
  removeIngredientRow = (idx) => this.setState(s => ({ recipeForm: { ...s.recipeForm, ingredientes: s.recipeForm.ingredientes.filter((_, i) => i !== idx) } }));
  onSaveRecipeForm = () => {
    const f = this.state.recipeForm;
    if (!f.nome || !f.nome.trim()) return;
    const tags = [...(f.tags || [])];
    if (f.tagDestaque) tags.push('destaque');
    const recipe = {
      id: f.id || ('r_' + Date.now()), nome: f.nome, categoria: f.categoria, tempo: parseInt(f.tempo) || 0, porcoes: parseInt(f.porcoes) || 0,
      dificuldade: f.dificuldade, imagem: f.imagem, tags,
      ingredientes: f.ingredientes.filter(i => i.produtoId).map(i => ({ produtoId: i.produtoId, qtd: parseFloat(i.qtd) || 0 })),
      extras: f.extrasText.split('\n').map(s => s.trim()).filter(Boolean),
      modoPreparo: f.modoPreparoText.split('\n').map(s => s.trim()).filter(Boolean),
      dicas: f.dicasText.split('\n').map(s => s.trim()).filter(Boolean),
    };
    let recipes;
    if (f.id) recipes = this.state.recipes.map(r => r.id === f.id ? recipe : r);
    else recipes = [...this.state.recipes, recipe];
    this.setState({ recipes, showRecipeForm: false, recipeForm: null });
    this.persist(LS_KEYS.recipes, recipes);
  };

  onOpenImportModal = () => this.setState({ showImportModal: true, importStep: 'instructions', importFileName: '', importParseError: '', importParsedProducts: [], importParsedRecipes: [], importErrors: [], importWarnings: [], importNewProductCategories: [], importNewSections: [], importMode: 'merge' });
  onCloseImportModal = () => this.setState({ showImportModal: false });
  onBackToInstructions = () => this.setState({ importStep: 'instructions', importParseError: '' });
  onSetImportModeMerge = () => this.setState({ importMode: 'merge' });
  onSetImportModeReplaceMatching = () => this.setState({ importMode: 'replaceMatching' });
  onSetImportModeReplace = () => this.setState({ importMode: 'replace' });

  onDownloadTemplate = () => {
    if (!window.XLSX) return;
    const produtosSheet = XLSX.utils.json_to_sheet([
      { nome: 'Picanha', categoria: 'Bovinos', unidade: 'kg', preco: 89.90 },
      { nome: 'Sal Grosso', categoria: 'Mercearia', unidade: 'pacote', preco: 6.90 },
    ]);
    const receitasSheet = XLSX.utils.json_to_sheet([
      { nome: 'Picanha na Brasa', categoria: 'Bovina', tempo: 50, porcoes: 6, dificuldade: 'Fácil', imagem: 'https://picsum.photos/seed/exemplo/900/650', tags: 'destaque,ocasiao', ingredientes: 'Picanha:1.5; Sal Grosso:0.2', extras: 'Carvão para churrasqueira; Pimenta a gosto', modoPreparo: 'Tempere a carne com sal grosso.; Grelhe na churrasqueira até o ponto desejado.; Deixe descansar antes de fatiar.', dicas: 'Não fure a carne ao virar.' },
    ]);
    const categoriasSheet = XLSX.utils.json_to_sheet([
      { tipo: 'proteina', nome: 'Caprinos' },
      { tipo: 'secao', nome: 'Receitas Veganas' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, produtosSheet, 'Produtos');
    XLSX.utils.book_append_sheet(wb, receitasSheet, 'Receitas');
    XLSX.utils.book_append_sheet(wb, categoriasSheet, 'Categorias');
    XLSX.writeFile(wb, 'modelo-yourcipe.xlsx');
  };

  onImportFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        this.processImportWorkbook(wb, file.name);
      } catch (err) {
        this.setState({ importParseError: 'Não foi possível ler o arquivo. Verifique se é um .xlsx válido.' });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  processImportWorkbook = (wb, fileName) => {
    const prodSheetName = wb.SheetNames.find(n => n.trim().toLowerCase() === 'produtos') || wb.SheetNames[0];
    const recSheetName = wb.SheetNames.find(n => n.trim().toLowerCase() === 'receitas') || wb.SheetNames[1];
    const catSheetName = wb.SheetNames.find(n => n.trim().toLowerCase() === 'categorias');
    const prodRows = prodSheetName ? XLSX.utils.sheet_to_json(wb.Sheets[prodSheetName], { defval: '' }) : [];
    const recRows = recSheetName ? XLSX.utils.sheet_to_json(wb.Sheets[recSheetName], { defval: '' }) : [];
    const catRows = catSheetName ? XLSX.utils.sheet_to_json(wb.Sheets[catSheetName], { defval: '' }) : [];

    const errors = [], warnings = [], parsedProducts = [];
    const newProductCategories = [], newSections = [];
    const slugify = (label) => label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    catRows.forEach((row, i) => {
      const line = i + 2;
      const tipo = String(row.tipo || '').trim().toLowerCase();
      const nome = String(row.nome || '').trim();
      if (!nome) { errors.push(`Categorias, linha ${line}: nome ausente.`); return; }
      if (tipo === 'proteina') { if (!newProductCategories.some(c => c.label.toLowerCase() === nome.toLowerCase())) newProductCategories.push({ key: nome, label: nome }); }
      else if (tipo === 'secao') { if (!newSections.some(c => c.label.toLowerCase() === nome.toLowerCase())) newSections.push({ key: slugify(nome), label: nome }); }
      else errors.push(`Categorias, linha ${line} ("${nome}"): tipo "${row.tipo}" inválido — use "proteina" ou "secao".`);
    });
    const allowedProteinLabels = new Set([...this.state.productCategories.filter(c => c.enabled).map(c => c.label), ...newProductCategories.map(c => c.label)]);
    const allowedSectionKeys = new Set(['destaque', ...this.state.homeSections.filter(h => h.enabled).map(h => h.key), ...newSections.map(h => h.key)]);
    const seenProdNames = new Set();

    prodRows.forEach((row, i) => {
      const line = i + 2;
      const nome = String(row.nome || '').trim();
      const categoria = String(row.categoria || '').trim();
      const unidade = String(row.unidade || '').trim();
      const preco = parseFloat(String(row.preco).replace(',', '.'));
      if (!nome) { errors.push(`Produtos, linha ${line}: nome ausente.`); return; }
      if (!categoria) errors.push(`Produtos, linha ${line} ("${nome}"): categoria ausente.`);
      else if (!allowedProteinLabels.has(categoria)) errors.push(`Produtos, linha ${line} ("${nome}"): categoria "${categoria}" não está habilitada nem declarada na aba Categorias.`);
      if (!unidade) errors.push(`Produtos, linha ${line} ("${nome}"): unidade ausente.`);
      else if (!UNIDADES.includes(unidade)) errors.push(`Produtos, linha ${line} ("${nome}"): unidade "${unidade}" inválida.`);
      if (isNaN(preco)) errors.push(`Produtos, linha ${line} ("${nome}"): preço ausente ou inválido.`);
      parsedProducts.push({ id: 'imp_p_' + i + '_' + Date.now(), nome, categoria, unidade, preco: isNaN(preco) ? 0 : preco });
      seenProdNames.add(nome.toLowerCase());
    });

    const existingNames = new Set(this.state.products.map(p => p.nome.toLowerCase()));
    const parsedRecipes = [];
    recRows.forEach((row, i) => {
      const line = i + 2;
      const nome = String(row.nome || '').trim();
      const categoria = String(row.categoria || '').trim();
      const tempo = parseInt(row.tempo);
      const porcoes = parseInt(row.porcoes);
      const dificuldade = String(row.dificuldade || '').trim();
      const imagem = String(row.imagem || '').trim();
      const tagsRaw = String(row.tags || '').trim();
      const ingRaw = String(row.ingredientes || '').trim();
      const extrasRaw = String(row.extras || '').trim();
      const modoRaw = String(row.modoPreparo || '').trim();
      const dicasRaw = String(row.dicas || '').trim();

      if (!nome) { errors.push(`Receitas, linha ${line}: nome ausente.`); return; }
      if (!categoria) errors.push(`Receitas, linha ${line} ("${nome}"): categoria ausente.`);
      else if (!CATEGORIAS_RECEITA.includes(categoria)) errors.push(`Receitas, linha ${line} ("${nome}"): categoria "${categoria}" inválida.`);
      if (!tempo || isNaN(tempo)) errors.push(`Receitas, linha ${line} ("${nome}"): tempo ausente ou inválido.`);
      if (!porcoes || isNaN(porcoes)) errors.push(`Receitas, linha ${line} ("${nome}"): porções ausente ou inválido.`);
      if (!dificuldade) errors.push(`Receitas, linha ${line} ("${nome}"): dificuldade ausente.`);
      else if (!DIFICULDADES.includes(dificuldade)) errors.push(`Receitas, linha ${line} ("${nome}"): dificuldade "${dificuldade}" inválida.`);
      if (!ingRaw) errors.push(`Receitas, linha ${line} ("${nome}"): ingredientes ausentes.`);
      if (!modoRaw) errors.push(`Receitas, linha ${line} ("${nome}"): modo de preparo ausente.`);

      const validTags = Array.from(allowedSectionKeys);
      const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(t => validTags.includes(t)) : [];

      const ingredientesRaw = [];
      if (ingRaw) {
        ingRaw.split(';').map(s => s.trim()).filter(Boolean).forEach(part => {
          const sep = part.lastIndexOf(':');
          if (sep === -1) { errors.push(`Receitas, linha ${line} ("${nome}"): ingrediente "${part}" fora do formato "Produto:quantidade".`); return; }
          const prodNome = part.slice(0, sep).trim();
          const qtd = parseFloat(part.slice(sep + 1).replace(',', '.'));
          if (isNaN(qtd)) { errors.push(`Receitas, linha ${line} ("${nome}"): quantidade inválida para "${prodNome}".`); return; }
          const key = prodNome.toLowerCase();
          if (!seenProdNames.has(key) && !existingNames.has(key)) warnings.push(`Receita "${nome}": produto "${prodNome}" não está cadastrado.`);
          ingredientesRaw.push({ produtoNome: prodNome, qtd });
        });
      }

      parsedRecipes.push({
        id: 'imp_r_' + i + '_' + Date.now(), nome, categoria, tempo: isNaN(tempo) ? 0 : tempo, porcoes: isNaN(porcoes) ? 0 : porcoes, dificuldade,
        imagem: imagem || `https://picsum.photos/seed/imp${i}${Date.now()}/900/650`, tags, ingredientesRaw,
        extras: extrasRaw ? extrasRaw.split(';').map(s => s.trim()).filter(Boolean) : [],
        modoPreparo: modoRaw ? modoRaw.split(';').map(s => s.trim()).filter(Boolean) : [],
        dicas: dicasRaw ? dicasRaw.split(';').map(s => s.trim()).filter(Boolean) : [],
      });
    });

    this.setState({ importStep: 'result', importFileName: fileName, importParseError: '', importParsedProducts: parsedProducts, importParsedRecipes: parsedRecipes, importErrors: errors, importWarnings: warnings, importNewProductCategories: newProductCategories, importNewSections: newSections });
  };

  onConfirmImport = () => {
    const s = this.state;
    const mode = s.importMode;
    let products;
    if (mode === 'replace') {
      products = s.importParsedProducts.map(p => ({ id: p.id, nome: p.nome, categoria: p.categoria, unidade: p.unidade, preco: p.preco }));
    } else {
      products = [...s.products];
      s.importParsedProducts.forEach(np => {
        const idx = products.findIndex(p => p.nome.toLowerCase() === np.nome.toLowerCase());
        if (idx >= 0) products[idx] = { ...products[idx], categoria: np.categoria, unidade: np.unidade, preco: np.preco };
        else products.push({ id: np.id, nome: np.nome, categoria: np.categoria, unidade: np.unidade, preco: np.preco });
      });
    }

    const nameToId = {};
    products.forEach(p => { nameToId[p.nome.toLowerCase()] = p.id; });
    const buildRecipe = (r) => ({
      id: r.id, nome: r.nome, categoria: r.categoria, tempo: r.tempo, porcoes: r.porcoes, dificuldade: r.dificuldade, imagem: r.imagem, tags: r.tags,
      ingredientes: r.ingredientesRaw.map(i => ({ produtoId: nameToId[i.produtoNome.toLowerCase()] || '', qtd: i.qtd })).filter(i => i.produtoId),
      extras: r.extras, modoPreparo: r.modoPreparo, dicas: r.dicas,
    });

    let recipes;
    if (mode === 'replace') {
      recipes = s.importParsedRecipes.map(buildRecipe);
    } else if (mode === 'replaceMatching') {
      const importedNames = new Set(s.importParsedRecipes.map(nr => nr.nome.toLowerCase()));
      recipes = s.recipes.filter(r => !importedNames.has(r.nome.toLowerCase()));
      s.importParsedRecipes.forEach(nr => recipes.push(buildRecipe(nr)));
    } else {
      recipes = [...s.recipes];
      s.importParsedRecipes.forEach(nr => {
        const built = buildRecipe(nr);
        const idx = recipes.findIndex(r => r.nome.toLowerCase() === nr.nome.toLowerCase());
        if (idx >= 0) recipes[idx] = { ...built, id: recipes[idx].id };
        else recipes.push(built);
      });
    }

    let productCategories = s.productCategories;
    (s.importNewProductCategories || []).forEach(nc => {
      if (!productCategories.some(c => c.label.toLowerCase() === nc.label.toLowerCase())) productCategories = [...productCategories, { key: nc.label, label: nc.label, enabled: true, custom: true }];
    });
    let homeSections = s.homeSections;
    (s.importNewSections || []).forEach(ns => {
      if (!homeSections.some(h => h.key === ns.key)) homeSections = [...homeSections, { key: ns.key, label: ns.label, enabled: true, custom: true }];
    });

    this.setState({ products, recipes, productCategories, homeSections, showImportModal: false, adminFlash: `Importação concluída: ${s.importParsedProducts.length} produtos e ${s.importParsedRecipes.length} receitas processados.` });
    this.persist(LS_KEYS.products, products);
    this.persist(LS_KEYS.recipes, recipes);
    this.persist(LS_KEYS.proteins, productCategories);
    this.persist(LS_KEYS.sections, homeSections);
    setTimeout(() => this.setState({ adminFlash: '' }), 5000);
  };

  onNewProduct = () => this.setState({ showProductForm: true, productFormMode: 'new', productForm: { id: null, nome: '', categoria: (this.state.productCategories[0] && this.state.productCategories[0].label) || '', unidade: 'kg', preco: 0 } });
  onEditProduct = (p) => this.setState({ showProductForm: true, productFormMode: 'edit', productForm: { ...p } });
  onCancelProductForm = () => this.setState({ showProductForm: false, productForm: null });
  productFormField = (field) => (e) => this.setState(s => ({ productForm: { ...s.productForm, [field]: e.target.value } }));
  onSaveProductForm = () => {
    const f = this.state.productForm;
    if (!f.nome || !f.nome.trim()) return;
    const product = { id: f.id || ('p_' + Date.now()), nome: f.nome, categoria: f.categoria, unidade: f.unidade, preco: parseFloat(f.preco) || 0 };
    let products;
    if (f.id) products = this.state.products.map(p => p.id === f.id ? product : p);
    else products = [...this.state.products, product];
    this.setState({ products, showProductForm: false, productForm: null });
    this.persist(LS_KEYS.products, products);
  };

  // ---- View-model (equivalent to the design's renderVals()) ----
  computeViewModel() {
    const s = this.state;
    const screen = s.screen;
    const deviceMode = s.deviceMode || 'mobile';
    const isCompact = deviceMode === 'mobile';
    const isWide = !isCompact;
    const navRailWidth = 88;
    const frameMaxWidth = '100%';
    const frameMaxHeight = '100%';
    const navRailSide = s.navRailSide === 'right' ? 'right' : 'left';
    const showsRail = isWide && (screen === 'home' || screen === 'search' || screen === 'favorites' || screen === 'dados' || screen === 'profile');
    const stagePadLeft = showsRail ? (navRailSide === 'left' ? navRailWidth : 0) : 0;
    const stagePadRight = showsRail ? (navRailSide === 'right' ? navRailWidth : 0) : 0;
    const navRailSideStyle = navRailSide === 'right' ? 'right:0' : 'left:0';
    const navRailBorderColorVal = s.darkMode ? '#3A322DE6' : 'var(--tabbar-border)';
    const navRailBorderStyle = navRailSide === 'right' ? `border-left:1px solid ${navRailBorderColorVal}` : `border-right:1px solid ${navRailBorderColorVal}`;
    const scrollBottomPad = isCompact ? 150 : 32;
    const productOptions = s.products.map(p => ({ value: p.id, label: `${p.nome} (${this.formatBRL(p.preco)}/${p.unidade})` }));

    const visibleRecipes = s.recipes.filter(r => !s.hiddenRecipeIds.includes(r.id));
    const byTag = (tag) => visibleRecipes.filter(r => r.tags.includes(tag)).map((r, i) => this.makeRecipeCard(r, 'home', i));
    const sectionOn = (key) => { const h = s.homeSections.find(x => x.key === key); return h ? h.enabled : false; };
    const recommendedList = sectionOn('recomendado') ? byTag('recomendado') : [];
    const practicalList = sectionOn('pratico') ? byTag('pratico') : [];
    const occasionList = sectionOn('ocasiao') ? byTag('ocasiao') : [];
    const quickList = sectionOn('rapido') ? byTag('rapido') : [];
    const churrascoList = sectionOn('churrasco') ? byTag('churrasco') : [];
    const snackList = sectionOn('petisco') ? byTag('petisco') : [];
    const customHomeSectionBlocks = s.homeSections.filter(h => h.custom && h.enabled).map(h => ({ key: h.key, label: h.label, items: byTag(h.key) })).filter(b => b.items.length > 0);
    const heroTagged = visibleRecipes.filter(r => r.tags.includes('destaque'));
    const heroSourceList = heroTagged.length ? heroTagged : (visibleRecipes[0] ? [visibleRecipes[0]] : []);
    const heroRecipes = heroSourceList.map((r, i) => this.makeRecipeCard(r, 'home', i));
    const heroCount = heroRecipes.length;
    const heroIndexSafe = Math.min(s.heroIndex || 0, Math.max(0, heroCount - 1));
    const heroHasMultiple = heroCount > 1;
    const heroDots = heroRecipes.map((r, i) => ({
      key: r.id, onClick: () => this.scrollHeroTo(i),
      style: `width:${i === heroIndexSafe ? '22px' : '8px'};height:8px;border-radius:var(--radius-full);background:${i === heroIndexSafe ? 'var(--brand-700)' : 'var(--neutral-200)'};transition:width 0.25s ease,background 0.25s ease;cursor:pointer`,
    }));
    const onHeroPrev = () => this.scrollHeroTo(Math.max(0, heroIndexSafe - 1));
    const onHeroNext = () => this.scrollHeroTo(Math.min(heroCount - 1, heroIndexSafe + 1));

    const q = s.searchQuery.trim().toLowerCase();
    const searchFiltered = visibleRecipes.filter(r => (s.activeFilter === 'Todas' || r.categoria === s.activeFilter) && (!q || r.nome.toLowerCase().includes(q)));
    const categoryChips = ['Todas', ...this.categoriasReceita].map(cat => ({
      label: cat, onClick: () => this.setFilter(cat),
      style: `padding:9px 18px;border-radius:var(--radius-full);font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;background:${s.activeFilter === cat ? 'var(--brand-700)' : 'var(--neutral-50)'};color:${s.activeFilter === cat ? 'var(--neutral-0)' : 'var(--neutral-800)'}`,
    }));
    const filteredSearchResults = searchFiltered.map((r, i) => this.makeRecipeCard(r, 'search', i));

    const favoritesList = visibleRecipes.filter(r => s.favoriteIds.includes(r.id)).map((r, i) => this.makeRecipeCard(r, 'favorites', i));
    const homeCategoryChips = this.categoriasReceita.map(cat => ({ label: cat, onClick: () => this.goSearchWithFilter(cat) }));

    let selectedRecipe = null, ingredientRows = [], extrasList = [], modoPreparoList = [], dicasList = [], totalABuyLabel = 'R$ 0,00', totalAllLabel = 'R$ 0,00', hasExtras = false;
    const selR = s.recipes.find(r => r.id === s.selectedRecipeId);
    if (selR) {
      const overrides = s.ingredientOverrides[selR.id] || {};
      const checks = s.checklists[selR.id] || {};
      let totalBuy = 0, totalAll = 0;
      ingredientRows = selR.ingredientes.map((ingRow, idx) => {
        const prodId = overrides[idx] || ingRow.produtoId;
        const prod = this.findProduct(prodId);
        const unidade = prod ? prod.unidade : '';
        const isPesavel = unidade === 'kg';
        const qtdComprar = isPesavel ? ingRow.qtd : Math.ceil(ingRow.qtd);
        const subtotal = prod ? prod.preco * qtdComprar : 0;
        totalAll += subtotal;
        const checked = !!checks[idx];
        if (!checked) totalBuy += subtotal;
        const qtdLabel = (!isPesavel && qtdComprar !== ingRow.qtd) ? `${this.formatQtd(ingRow.qtd)} ${this.pluralUnidade(unidade, ingRow.qtd)} · compra: ${this.formatQtd(qtdComprar)} ${this.pluralUnidade(unidade, qtdComprar)}` : `${this.formatQtd(ingRow.qtd)} ${this.pluralUnidade(unidade, ingRow.qtd)}`;
        return {
          idx, nome: prod ? prod.nome : 'Produto indisponível', qtdLabel,
          subtotalLabel: this.formatBRL(subtotal), checked, isOverridden: !!overrides[idx],
          checkboxStyle: `width:26px;height:26px;border-radius:8px;border:2px solid var(--brand-700);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;background:${checked ? 'var(--brand-700)' : 'transparent'};color:var(--neutral-0);font-size:15px;font-weight:700;transition:background 0.15s ease,transform 0.15s ease`,
          checkMark: checked ? '✓' : '',
          textDecoration: checked ? 'text-decoration:line-through;color:var(--neutral-400)' : '',
          onToggleCheck: () => this.toggleChecklist(selR.id, idx),
          onOpenAlt: () => this.openAltModal(selR.id, idx, prod ? prod.categoria : '', prodId),
        };
      });
      totalABuyLabel = this.formatBRL(totalBuy);
      totalAllLabel = this.formatBRL(totalAll);
      extrasList = selR.extras || [];
      hasExtras = extrasList.length > 0;
      modoPreparoList = (selR.modoPreparo || []).map((texto, i) => ({ numero: i + 1, texto }));
      dicasList = selR.dicas || [];
      selectedRecipe = {
        nome: selR.nome, imagem: selR.imagem || FALLBACK_IMG, tempoLabel: selR.tempo + ' min', porcoesLabel: selR.porcoes + ' porções', dificuldade: selR.dificuldade,
        heartFill: s.favoriteIds.includes(selR.id) ? '#D2562D' : 'none',
        onToggleFavorite: () => this.toggleFavorite(selR.id),
        onBack: this.backFromDetail,
        canEdit: s.adminUnlocked, onEdit: () => this.onEditRecipe(selR),
      };
    }

    let altModalOpen = false, altModalIngredientNome = '', altOptions = [], altOptionsEmpty = true;
    if (s.altModal) {
      altModalOpen = true;
      const curProd = this.findProduct(s.altModal.currentProdutoId);
      altModalIngredientNome = curProd ? curProd.nome : 'este item';
      const opts = s.products.filter(p => p.categoria === s.altModal.categoria && p.id !== s.altModal.currentProdutoId);
      altOptions = opts.map(p => ({ id: p.id, nome: p.nome, precoLabel: this.formatBRL(p.preco) + '/' + p.unidade, onChoose: () => this.chooseAlt(s.altModal.recipeId, s.altModal.idx, p.id) }));
      altOptionsEmpty = altOptions.length === 0;
    }

    const adminRecipeRows = s.recipes.map(r => {
      const isHidden = s.hiddenRecipeIds.includes(r.id);
      const selected = s.selectedRecipeIds.includes(r.id);
      const menuOpen = s.recipeMenuOpenId === r.id;
      return {
        id: r.id, nome: r.nome, categoria: r.categoria, dificuldade: r.dificuldade, tempoLabel: r.tempo + ' min', imagem: r.imagem || FALLBACK_IMG,
        isHidden, imgOpacity: isHidden ? 0.45 : 1,
        showCheckbox: s.selectionMode, showActions: !s.selectionMode,
        checkboxStyle: `width:24px;height:24px;border-radius:8px;border:2px solid var(--brand-700);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${selected ? 'var(--brand-700)' : 'transparent'};color:#F4F2F1;font-size:13px;font-weight:700`,
        checkMark: selected ? '✓' : '',
        rowStyle: `display:flex;align-items:center;gap:14px;background:${selected ? 'rgba(178,64,25,0.08)' : 'var(--neutral-0)'};border:1px solid ${selected ? 'var(--brand-500)' : 'var(--neutral-100)'};border-radius:var(--radius-md);padding:12px 16px;margin-bottom:10px;cursor:${s.selectionMode ? 'pointer' : 'default'};user-select:none`,
        menuOpen, hideLabel: isHidden ? 'Mostrar Receita' : 'Ocultar Receita',
        onPressStart: () => this.startRowPress(r.id), onPressEnd: this.endRowPress,
        onRowClick: () => { if (this.state.selectionMode) this.toggleRecipeSelected(r.id); },
        onToggleMenu: () => this.onToggleRecipeMenu(r.id),
        onEdit: () => this.onEditRecipe(r), onDuplicate: () => this.duplicateRecipe(r), onToggleHide: () => this.toggleHideRecipe(r.id),
        onDelete: () => this.askDeleteRecipe(r.id, r.nome),
      };
    });

    const destaqueRecipeRows = s.recipes.map(r => {
      const checked = r.tags.includes('destaque');
      return {
        id: r.id, nome: r.nome, imagem: r.imagem || FALLBACK_IMG, checked,
        onToggle: () => this.toggleDestaqueTag(r.id),
        rowStyle: `display:flex;align-items:center;gap:12px;background:${checked ? 'rgba(178,64,25,0.08)' : 'var(--neutral-0)'};border:1px solid ${checked ? 'var(--brand-500)' : 'var(--neutral-100)'};border-radius:var(--radius-md);padding:10px 14px;margin-bottom:8px;cursor:pointer;transition:background 0.15s ease,border-color 0.15s ease`,
        checkboxStyle: `width:22px;height:22px;border-radius:7px;border:2px solid var(--brand-700);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${checked ? 'var(--brand-700)' : 'transparent'};color:#F4F2F1;font-size:13px;font-weight:700;transition:background 0.15s ease`,
        checkMark: checked ? '✓' : '',
      };
    });
    const sectionToggleRows = s.homeSections.map(h => {
      const checked = h.enabled;
      const selected = s.selectedSectionKeys.includes(h.key);
      return {
        key: h.key, label: h.label, isCustom: h.custom, onToggle: () => this.toggleSection(h.key), onRemove: () => this.removeHomeSection(h.key),
        showCheckbox: s.sectionSelectionMode, showControls: !s.sectionSelectionMode,
        checkboxStyle: `width:22px;height:22px;border-radius:7px;border:2px solid var(--brand-700);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${selected ? 'var(--brand-700)' : 'transparent'};color:#F4F2F1;font-size:13px;font-weight:700`,
        checkMark: selected ? '✓' : '',
        rowStyle: `display:flex;align-items:center;justify-content:space-between;background:${selected ? 'rgba(178,64,25,0.08)' : 'var(--neutral-0)'};border:1px solid ${selected ? 'var(--brand-500)' : 'var(--neutral-100)'};border-radius:var(--radius-md);padding:14px 16px;margin-bottom:8px;cursor:${s.sectionSelectionMode ? 'pointer' : 'default'};user-select:none;transition:background 0.15s ease,border-color 0.15s ease`,
        onPressStart: () => this.startSectionRowPress(h.key), onPressEnd: this.endSectionRowPress,
        onRowClick: () => { if (this.state.sectionSelectionMode) this.toggleSectionSelected(h.key); },
        trackStyle: `width:44px;height:26px;border-radius:var(--radius-full);cursor:pointer;position:relative;transition:background 0.15s ease;background:${checked ? 'var(--brand-700)' : 'var(--neutral-200)'}`,
        thumbStyle: `width:20px;height:20px;border-radius:50%;background:#fff;position:absolute;top:3px;left:${checked ? '21px' : '3px'};transition:left 0.15s ease;box-shadow:var(--shadow-sm)`,
      };
    });
    const recipeFormTagRows = s.homeSections.map(h => ({ key: h.key, label: h.label, checked: !!(s.recipeForm && s.recipeForm.tags && s.recipeForm.tags.includes(h.key)), onToggle: () => this.toggleFormTag(h.key) }));
    const proteinToggleRows = s.productCategories.map(c => {
      const checked = c.enabled;
      const selected = s.selectedProteinKeys.includes(c.key);
      return {
        key: c.key, label: c.label, isCustom: c.custom, onToggle: () => this.toggleProtein(c.key), onRemove: () => this.removeProductCategory(c.key),
        showCheckbox: s.proteinSelectionMode, showControls: !s.proteinSelectionMode,
        checkboxStyle: `width:22px;height:22px;border-radius:7px;border:2px solid var(--brand-700);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${selected ? 'var(--brand-700)' : 'transparent'};color:#F4F2F1;font-size:13px;font-weight:700`,
        checkMark: selected ? '✓' : '',
        rowStyle: `display:flex;align-items:center;justify-content:space-between;background:${selected ? 'rgba(178,64,25,0.08)' : 'var(--neutral-0)'};border:1px solid ${selected ? 'var(--brand-500)' : 'var(--neutral-100)'};border-radius:var(--radius-md);padding:14px 16px;margin-bottom:8px;cursor:${s.proteinSelectionMode ? 'pointer' : 'default'};user-select:none;transition:background 0.15s ease,border-color 0.15s ease`,
        onPressStart: () => this.startProteinRowPress(c.key), onPressEnd: this.endProteinRowPress,
        onRowClick: () => { if (this.state.proteinSelectionMode) this.toggleProteinSelected(c.key); },
        trackStyle: `width:44px;height:26px;border-radius:var(--radius-full);cursor:pointer;position:relative;transition:background 0.15s ease;background:${checked ? 'var(--brand-700)' : 'var(--neutral-200)'}`,
        thumbStyle: `width:20px;height:20px;border-radius:50%;background:#fff;position:absolute;top:3px;left:${checked ? '21px' : '3px'};transition:left 0.15s ease;box-shadow:var(--shadow-sm)`,
      };
    });
    const adminProductRows = s.products.map(p => {
      const isEditing = s.editingProductId === p.id && !s.productSelectionMode;
      const selected = s.selectedProductIds.includes(p.id);
      return {
        id: p.id, nome: p.nome, categoria: p.categoria, unidade: p.unidade, precoLabel: this.formatBRL(p.preco),
        isEditing, isNotEditing: !isEditing, editPriceValue: isEditing ? s.editPriceValue : String(p.preco),
        showCheckbox: s.productSelectionMode, showActions: !s.productSelectionMode,
        checkboxStyle: `width:24px;height:24px;border-radius:8px;border:2px solid var(--brand-700);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${selected ? 'var(--brand-700)' : 'transparent'};color:#F4F2F1;font-size:13px;font-weight:700`,
        checkMark: selected ? '✓' : '',
        rowStyle: `display:flex;align-items:center;gap:14px;background:${selected ? 'rgba(178,64,25,0.08)' : 'var(--neutral-0)'};border:1px solid ${selected ? 'var(--brand-500)' : 'var(--neutral-100)'};border-radius:var(--radius-md);padding:12px 16px;margin-bottom:10px;cursor:${s.productSelectionMode ? 'pointer' : 'default'};user-select:none;transition:background 0.15s ease,border-color 0.15s ease`,
        onPressStart: () => this.startProductRowPress(p.id), onPressEnd: this.endProductRowPress,
        onRowClick: () => { if (this.state.productSelectionMode) this.toggleProductSelected(p.id); },
        onStartEditPrice: () => this.startEditPrice(p.id, p.preco), onEditPriceChange: this.onEditPriceChange, onSavePrice: () => this.savePrice(p.id),
        onDelete: () => this.askDeleteProduct(p.id, p.nome),
      };
    });

    const recipeIngredientRows = s.recipeForm ? s.recipeForm.ingredientes.map((row, idx) => ({
      idx, produtoId: row.produtoId, qtd: row.qtd,
      onProdutoSet: (v) => this.updateIngredientRow(idx, 'produtoId', v),
      onQtdChange: (e) => this.updateIngredientRow(idx, 'qtd', e.target.value),
      onRemove: () => this.removeIngredientRow(idx),
    })) : [];

    const favoritesCount = s.favoriteIds.length;
    // Display name comes exclusively from public.profiles.display_name now
    // (see auth.js fetchProfile) — the local device "profile" (idade,
    // gênero, cargo) no longer carries a name of its own, so there is only
    // ever one name shown anywhere in the app.
    const profileInitial = s.authDisplayName ? s.authDisplayName.trim()[0].toUpperCase() : '?';
    const userGreetingName = s.authDisplayName ? s.authDisplayName.split(' ')[0] : 'Chef';

    const weekBuckets = [];
    { const now = new Date(); for (let i = 7; i >= 0; i--) { const ws = this.weekStart(now); ws.setDate(ws.getDate() - i * 7); weekBuckets.push({ start: ws, total: 0 }); } }
    (s.vendas || []).forEach(v => {
      const key = this.weekStart(v.data).getTime();
      const bucket = weekBuckets.find(w => w.start.getTime() === key);
      if (bucket) bucket.total += v.valor;
    });
    const maxWeekTotal = Math.max(1, ...weekBuckets.map(w => w.total));
    const weeklyN = weekBuckets.length;
    const weeklyPoint = (i) => {
      const w = weekBuckets[i];
      const x = 4 + (i / (weeklyN - 1)) * 92;
      const ratio = w.total / maxWeekTotal;
      const y = 92 - ratio * 72;
      return { x, y };
    };
    const weeklySales = weekBuckets.map((w, i) => {
      const p = weeklyPoint(i);
      return {
        label: `${String(w.start.getDate()).padStart(2, '0')}/${String(w.start.getMonth() + 1).padStart(2, '0')}`,
        totalLabel: this.formatBRL(w.total),
        x: p.x, y: p.y,
        dotStyle: `position:absolute;left:${p.x}%;top:${p.y}%;transform:translate(-50%,-50%);width:9.5px;height:9.5px;border-radius:50%;background:var(--brand-700);border:2px solid var(--neutral-0);box-shadow:var(--shadow-sm);cursor:pointer`,
      };
    });
    const weeklyTrendPoints = weekBuckets.map((w, i) => { const p = weeklyPoint(i); return `${p.x},${p.y}`; }).join(' ');
    const weeklyAreaPoints = weeklyTrendPoints + ' 96,100 4,100';

    const weekdayOptions = [
      { value: '0', label: 'Domingo' }, { value: '1', label: 'Segunda-feira' }, { value: '2', label: 'Terça-feira' },
      { value: '3', label: 'Quarta-feira' }, { value: '4', label: 'Quinta-feira' }, { value: '5', label: 'Sexta-feira' }, { value: '6', label: 'Sábado' },
    ];
    const weekStartDayValue = String(s.weekStartDay ?? 1);

    const todayStr = new Date().toDateString();
    const todayVendas = (s.vendas || []).filter(v => new Date(v.data).toDateString() === todayStr);
    const qtdVendasDia = todayVendas.length;
    const valorTotalDia = todayVendas.reduce((a, v) => a + v.valor, 0);
    const ipcSomaDia = todayVendas.reduce((a, v) => a + (v.ipc || 0), 0);
    const dailyStats = {
      ipcMedioLabel: qtdVendasDia ? (ipcSomaDia / qtdVendasDia).toFixed(1).replace('.', ',') : '–',
      tmLabel: qtdVendasDia ? this.formatBRL(valorTotalDia / qtdVendasDia) : '–',
      valorTotalLabel: this.formatBRL(valorTotalDia),
      qtdVendasLabel: String(qtdVendasDia),
    };

    const now2 = new Date();
    const monthVendas = (s.vendas || []).filter(v => { const d = new Date(v.data); return d.getMonth() === now2.getMonth() && d.getFullYear() === now2.getFullYear(); });
    const qtdVendasMes = monthVendas.length;
    const valorTotalMes = monthVendas.reduce((a, v) => a + v.valor, 0);
    const ipcSomaMes = monthVendas.reduce((a, v) => a + (v.ipc || 0), 0);
    const monthlyStats = {
      ipcMedioLabel: qtdVendasMes ? (ipcSomaMes / qtdVendasMes).toFixed(1).replace('.', ',') : '–',
      tmLabel: qtdVendasMes ? this.formatBRL(valorTotalMes / qtdVendasMes) : '–',
      valorTotalLabel: this.formatBRL(valorTotalMes),
      qtdVendasLabel: String(qtdVendasMes),
    };

    const wn = s.weatherNow || {};
    const weekdayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const nowDate = new Date();
    const dayLabel = weekdayNames[nowDate.getDay()] + ', ' + nowDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const weatherNow = { ...wn, dayLabel, isSun: wn.cond === 'sun', isCloud: wn.cond === 'cloud', isRain: wn.cond === 'rain' };
    const weatherTabs = ['temperatura', 'chuva', 'vento'].map(k => {
      const active = (s.weatherTab || 'temperatura') === k;
      return {
        key: k, label: k === 'temperatura' ? 'Temperatura' : (k === 'chuva' ? 'Chuva' : 'Vento'),
        onClick: () => this.setState({ weatherTab: k }),
        style: `padding-bottom:10px;cursor:pointer;font-size:13px;font-weight:700;color:${active ? 'var(--brand-700)' : 'var(--neutral-600)'};border-bottom:2px solid ${active ? 'var(--brand-700)' : 'transparent'};transition:color 0.15s ease`,
      };
    });
    const hourlyRaw = s.hourly || [];
    const tabField = s.weatherTab === 'chuva' ? 'chuva' : (s.weatherTab === 'vento' ? 'vento' : 'temp');
    const tabUnit = s.weatherTab === 'chuva' ? '%' : (s.weatherTab === 'vento' ? ' km/h' : '°');
    const hVals = hourlyRaw.map(h => h[tabField]);
    const minV = Math.min(...hVals), maxV = Math.max(...hVals);
    const span = Math.max(1, maxV - minV);
    const nSeg = Math.max(1, hourlyRaw.length - 1);
    const hPoint = (i) => {
      const x = 4 + (i / nSeg) * 92;
      const y = 88 - ((hourlyRaw[i][tabField] - minV) / span) * 63;
      return { x, y };
    };
    const hourlyLinePoints = hourlyRaw.map((h, i) => { const p = hPoint(i); return `${p.x},${p.y}`; }).join(' ');
    const hourlyAreaPoints = hourlyLinePoints + ' 96,100 4,100';
    const hourly = hourlyRaw.map((h, i) => {
      const p = hPoint(i);
      return { hora: h.hora, valueLabel: h[tabField] + tabUnit, cx: p.x, cy: p.y, dotStyle: `position:absolute;left:${p.x}%;top:${p.y}%;transform:translate(-50%,-50%);width:9.5px;height:9.5px;border-radius:50%;background:var(--brand-700);border:2px solid var(--neutral-0);box-shadow:var(--shadow-sm)`, valueLabelStyle: `position:absolute;left:${p.x}%;top:${p.y}%;transform:translate(-50%, calc(-100% - 6px));font-size:11px;font-weight:700;color:var(--neutral-800);white-space:nowrap` };
    });

    const weatherForecast = (s.weatherForecast || []).map(d => ({
      dia: d.dia, tempMax: d.tempMax, tempMin: d.tempMin, precip: d.precip,
      isSun: d.cond === 'sun', isCloud: d.cond === 'cloud', isRain: d.cond === 'rain',
    }));

    const trendColor = (t) => t === 'up' ? 'var(--red-600)' : 'var(--green-600)';
    const fmtVal = (e) => e.unit === '%' ? e.value.toFixed(2).replace('.', ',') + '%' : e.unit + ' ' + e.value.toFixed(2).replace('.', ',');
    const mkEco = (e) => ({ valor: fmtVal(e), variacao: e.variacao, trendColor: trendColor(e.trend), isUp: e.trend === 'up', isDown: e.trend !== 'up' });
    const economicData = {
      ipca: mkEco(s.economicData.ipca),
      dolar: mkEco(s.economicData.dolar),
      euro: mkEco(s.economicData.euro),
      selic: mkEco(s.economicData.selic || { value: 0, variacao: '', trend: 'up' }),
    };
    const updatedAtLabel = new Date(s.indicatorsUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // ---- Modo de Criação: "Minhas Receitas / Meus Produtos / Minhas Categorias" ----
    // Badge/label helper shared by every recipe-row source below (personal,
    // shared, admin/site) so a user can tell at a glance which of the four
    // genuinely-separate data sources (myRecipes/sharedLibrary/public
    // catalog/admin site catalog — never merged into one array anywhere in
    // state or here) a given row came from, on top of its own status.
    const statusBadge = (label, color) => `font-size:10px;font-weight:700;padding:2px 8px;border-radius:var(--radius-full);background:${color}22;color:${color}`;
    const SOURCE_BADGE_COLORS = { personal: '#8A5CF6', shared: '#2E90D6', public: '#34B23E', draft: '#CFB017', archived: '#8A8580' };
    // recipes.recipes_personal_requires_private_ck (supabase/004_catalog_schema.sql)
    // guarantees every scope='personal' recipe is always status='private' —
    // verified against the live schema (see supabase/STAGING.md), so "Privada"
    // is always correct here, never derived from a guess.
    const myRecipeRows = s.myRecipes.map(r => ({
      id: r.id, name: r.name, code: r.recipe_code, categoryName: (r.category && r.category.name) || '',
      source: 'personal', sourceLabel: 'Privada', sourceBadgeStyle: statusBadge('Privada', SOURCE_BADGE_COLORS.personal),
      onOpen: () => this.onOpenMyRecipeDetail(r.id), onEdit: () => this.onEditMyRecipe(r), onDelete: () => this.askDeleteMyRecipe(r.id, r.name),
    }));
    const myProductRows = s.myProducts.map(p => ({
      id: p.id, name: p.name, code: p.product_code, categoryName: (p.category && p.category.name) || '', unit: p.unit, priceLabel: this.formatBRL(p.price),
      onEdit: () => this.onEditMyProduct(p), onDelete: () => this.askDeleteMyProduct(p.id, p.name),
      onRequestPublish: () => this.onOpenPublishRequest('product', p.id, p.name),
    }));
    const myCategoryTypeLabel = (t) => t === 'receita' ? 'Receita' : t === 'secao' ? 'Seção' : 'Proteína/Produto';
    const myCategoryRows = s.myCategories.map(c => ({
      id: c.id, name: c.name, code: c.category_code, typeLabel: myCategoryTypeLabel(c.type),
      onEdit: () => this.onEditMyCategory(c), onDelete: () => this.askDeleteMyCategory(c.id, c.name),
      onRequestPublish: () => this.onOpenPublishRequest('category', c.id, c.name),
    }));
    const sharedLibraryRows = s.sharedLibrary.map(r => ({
      id: r.id, name: r.name, code: r.recipe_code, categoryName: (r.category && r.category.name) || '',
      source: 'shared', sourceLabel: 'Compartilhada', sourceBadgeStyle: statusBadge('Compartilhada', SOURCE_BADGE_COLORS.shared),
      authorName: (s.sharedLibraryAuthorNames && s.sharedLibraryAuthorNames[r.id]) || '',
      onOpen: () => this.onOpenMyRecipeDetail(r.id),
    }));

    const myRecipeCategoryOptions = this.myRecipeCategories().map(c => ({ value: c.id, label: c.name }));
    const myProteinCategoryOptions = this.myProteinCategories().map(c => ({ value: c.id, label: c.name }));
    const myRecipeSectionRows = this.mySectionCategories().map(c => ({
      key: c.id, label: c.name,
      checked: !!(s.myRecipeForm && s.myRecipeForm.sectionCategoryIds.includes(c.id)),
      onToggle: () => this.toggleMyRecipeSection(c.id),
    }));
    const myProductOptionsForIngredients = this.pickerProducts().map(p => ({ value: p.id, label: `${p.name} (${this.formatBRL(p.price)}/${p.unit})` }));
    const myRecipeIngredientRows = s.myRecipeForm ? s.myRecipeForm.ingredients.map((row, idx) => ({
      idx, productId: row.productId, quantity: row.quantity,
      onProductSet: (v) => this.onMyRecipeIngredientChange(idx, 'productId', v),
      onQuantityChange: (e) => this.onMyRecipeIngredientChange(idx, 'quantity', e.target.value),
      onRemove: () => this.removeMyRecipeIngredient(idx),
    })) : [];

    let myRecipeDetailView = null;
    if (s.selectedMyRecipe) {
      const d = s.selectedMyRecipe;
      const ingredientRows2 = d.ingredients.map(i => ({
        id: i.id, name: i.product.name, quantity: this.formatQtd(i.quantity), unit: i.product.unit,
        priceLabel: this.formatBRL(i.product.price), subtotalLabel: this.formatBRL(i.product.price * i.quantity),
      }));
      const totalCost = d.ingredients.reduce((sum, i) => sum + (i.product.price * i.quantity), 0);
      myRecipeDetailView = {
        id: d.id, name: d.recipe.name, code: d.recipe.recipe_code, categoryName: d.recipe.category ? d.recipe.category.name : '',
        prepTimeLabel: d.recipe.prep_time + ' min', servingsLabel: d.recipe.servings + ' porções', difficulty: d.recipe.difficulty,
        imageUrl: d.recipe.image_url || FALLBACK_IMG,
        ingredientRows: ingredientRows2, totalCostLabel: this.formatBRL(totalCost),
        sectionNames: d.sections.map(sc => sc.category && sc.category.name).filter(Boolean).join(', '),
        instructions: d.recipe.instructions || [], tips: d.recipe.tips || [], extras: d.recipe.extras || [],
        isOwner: d.isOwner,
        onOpenPublishRequest: () => this.onOpenPublishRequest('recipe', d.id, d.recipe.name),
      };
    }
    const shareActive = !!(s.shareStatus && s.shareStatus.active);
    const shareCode = s.shareStatus ? s.shareStatus.share_code : '';
    const shareStatusLabel = !s.shareStatus
      ? 'Compartilhamento inativo.'
      : (shareActive ? 'Compartilhamento ativo — qualquer pessoa com o ID pode adicionar esta receita à biblioteca dela, em modo somente leitura.' : 'Novos compartilhamentos desativados. Acessos já concedidos continuam ativos.');

    const copyPurposeLabel = (p) => p === 'primary' ? 'Categoria da receita' : p === 'section' ? 'Seção' : 'Ingrediente';
    const copyRefRows = s.copyRefs.map(r => {
      const key = r.refType + ':' + r.refId;
      const d = s.copyDecisions[key] || { action: 'add', targetId: '' };
      const candidates = r.refType === 'category'
        ? s.copyCandidateCategories.filter(c => (r.purpose === 'primary' ? c.type === 'receita' : r.purpose === 'section' ? c.type === 'secao' : true))
        : s.copyCandidateProducts;
      return {
        key, label: r.label, purposeLabel: copyPurposeLabel(r.purpose),
        action: d.action, targetId: d.targetId, canRemove: r.purpose !== 'primary',
        candidateOptions: candidates.map(c => ({ value: c.id, label: c.name })),
        onSetAction: this.onSetCopyDecisionAction(r.refType, r.refId), onSetTarget: this.onSetCopyDecisionTarget(r.refType, r.refId),
      };
    });

    // ---- Catálogo Público (admin) ---- (statusBadge/SOURCE_BADGE_COLORS
    // defined above, shared with myRecipeRows/sharedLibraryRows so every
    // recipe-row source uses the exact same badge look)
    const siteRecipeRows = s.siteRecipes.map(r => {
      const isPublished = r.status === 'published';
      const statusLabel = isPublished ? 'Publicada' : r.status === 'draft' ? 'Rascunho' : 'Arquivada';
      return {
        id: r.id, name: r.name, code: r.recipe_code, categoryName: (r.category && r.category.name) || '', featured: !!r.featured,
        source: 'admin_site', sourceLabel: 'Pública', sourceBadgeStyle: statusBadge('Pública', SOURCE_BADGE_COLORS.public),
        statusLabel,
        statusBadgeStyle: statusBadge(statusLabel, isPublished ? SOURCE_BADGE_COLORS.public : r.status === 'draft' ? SOURCE_BADGE_COLORS.draft : SOURCE_BADGE_COLORS.archived),
        toggleStatusLabel: isPublished ? 'Despublicar' : 'Publicar',
        onToggleStatus: () => this.onToggleSiteRecipeStatus(r), onEdit: () => this.onEditSiteRecipe(r),
      };
    });
    const siteProductRows = s.siteProducts.map(p => ({
      id: p.id, name: p.name, code: p.product_code, categoryName: (p.category && p.category.name) || '', unit: p.unit, priceLabel: this.formatBRL(p.price),
      source: 'admin_site', sourceLabel: 'Pública', sourceBadgeStyle: statusBadge('Pública', SOURCE_BADGE_COLORS.public),
      statusLabel: p.active ? 'Ativo' : 'Inativo', statusBadgeStyle: statusBadge('', p.active ? '#34B23E' : '#8A8580'),
      toggleActiveLabel: p.active ? 'Desativar' : 'Ativar',
      onToggleActive: () => this.onToggleSiteProductActive(p), onEdit: () => this.onEditSiteProduct(p),
    }));
    const siteCategoryRows = s.siteCategories.map(c => ({
      id: c.id, name: c.name, code: c.category_code, typeLabel: myCategoryTypeLabel(c.type),
      source: 'admin_site', sourceLabel: 'Pública', sourceBadgeStyle: statusBadge('Pública', SOURCE_BADGE_COLORS.public),
      statusLabel: c.active ? 'Ativa' : 'Inativa', statusBadgeStyle: statusBadge('', c.active ? '#34B23E' : '#8A8580'),
      toggleActiveLabel: c.active ? 'Desativar' : 'Ativar',
      onToggleActive: () => this.onToggleSiteCategoryActive(c), onEdit: () => this.onEditSiteCategory(c),
    }));
    const siteRecipeCategoryOptions = this.siteRecipeCategories().map(c => ({ value: c.id, label: c.name }));
    const siteProteinCategoryOptions = this.siteProteinCategories().map(c => ({ value: c.id, label: c.name }));
    const siteRecipeSectionRows = this.siteSectionCategories().map(c => ({
      key: c.id, label: c.name,
      checked: !!(s.siteRecipeForm && s.siteRecipeForm.sectionCategoryIds.includes(c.id)),
      onToggle: () => this.toggleSiteRecipeSection(c.id),
    }));
    const siteProductOptionsForIngredients = s.siteProducts.map(p => ({ value: p.id, label: `${p.name} (${this.formatBRL(p.price)}/${p.unit})` }));
    const siteRecipeIngredientRows = s.siteRecipeForm ? s.siteRecipeForm.ingredients.map((row, idx) => ({
      idx, productId: row.productId, quantity: row.quantity,
      onProductSet: (val) => this.onSiteRecipeIngredientChange(idx, 'productId', val),
      onQuantityChange: (e) => this.onSiteRecipeIngredientChange(idx, 'quantity', e.target.value),
      onRemove: () => this.removeSiteRecipeIngredient(idx),
    })) : [];

    // ---- Solicitações (change_requests) ----
    const requestStatusLabel = (st) => ({
      submitted: 'Enviado', changes_requested: 'Devolvido', resubmitted: 'Reenviado',
      approved: 'Aprovado', rejected: 'Rejeitado', cancelled: 'Cancelado',
    }[st] || st);
    const requestStatusColor = (st) => ({
      submitted: '#CFB017', changes_requested: '#C33D22', resubmitted: '#CFB017',
      approved: '#34B23E', rejected: '#C33D22', cancelled: '#8A8580',
    }[st] || '#8A8580');
    const requestEntityLabel = (t) => ({ recipe: 'Receita', product: 'Produto', category: 'Categoria' }[t] || t);
    const requestActionLabel = (t) => ({ publish: 'Publicação', create: 'Criação', update: 'Alteração', deactivate: 'Desativação' }[t] || t);
    const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

    const requestFilterOptions = [
      { value: 'all', label: 'Todos' }, { value: 'submitted', label: 'Enviados' },
      { value: 'changes_requested', label: 'Devolvidos' }, { value: 'resubmitted', label: 'Reenviados' },
      { value: 'approved', label: 'Aprovados' }, { value: 'rejected', label: 'Rejeitados' }, { value: 'cancelled', label: 'Cancelados' },
    ];
    const filterRequests = (list) => s.requestFilterStatus === 'all' ? list : list.filter(r => r.status === s.requestFilterStatus);

    const myRequestRows = filterRequests(s.myRequests).map(r => ({
      id: r.id, code: r.request_code, entityLabel: requestEntityLabel(r.entity_type), actionLabel: requestActionLabel(r.action_type),
      itemCode: r.source_code || r.target_code || '', dateLabel: fmtDate(r.created_at),
      statusLabel: requestStatusLabel(r.status), statusBadgeStyle: statusBadge('', requestStatusColor(r.status)),
      revision: r.current_revision, hasAdminNote: !!r.admin_note, adminNote: r.admin_note || '',
      canCancel: ['submitted', 'resubmitted', 'changes_requested'].includes(r.status),
      canEdit: r.status === 'changes_requested', canResubmit: r.status === 'changes_requested',
      isResubmitBusy: s.resubmitBusyRequestId === r.id,
      onOpenDetail: () => this.onOpenRequestDetail(r.id), onCancel: () => this.onCancelMyRequest(r.id),
      onEditItem: () => this.onEditRequestedItem(r), onResubmit: () => this.onResubmitMyRequest(r),
    }));

    const allRequestRows = filterRequests(s.allRequests).map(r => ({
      id: r.id, code: r.request_code, requesterName: r.requester_display_name_snapshot,
      entityLabel: requestEntityLabel(r.entity_type), actionLabel: requestActionLabel(r.action_type),
      itemCode: r.source_code || r.target_code || '', dateLabel: fmtDate(r.created_at),
      statusLabel: requestStatusLabel(r.status), statusBadgeStyle: statusBadge('', requestStatusColor(r.status)),
      revision: r.current_revision, canReview: ['submitted', 'resubmitted'].includes(r.status),
      onOpenDetail: () => this.onOpenRequestDetail(r.id),
    }));
    const pendingRequestsCount = s.allRequests.filter(r => r.status === 'submitted' || r.status === 'resubmitted').length;

    let requestDetail = null;
    const selectedRequestRow = s.selectedRequestId
      ? (s.allRequests.find(r => r.id === s.selectedRequestId) || s.myRequests.find(r => r.id === s.selectedRequestId))
      : null;
    if (selectedRequestRow) {
      const latestRevision = s.selectedRequestRevisions[s.selectedRequestRevisions.length - 1];
      requestDetail = {
        code: selectedRequestRow.request_code, entityLabel: requestEntityLabel(selectedRequestRow.entity_type),
        actionLabel: requestActionLabel(selectedRequestRow.action_type), statusLabel: requestStatusLabel(selectedRequestRow.status),
        requesterName: selectedRequestRow.requester_display_name_snapshot, reason: selectedRequestRow.reason || '',
        hasReason: !!selectedRequestRow.reason, adminNote: selectedRequestRow.admin_note || '', hasAdminNote: !!selectedRequestRow.admin_note,
        sourceCode: selectedRequestRow.source_code || '', targetCode: selectedRequestRow.target_code || '', hasTargetCode: !!selectedRequestRow.target_code,
        canReview: this.state.authRole === 'admin' && ['submitted', 'resubmitted'].includes(selectedRequestRow.status),
        payloadPretty: latestRevision ? JSON.stringify(latestRevision.payload, null, 2) : '',
        revisionRows: s.selectedRequestRevisions.map(rv => ({
          key: rv.id, number: rv.revision_number, dateLabel: fmtDate(rv.created_at), message: rv.message || '',
          namePreview: rv.payload && rv.payload.name,
        })),
      };
    }

    return {
      weeklySales, weeklyTrendPoints, weeklyAreaPoints, weekdayOptions, weekStartDayValue, onWeekStartDaySet: this.onSetWeekStartDay, dailyStats, monthlyStats, weatherNow, weatherTabs, hourly, hourlyLinePoints, hourlyAreaPoints, weatherForecast, economicData, updatedAtLabel,
      salesModalOpen: s.salesModalOpen, saleForm: s.saleForm,
      saleModalTitle: s.editingSaleId ? 'Editar Venda' : 'Registrar Venda', saleModalSaveLabel: s.editingSaleId ? 'Salvar Alterações' : 'Salvar',
      onOpenSalesModal: this.onOpenSalesModal, onCloseSalesModal: this.onCloseSalesModal,
      onSaleValorChange: this.onSaleValorChange, onSaleIpcChange: this.onSaleIpcChange,
      onSaveSale: this.onSaveSale, onRefreshIndicators: this.onRefreshIndicators,
      onSaleDataChange: this.onSaleDataChange,
      saleSelectionMode: s.saleSelectionMode, selectedSaleCountLabel: `${s.selectedSaleIds.length} selecionada(s)`, onBulkDeleteSalesAsk: this.askBulkDeleteSales, onCancelSaleSelection: this.onCancelSaleSelection,
      goSalesHistory: this.goSalesHistory, onBackFromSalesHistory: this.onBackFromSalesHistory,
      salesHistoryEmpty: !(s.vendas || []).length,
      salesHistoryCountLabel: `${(s.vendas || []).length} venda(s) registrada(s)`,
      salesHistoryRows: [...(s.vendas || [])].sort((a, b) => new Date(b.data) - new Date(a.data)).map(v => {
        const selected = s.selectedSaleIds.includes(v.id);
        return {
          id: v.id,
          valorLabel: this.formatBRL(v.valor),
          ipc: v.ipc || 0,
          dateLabel: new Date(v.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }),
          showCheckbox: s.saleSelectionMode, showActions: !s.saleSelectionMode,
          checkboxStyle: `width:24px;height:24px;border-radius:8px;border:2px solid var(--brand-700);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${selected ? 'var(--brand-700)' : 'transparent'};color:#F4F2F1;font-size:13px;font-weight:700`,
          checkMark: selected ? '✓' : '',
          rowStyle: `display:flex;align-items:center;justify-content:space-between;gap:16px;background:${selected ? 'rgba(178,64,25,0.08)' : 'var(--neutral-0)'};border:1px solid ${selected ? 'var(--brand-500)' : 'var(--neutral-100)'};border-radius:var(--radius-lg);padding:18px 20px;margin-bottom:10px;box-shadow:var(--shadow-sm);cursor:${s.saleSelectionMode ? 'pointer' : 'default'};user-select:none;transition:background 0.15s ease,border-color 0.15s ease`,
          onPressStart: () => this.startSaleRowPress(v.id), onPressEnd: this.endSaleRowPress,
          onRowClick: () => { if (this.state.saleSelectionMode) this.toggleSaleSelected(v.id); },
          onEdit: () => this.onEditSale(v.id),
          onDelete: () => this.askDeleteSale(v.id),
        };
      }),
      screen, dataLoaded: s.dataLoaded, notLoaded: !s.dataLoaded,
      // Public catalog (Home/Search source) load state — see loadPublicCatalog.
      // 'loading' never renders as an error; 'demo-fallback' is the only
      // state with a visible banner+retry, since it means the real
      // Supabase fetch failed and DEFAULT_PRODUCTS/DEFAULT_RECIPES are
      // standing in instead of the live catalog.
      publicCatalogLoading: s.publicCatalogSource === 'loading',
      hasPublicCatalogFallback: s.publicCatalogSource === 'demo-fallback', publicCatalogError: s.publicCatalogError,
      onRetryPublicCatalog: () => this.loadPublicCatalog(),
      isHome: s.dataLoaded && screen === 'home', isSearch: s.dataLoaded && screen === 'search', isFavorites: s.dataLoaded && screen === 'favorites', isDados: s.dataLoaded && screen === 'dados', isProfile: s.dataLoaded && screen === 'profile', isDetail: s.dataLoaded && screen === 'detail', isAdmin: s.dataLoaded && screen === 'admin', isSalesHistory: s.dataLoaded && screen === 'salesHistory',
      hasSelectedRecipe: !!selectedRecipe,
      deviceMode, isCompact, isWide, navRailWidth, frameMaxWidth, frameMaxHeight, stagePadLeft, stagePadRight, scrollBottomPad, navRailSideStyle, navRailBorderStyle,
      detailPadX: isWide ? 92 : 40, detailTitleInset: isWide ? 92 : 32,
      showBottomTabBar: (screen === 'home' || screen === 'search' || screen === 'favorites' || screen === 'dados' || screen === 'profile') && isCompact,
      showSideNavRail: (screen === 'home' || screen === 'search' || screen === 'favorites' || screen === 'dados' || screen === 'profile') && isWide,
      goHome: this.goHome, goSearch: this.goSearch, goFavorites: this.goFavorites, goDados: this.goDados, goProfile: this.goProfile,
      navHomeColor: screen === 'home' ? 'var(--brand-700)' : 'var(--neutral-400)',
      navSearchColor: screen === 'search' ? 'var(--brand-700)' : 'var(--neutral-400)',
      navFavColor: screen === 'favorites' ? 'var(--brand-700)' : 'var(--neutral-400)',
      navDadosColor: screen === 'dados' ? 'var(--brand-700)' : 'var(--neutral-400)',
      navProfileColor: screen === 'profile' ? 'var(--brand-700)' : 'var(--neutral-400)',
      showSplash: s.showSplash, onSplashContinue: this.onSplashContinue, splashButtonLabel: s.profile ? 'Bem-vindo de volta' : 'Criar meu perfil',
      userGreetingName, profileInitial,
      heroRecipes, heroDots, heroHasMultiple, onHeroPrev, onHeroNext, onHeroScroll: this.onHeroScroll,
      recommendedList, practicalList, occasionList, quickList, churrascoList, snackList, homeCategoryChips, customHomeSectionBlocks,
      searchQuery: s.searchQuery, onSearchChange: this.onSearchChange, categoryChips, filteredSearchResults, searchResultsEmpty: filteredSearchResults.length === 0,
      favoritesList, favoritesEmpty: favoritesList.length === 0,
      hasProfile: !!s.profile, profile: s.profile || {}, favoritesCount,
      adminStatusLabel: !s.session ? 'Toque para fazer login' : 'Toque para abrir o painel',
      hasSession: !!s.session, onLogout: this.onLogout,
      authDisplayName: s.authDisplayName,
      connectedCredentialLabel: (s.session && s.session.user && s.session.user.user_metadata && s.session.user.user_metadata.credential) || 'Sessão ativa',
      onOpenAdminAttempt: this.onOpenAdminAttempt, onEditProfile: this.onEditProfile,
      onOpenChangeNameModal: this.onOpenChangeNameModal,
      showChangeNameModal: s.showChangeNameModal, changeNameValue: s.changeNameValue,
      hasChangeNameError: !!s.changeNameError, changeNameError: s.changeNameError, changeNameSubmitting: s.changeNameSubmitting,
      canSubmitChangeName: !!(normalizeDisplayName(s.changeNameValue) && !s.changeNameSubmitting),
      onChangeNameValueChange: this.onChangeNameValueChange, onChangeNameSubmit: this.onChangeNameSubmit, onCloseChangeNameModal: this.onCloseChangeNameModal,
      showCompleteProfileModal: s.showCompleteProfileModal, completeProfileName: s.completeProfileName,
      hasCompleteProfileError: !!s.completeProfileError, completeProfileError: s.completeProfileError, completeProfileSubmitting: s.completeProfileSubmitting,
      canSubmitCompleteProfile: !!(normalizeDisplayName(s.completeProfileName) && !s.completeProfileSubmitting),
      onCompleteProfileNameChange: this.onCompleteProfileNameChange, onCompleteProfileSubmit: this.onCompleteProfileSubmit,
      showLoginModal: s.showLoginModal, loginCredential: s.loginCredential, loginPassword: s.loginPassword,
      hasLoginError: !!s.loginError, loginError: s.loginError, loginSubmitting: s.loginSubmitting,
      canSubmitLogin: !!(s.loginTurnstileToken && s.loginCredential.trim() && s.loginPassword && !s.loginSubmitting),
      loginTurnstileReady: s.loginTurnstileReady, showLoginTurnstileLoading: !s.loginTurnstileReady && !s.loginError,
      turnstileLoginRef: this.turnstileLoginRef,
      onLoginCredentialChange: this.onLoginCredentialChange, onLoginPasswordChange: this.onLoginPasswordChange,
      onLoginSubmit: this.onLoginSubmit, onCloseLoginModal: this.closeLoginModal, onGoSignupFromLogin: this.openSignupModal,
      showSignupModal: s.showSignupModal, signupDisplayName: s.signupDisplayName, signupPassword: s.signupPassword, signupConfirmPassword: s.signupConfirmPassword,
      hasSignupError: !!s.signupError, signupError: s.signupError, signupSubmitting: s.signupSubmitting,
      canSubmitSignup: !!(normalizeDisplayName(s.signupDisplayName) && s.signupTurnstileToken && s.signupPassword && s.signupConfirmPassword && !s.signupSubmitting),
      signupTurnstileReady: s.signupTurnstileReady, showSignupTurnstileLoading: !s.signupTurnstileReady && !s.signupError,
      turnstileSignupRef: this.turnstileSignupRef,
      onSignupDisplayNameChange: this.onSignupDisplayNameChange,
      onSignupPasswordChange: this.onSignupPasswordChange, onSignupConfirmChange: this.onSignupConfirmChange,
      onSignupSubmit: this.onSignupSubmit, onCloseSignupModal: this.closeSignupModal, onBackToLoginFromSignup: this.backToLoginFromSignup,
      signupResult: s.signupResult, credentialCopied: s.credentialCopied, onCopyCredential: this.onCopyCredential, onFinishSignup: this.onFinishSignup,
      showProfileSetup: s.showProfileSetup, profileForm: s.profileForm,
      onProfileIdadeChange: this.onProfileIdadeChange, onProfileCargoChange: this.onProfileCargoChange,
      onSaveProfile: this.onSaveProfile, generoOptions: ['Feminino', 'Masculino', 'Outro', 'Prefiro não informar'], onProfileGeneroSet: this.setFormField('profileForm', 'genero'),
      selectedRecipe: selectedRecipe || { imagem: FALLBACK_IMG, nome: '', tempoLabel: '', porcoesLabel: '', dificuldade: '', heartFill: 'none', onToggleFavorite: () => {}, onBack: this.backFromDetail, canEdit: false, onEdit: () => {} },
      ingredientRows, extrasList, hasExtras, modoPreparoList, dicasList, totalABuyLabel, totalAllLabel,
      altModalOpen, altModalIngredientNome, altOptions, altOptionsEmpty, onCloseAltModal: this.closeAltModal,
      onBackFromAdmin: this.onBackFromAdmin, adminTab: s.adminTab, isAdminRecipesTab: s.adminTab === 'recipes', isAdminProductsTab: s.adminTab === 'products', isAdminCategoriesTab: s.adminTab === 'categories',
      isAdminRole: s.authRole === 'admin',
      isAdminMyRecipesTab: s.adminTab === 'myRecipes', isAdminMyProductsTab: s.adminTab === 'myProducts', isAdminMyCategoriesTab: s.adminTab === 'myCategories',
      onSetAdminTabMyRecipes: this.setAdminTabMyRecipes, onSetAdminTabMyProducts: this.setAdminTabMyProducts, onSetAdminTabMyCategories: this.setAdminTabMyCategories,
      adminTabMyRecipesStyle: `padding:10px 20px;border-radius:var(--radius-full);font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s ease,transform 0.15s ease;background:${s.adminTab === 'myRecipes' ? 'var(--brand-700)' : 'var(--neutral-50)'};color:${s.adminTab === 'myRecipes' ? '#F4F2F1' : 'var(--neutral-800)'}`,
      adminTabMyProductsStyle: `padding:10px 20px;border-radius:var(--radius-full);font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s ease,transform 0.15s ease;background:${s.adminTab === 'myProducts' ? 'var(--brand-700)' : 'var(--neutral-50)'};color:${s.adminTab === 'myProducts' ? '#F4F2F1' : 'var(--neutral-800)'}`,
      adminTabMyCategoriesStyle: `padding:10px 20px;border-radius:var(--radius-full);font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s ease,transform 0.15s ease;background:${s.adminTab === 'myCategories' ? 'var(--brand-700)' : 'var(--neutral-50)'};color:${s.adminTab === 'myCategories' ? '#F4F2F1' : 'var(--neutral-800)'}`,
      isAdminSharedRecipesTab: s.adminTab === 'sharedRecipes', isAdminMyRequestsTab: s.adminTab === 'myRequests', isAdminRequestsInboxTab: s.adminTab === 'requestsInbox',
      onSetAdminTabSharedRecipes: () => this.setState({ adminTab: 'sharedRecipes' }), onSetAdminTabMyRequests: this.setAdminTabMyRequests, onSetAdminTabRequestsInbox: this.setAdminTabRequestsInbox,
      adminTabSharedRecipesStyle: `padding:10px 20px;border-radius:var(--radius-full);font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s ease,transform 0.15s ease;background:${s.adminTab === 'sharedRecipes' ? 'var(--brand-700)' : 'var(--neutral-50)'};color:${s.adminTab === 'sharedRecipes' ? '#F4F2F1' : 'var(--neutral-800)'}`,
      adminTabMyRequestsStyle: `padding:10px 20px;border-radius:var(--radius-full);font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s ease,transform 0.15s ease;background:${s.adminTab === 'myRequests' ? 'var(--brand-700)' : 'var(--neutral-50)'};color:${s.adminTab === 'myRequests' ? '#F4F2F1' : 'var(--neutral-800)'}`,
      adminTabRequestsInboxStyle: `padding:10px 20px;border-radius:var(--radius-full);font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s ease,transform 0.15s ease;background:${s.adminTab === 'requestsInbox' ? 'var(--brand-700)' : 'var(--neutral-50)'};color:${s.adminTab === 'requestsInbox' ? '#F4F2F1' : 'var(--neutral-800)'}`,
      hasPendingRequestsBadge: pendingRequestsCount > 0, pendingRequestsCount,
      myCreationLoading: s.myCreationLoading, hasMyCreationError: !!s.myCreationError, myCreationError: s.myCreationError,
      onRetryMyCreationData: () => { if (s.session) this.loadMyCreationData(s.session.user.id); },
      // Catálogo Público (admin)
      siteCatalogLoading: s.siteCatalogLoading, hasSiteCatalogErrorBanner: !!s.siteCatalogError, siteCatalogError: s.siteCatalogError,
      onRetrySiteCatalogData: () => this.loadSiteCatalogData(),
      siteRecipeRows, siteProductRows, siteCategoryRows,
      hasSiteRecipeRows: siteRecipeRows.length > 0, hasSiteProductRows: siteProductRows.length > 0, hasSiteCategoryRows: siteCategoryRows.length > 0,
      hasSiteCategoryError: !!s.siteFormError && s.adminTab === 'categories', siteCategoryError: s.siteFormError,
      onNewSiteRecipe: this.onNewSiteRecipe, onNewSiteProduct: this.onNewSiteProduct, onNewSiteCategory: this.onNewSiteCategory,
      showSiteRecipeForm: s.showSiteRecipeForm, siteRecipeFormTitle: s.siteRecipeFormMode === 'new' ? 'Nova Receita do Catálogo' : 'Editar Receita do Catálogo', siteRecipeForm: s.siteRecipeForm || {},
      hasSiteFormError: !!s.siteFormError, siteFormError: s.siteFormError,
      siteRecipeFormOnName: this.siteRecipeFormField('name'), siteRecipeFormOnCategorySet: this.setFormField('siteRecipeForm', 'categoryId'),
      siteRecipeFormOnDifficultySet: this.setFormField('siteRecipeForm', 'difficulty'), siteRecipeFormOnPrepTime: this.siteRecipeFormField('prepTime'),
      siteRecipeFormOnServings: this.siteRecipeFormField('servings'), siteRecipeFormOnImageUrl: this.siteRecipeFormField('imageUrl'),
      siteRecipeFormOnExtras: this.siteRecipeFormField('extrasText'), siteRecipeFormOnInstructions: this.siteRecipeFormField('instructionsText'), siteRecipeFormOnTips: this.siteRecipeFormField('tipsText'),
      siteRecipeFormOnFeatured: this.toggleSiteRecipeFormFeatured, siteRecipeFormOnStatusSet: this.setFormField('siteRecipeForm', 'status'),
      siteRecipeStatusOptions: [{ value: 'draft', label: 'Rascunho' }, { value: 'published', label: 'Publicada' }],
      siteRecipeCategoryOptions, siteRecipeSectionRows, siteRecipeIngredientRows, siteProductOptionsForIngredients,
      onAddSiteRecipeIngredient: this.addSiteRecipeIngredient, onCancelSiteRecipeForm: this.onCancelSiteRecipeForm, onSaveSiteRecipeForm: this.onSaveSiteRecipeForm,
      showSiteProductForm: s.showSiteProductForm, siteProductFormTitle: s.siteProductFormMode === 'new' ? 'Novo Produto do Catálogo' : 'Editar Produto do Catálogo', siteProductForm: s.siteProductForm || {},
      siteProductFormOnName: this.siteProductFormField('name'), siteProductFormOnCategorySet: this.setFormField('siteProductForm', 'categoryId'),
      siteProductFormOnUnitSet: this.setFormField('siteProductForm', 'unit'), siteProductFormOnPrice: this.siteProductFormField('price'), siteProductFormOnActive: this.toggleSiteProductFormActive,
      siteProteinCategoryOptions, unidadeOptionsSite: this.unidades,
      onCancelSiteProductForm: this.onCancelSiteProductForm, onSaveSiteProductForm: this.onSaveSiteProductForm,
      showSiteCategoryForm: s.showSiteCategoryForm, siteCategoryFormTitle: s.siteCategoryFormMode === 'new' ? 'Nova Categoria do Catálogo' : 'Editar Categoria do Catálogo', siteCategoryForm: s.siteCategoryForm || {},
      siteCategoryFormOnName: this.siteCategoryFormField('name'), siteCategoryFormOnTypeSet: this.setFormField('siteCategoryForm', 'type'), siteCategoryFormOnActive: this.toggleSiteCategoryFormActive,
      siteCategoryTypeOptions: [{ value: 'receita', label: 'Receita' }, { value: 'secao', label: 'Seção' }, { value: 'proteina', label: 'Proteína/Produto' }],
      onCancelSiteCategoryForm: this.onCancelSiteCategoryForm, onSaveSiteCategoryForm: this.onSaveSiteCategoryForm,
      // "Solicitar publicação"
      publishRequestOpen: !!s.publishRequest, publishRequest: s.publishRequest || {}, publishRequestBusy: s.publishRequestBusy,
      hasPublishRequestError: !!s.publishRequestError, publishRequestError: s.publishRequestError,
      onClosePublishRequest: this.onClosePublishRequest, onPublishReasonChange: this.onPublishReasonChange, onConfirmPublishRequest: this.onConfirmPublishRequest,
      onOpenPublishRequestForBlocker: (refType, id, name) => this.onOpenPublishRequest(refType, id, name),
      // "Meus Pedidos"
      myRequestsLoading: s.myRequestsLoading, hasMyRequestsError: !!s.myRequestsError, myRequestsError: s.myRequestsError,
      onRetryMyRequests: () => { if (s.session) this.loadMyRequests(s.session.user.id); },
      myRequestRows, hasMyRequestRows: myRequestRows.length > 0,
      // "Solicitações Recebidas"
      allRequestsLoading: s.allRequestsLoading, hasAllRequestsError: !!s.allRequestsError, allRequestsError: s.allRequestsError,
      onRetryAllRequests: () => this.loadAllRequests(),
      allRequestRows, hasAllRequestRows: allRequestRows.length > 0,
      requestFilterOptions, requestFilterStatus: s.requestFilterStatus, onSetRequestFilterStatus: (v) => this.setRequestFilterStatus(v),
      // Request detail modal (shared)
      requestDetailOpen: !!s.selectedRequestId, requestDetailLoading: s.requestDetailLoading, hasRequestDetailError: !!s.requestDetailError, requestDetailError: s.requestDetailError,
      onRetryRequestDetail: this.onRetryRequestDetail,
      requestDetail, hasRequestDetail: !!requestDetail, onCloseRequestDetail: this.onCloseRequestDetail,
      requestActionBusy: s.requestActionBusy, hasRequestActionError: !!s.requestActionError, requestActionError: s.requestActionError,
      onOpenReturnRequestModal: this.onOpenReturnRequestModal, onOpenRejectRequestModal: this.onOpenRejectRequestModal,
      onApproveDraft: () => this.onApproveRequest('draft'), onApproveAndPublish: () => this.onApproveRequest('published'),
      showReturnRequestModal: s.showReturnRequestModal, returnNoteValue: s.returnNoteValue, onReturnNoteChange: this.onReturnNoteChange,
      onCloseReturnRequestModal: this.onCloseReturnRequestModal, onConfirmReturnRequest: this.onConfirmReturnRequest,
      showRejectRequestModal: s.showRejectRequestModal, rejectNoteValue: s.rejectNoteValue, onRejectNoteChange: this.onRejectNoteChange,
      onCloseRejectRequestModal: this.onCloseRejectRequestModal, onConfirmRejectRequest: this.onConfirmRejectRequest,
      myRecipeRows, myProductRows, myCategoryRows, sharedLibraryRows,
      hasMyRecipeRows: myRecipeRows.length > 0, hasMyProductRows: myProductRows.length > 0, hasMyCategoryRows: myCategoryRows.length > 0, hasSharedLibraryRows: sharedLibraryRows.length > 0,
      onNewMyRecipe: this.onNewMyRecipe, onNewMyProduct: this.onNewMyProduct, onNewMyCategory: this.onNewMyCategory,
      // Minha receita: form modal
      showMyRecipeForm: s.showMyRecipeForm, myRecipeFormTitle: s.myRecipeFormMode === 'new' ? 'Nova Receita' : 'Editar Receita', myRecipeForm: s.myRecipeForm || {},
      hasMyFormError: !!s.myFormError, myFormError: s.myFormError,
      myRecipeFormOnName: this.myRecipeFormField('name'), myRecipeFormOnCategorySet: this.setFormField('myRecipeForm', 'categoryId'),
      myRecipeFormOnDifficultySet: this.setFormField('myRecipeForm', 'difficulty'), myRecipeFormOnPrepTime: this.myRecipeFormField('prepTime'),
      myRecipeFormOnServings: this.myRecipeFormField('servings'), myRecipeFormOnImageUrl: this.myRecipeFormField('imageUrl'),
      myRecipeFormOnExtras: this.myRecipeFormField('extrasText'), myRecipeFormOnInstructions: this.myRecipeFormField('instructionsText'), myRecipeFormOnTips: this.myRecipeFormField('tipsText'),
      myRecipeCategoryOptions, myRecipeSectionRows, myRecipeIngredientRows, myProductOptionsForIngredients,
      onAddMyRecipeIngredient: this.addMyRecipeIngredient, onCancelMyRecipeForm: this.onCancelMyRecipeForm, onSaveMyRecipeForm: this.onSaveMyRecipeForm,
      dificuldadeOptionsMy: this.dificuldades,
      // Meu produto: form modal
      showMyProductForm: s.showMyProductForm, myProductFormTitle: s.myProductFormMode === 'new' ? 'Novo Produto' : 'Editar Produto', myProductForm: s.myProductForm || {},
      myProductFormOnName: this.myProductFormField('name'), myProductFormOnCategorySet: this.setFormField('myProductForm', 'categoryId'),
      myProductFormOnUnitSet: this.setFormField('myProductForm', 'unit'), myProductFormOnPrice: this.myProductFormField('price'),
      myProteinCategoryOptions, unidadeOptionsMy: this.unidades,
      onCancelMyProductForm: this.onCancelMyProductForm, onSaveMyProductForm: this.onSaveMyProductForm,
      // Minha categoria: form modal
      showMyCategoryForm: s.showMyCategoryForm, myCategoryFormTitle: s.myCategoryFormMode === 'new' ? 'Nova Categoria' : 'Editar Categoria', myCategoryForm: s.myCategoryForm || {},
      myCategoryFormOnName: this.myCategoryFormField('name'), myCategoryFormOnTypeSet: this.setFormField('myCategoryForm', 'type'),
      myCategoryTypeOptions: [{ value: 'receita', label: 'Receita' }, { value: 'secao', label: 'Seção' }, { value: 'proteina', label: 'Proteína/Produto' }],
      onCancelMyCategoryForm: this.onCancelMyCategoryForm, onSaveMyCategoryForm: this.onSaveMyCategoryForm,
      // Detalhe de receita própria/compartilhada: sharing, autoria, cópia
      showMyRecipeDetail: !!s.selectedMyRecipe || s.myRecipeDetailLoading || !!s.myRecipeDetailError, myRecipeDetailLoading: s.myRecipeDetailLoading,
      hasMyRecipeDetailError: !!s.myRecipeDetailError, myRecipeDetailError: s.myRecipeDetailError, onRetryMyRecipeDetail: this.onRetryMyRecipeDetail,
      myRecipeDetail: myRecipeDetailView, recipeAuthorName: s.recipeAuthorName,
      onCloseMyRecipeDetail: this.onCloseMyRecipeDetail,
      shareActive, shareCode, shareStatusLabel, hasShareCode: !!shareCode, shareGrantCount: s.shareGrantCount, shareBusy: s.shareBusy,
      hasShareFlash: !!s.shareFlash, shareFlash: s.shareFlash,
      onActivateSharing: this.onActivateSharing, onRegenerateShareCode: this.onRegenerateShareCode, onDeactivateSharing: this.onDeactivateSharing,
      onRevokeAllAccess: this.onRevokeAllAccess, onCopyShareCode: this.onCopyShareCode,
      onStartCopyRecipe: this.onStartCopyRecipe, copyBusy: s.copyBusy,
      // Cópia própria: modal de resolução de referências
      copyModalOpen: s.copyModalOpen, copyRefRows, hasCopyError: !!s.copyError, copyError: s.copyError,
      onCloseCopyModal: this.onCloseCopyModal, onConfirmCopy: this.onConfirmCopy,
      copyActionOptions: [{ value: 'add', label: 'Adicionar aos meus dados' }, { value: 'map', label: 'Associar a item existente' }, { value: 'remove', label: 'Remover da receita' }],
      copyActionOptionsNoRemove: [{ value: 'add', label: 'Adicionar aos meus dados' }, { value: 'map', label: 'Associar a item existente' }],
      // Perfil: "Cadastrar Receita por ID"
      redeemCode: s.redeemCode, redeemBusy: s.redeemBusy, hasRedeemMessage: !!s.redeemMessage, redeemMessage: s.redeemMessage, redeemMessageIsError: s.redeemMessageKind === 'error',
      onRedeemCodeChange: this.onRedeemCodeChange, onRedeemSubmit: this.onRedeemSubmit,
      onSetAdminTabRecipes: this.setAdminTabRecipes, onSetAdminTabProducts: this.setAdminTabProducts, onSetAdminTabCategories: this.setAdminTabCategories,
      adminTabRecipesStyle: `padding:10px 20px;border-radius:var(--radius-full);font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s ease,transform 0.15s ease;background:${s.adminTab === 'recipes' ? 'var(--brand-700)' : 'var(--neutral-50)'};color:${s.adminTab === 'recipes' ? '#F4F2F1' : 'var(--neutral-800)'}`,
      adminTabProductsStyle: `padding:10px 20px;border-radius:var(--radius-full);font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s ease,transform 0.15s ease;background:${s.adminTab === 'products' ? 'var(--brand-700)' : 'var(--neutral-50)'};color:${s.adminTab === 'products' ? '#F4F2F1' : 'var(--neutral-800)'}`,
      adminTabCategoriesStyle: `padding:10px 20px;border-radius:var(--radius-full);font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s ease,transform 0.15s ease;background:${s.adminTab === 'categories' ? 'var(--brand-700)' : 'var(--neutral-50)'};color:${s.adminTab === 'categories' ? '#F4F2F1' : 'var(--neutral-800)'}`,
      sectionToggleRows, proteinToggleRows, destaqueRecipeRows, newSectionLabel: s.newSectionLabel, onNewSectionLabelChange: this.onNewSectionLabelChange, onAddSection: this.addHomeSection,
      newProteinLabel: s.newProteinLabel, onNewProteinLabelChange: this.onNewProteinLabelChange, onAddProtein: this.addProductCategory,
      selectionMode: s.selectionMode, selectedCountLabel: `${s.selectedRecipeIds.length} selecionada(s)`,
      onBulkHideAsk: this.askBulkHide, onBulkDeleteAsk: this.askBulkDelete, onCancelSelection: this.onCancelSelection,
      productSelectionMode: s.productSelectionMode, selectedProductCountLabel: `${s.selectedProductIds.length} selecionado(s)`, onBulkDeleteProductsAsk: this.askBulkDeleteProducts, onCancelProductSelection: this.onCancelProductSelection,
      sectionSelectionMode: s.sectionSelectionMode, selectedSectionCountLabel: `${s.selectedSectionKeys.length} selecionada(s)`, onBulkDeleteSectionsAsk: this.askBulkDeleteSections, onCancelSectionSelection: this.onCancelSectionSelection,
      proteinSelectionMode: s.proteinSelectionMode, selectedProteinCountLabel: `${s.selectedProteinKeys.length} selecionada(s)`, onBulkDeleteProteinsAsk: this.askBulkDeleteProteins, onCancelProteinSelection: this.onCancelProteinSelection,
      appThemeClass: `${s.darkMode ? 'yc-dark' : ''} ${s.fontSize === 'small' ? 'yc-font-sm' : s.fontSize === 'large' ? 'yc-font-lg' : ''}`.trim(), onToggleDarkMode: this.toggleDarkMode,
      onToggleFullscreen: this.toggleFullscreen, fullscreenLabel: s.isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia',
      onSetNavRailLeft: this.setNavRailLeft, onSetNavRailRight: this.setNavRailRight,
      navRailLeftBtnStyle: `padding:8px 16px;border-radius:var(--radius-full);font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s ease;background:${s.navRailSide !== 'right' ? 'var(--brand-700)' : 'transparent'};color:${s.navRailSide !== 'right' ? '#F4F2F1' : 'var(--neutral-600)'}`,
      navRailRightBtnStyle: `padding:8px 16px;border-radius:var(--radius-full);font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s ease;background:${s.navRailSide === 'right' ? 'var(--brand-700)' : 'transparent'};color:${s.navRailSide === 'right' ? '#F4F2F1' : 'var(--neutral-600)'}`,
      onSetFontSizeSmall: () => this.onSetFontSize('small'), onSetFontSizeNormal: () => this.onSetFontSize('normal'), onSetFontSizeLarge: () => this.onSetFontSize('large'),
      fontSizeSmBtnStyle: `padding:8px 16px;border-radius:var(--radius-full);font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s ease;background:${s.fontSize === 'small' ? 'var(--brand-700)' : 'transparent'};color:${s.fontSize === 'small' ? '#F4F2F1' : 'var(--neutral-600)'}`,
      fontSizeNormalBtnStyle: `padding:8px 16px;border-radius:var(--radius-full);font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s ease;background:${(s.fontSize || 'normal') === 'normal' ? 'var(--brand-700)' : 'transparent'};color:${(s.fontSize || 'normal') === 'normal' ? '#F4F2F1' : 'var(--neutral-600)'}`,
      fontSizeLgBtnStyle: `padding:8px 16px;border-radius:var(--radius-full);font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s ease;background:${s.fontSize === 'large' ? 'var(--brand-700)' : 'transparent'};color:${s.fontSize === 'large' ? '#F4F2F1' : 'var(--neutral-600)'}`,
      settingsBorderColor: s.darkMode ? '#3A322D' : 'var(--neutral-100)',
      detailButtonBorderColor: s.darkMode ? '#3A322DE6' : 'var(--tabbar-border)',
      navBarBorderColor: s.darkMode ? '#3A322DE6' : 'var(--tabbar-border)',
      navBarBgColor: s.darkMode ? '#211C1ACC' : 'var(--tabbar-bg)',
      darkModeTrackStyle: `width:44px;height:26px;border-radius:var(--radius-full);cursor:pointer;position:relative;transition:background 0.15s ease;background:${s.darkMode ? 'var(--brand-700)' : 'var(--neutral-200)'}`,
      darkModeThumbStyle: `width:20px;height:20px;border-radius:50%;background:#fff;position:absolute;top:3px;left:${s.darkMode ? '21px' : '3px'};transition:left 0.15s ease;box-shadow:var(--shadow-sm)`,
      adminRecipeRows, adminProductRows, onNewRecipe: this.onNewRecipe, onNewProduct: this.onNewProduct,
      confirmDeleteOpen: !!s.confirmDelete, confirmDeleteMessage: s.confirmDelete ? s.confirmDelete.message : '', onConfirmDeleteYes: this.onConfirmDeleteYes, onConfirmDeleteNo: this.onConfirmDeleteNo,
      showRecipeForm: s.showRecipeForm, recipeFormTitle: s.recipeFormMode === 'new' ? 'Nova Receita' : 'Editar Receita', recipeForm: s.recipeForm || {},
      recipeFormOnNome: this.recipeFormField('nome'), recipeFormOnCategoriaSet: this.setFormField('recipeForm', 'categoria'), recipeFormOnDificuldadeSet: this.setFormField('recipeForm', 'dificuldade'),
      recipeFormOnTempo: this.recipeFormField('tempo'), recipeFormOnPorcoes: this.recipeFormField('porcoes'), recipeFormOnImagem: this.recipeFormField('imagem'),
      recipeFormOnTagDestaque: this.recipeFormCheck('tagDestaque'), recipeFormTagRows,
      recipeFormOnExtras: this.recipeFormField('extrasText'), recipeFormOnModoPreparo: this.recipeFormField('modoPreparoText'), recipeFormOnDicas: this.recipeFormField('dicasText'),
      onRandomImage: this.onRandomImage, categoriaReceitaOptions: this.categoriasReceita, dificuldadeOptions: this.dificuldades,
      recipeIngredientRows, produtoOptions: productOptions, onAddIngredientRow: this.addIngredientRow,
      onCancelRecipeForm: this.onCancelRecipeForm, onSaveRecipeForm: this.onSaveRecipeForm,
      showProductForm: s.showProductForm, productFormTitle: s.productFormMode === 'new' ? 'Novo Produto' : 'Editar Produto', productForm: s.productForm || {},
      productFormOnNome: this.productFormField('nome'), productFormOnCategoriaSet: this.setFormField('productForm', 'categoria'), productFormOnUnidadeSet: this.setFormField('productForm', 'unidade'), productFormOnPreco: this.productFormField('preco'),
      categoriaProdutoOptions: s.productCategories.filter(c => c.enabled).map(c => c.label), unidadeOptions: this.unidades,
      onCancelProductForm: this.onCancelProductForm, onSaveProductForm: this.onSaveProductForm,
      showImportModal: s.showImportModal, onOpenImportModal: this.onOpenImportModal, onCloseImportModal: this.onCloseImportModal, onBackToInstructions: this.onBackToInstructions,
      importStepInstructions: s.importStep === 'instructions', importStepResult: s.importStep === 'result',
      onDownloadTemplate: this.onDownloadTemplate, onImportFileChange: this.onImportFileChange,
      importParseError: s.importParseError, hasImportParseError: !!s.importParseError,
      importFileName: s.importFileName, importProductsCount: s.importParsedProducts.length, importRecipesCount: s.importParsedRecipes.length,
      importErrors: s.importErrors, hasImportErrors: s.importErrors.length > 0,
      importWarnings: s.importWarnings, hasImportWarnings: s.importWarnings.length > 0,
      hasImportNewCategories: ((s.importNewProductCategories || []).length + (s.importNewSections || []).length) > 0,
      importNewProductCategoriesList: [...(s.importNewProductCategories || []).map(c => c.label + ' (proteína)'), ...(s.importNewSections || []).map(c => c.label + ' (seção)')].join(', '),
      importCanProceed: s.importStep === 'result' && s.importErrors.length === 0,
      importModeIsMerge: s.importMode === 'merge', importModeIsReplaceMatching: s.importMode === 'replaceMatching', importModeIsReplace: s.importMode === 'replace',
      importModeMergeBorder: s.importMode === 'merge' ? 'var(--brand-500)' : 'var(--neutral-200)',
      importModeReplaceMatchingBorder: s.importMode === 'replaceMatching' ? 'var(--brand-500)' : 'var(--neutral-200)',
      importModeReplaceBorder: s.importMode === 'replace' ? 'var(--brand-500)' : 'var(--neutral-200)',
      onSetImportModeMerge: this.onSetImportModeMerge, onSetImportModeReplaceMatching: this.onSetImportModeReplaceMatching, onSetImportModeReplace: this.onSetImportModeReplace, onConfirmImport: this.onConfirmImport,
      categoriasProdutoList: s.productCategories.filter(c => c.enabled).map(c => c.label).join(', '), categoriasReceitaList: CATEGORIAS_RECEITA.join(', '),
      adminFlash: s.adminFlash, hasAdminFlash: !!s.adminFlash,
    };
  }

  render(props, state) {
    return renderApp(this);
  }
}

// Template is defined in template.js to keep this file focused on state/logic.
import { renderApp } from './template.js?v=20260803-1';

const mountEl = document.getElementById('app');
render(html`<${App} />`, mountEl);
