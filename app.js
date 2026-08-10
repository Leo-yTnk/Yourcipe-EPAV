import { h, html, render, Component } from './vendor/htm-preact-standalone.js?v=20260810-1';
import { CustomSelect } from './custom-select.js?v=20260810-1';
import {
  LS_KEYS, SECTION_DEFS, PRODUCT_SECTION_DEFS, FALLBACK_IMG,
  CATEGORIAS_PRODUTO, UNIDADES, CATEGORIAS_RECEITA, DIFICULDADES,
  DEFAULT_PRODUCTS, DEFAULT_RECIPES,
} from './data.js?v=20260810-1';
import { generateCredential, normalizeCredential } from './credential.js?v=20260810-1';
import { supabase } from './supabase-client.js?v=20260810-1';
import { signUpAttempt, signInWithCredential, fetchProfile, updateDisplayName, signOut, AUTH_GENERIC_ERROR, MAX_SIGNUP_ATTEMPTS } from './auth.js?v=20260810-1';
import { runSignupRetryLoop } from './signup-retry.js?v=20260810-1';
import { normalizeDisplayName } from './display-name.js?v=20260810-1';
import * as catalog from './catalog.js?v=20260810-1';
import { getTopmostModal, isTextareaElement, resolveEscapeAction, resolveEnterAction, isDoubleSubmit } from './modal-keyboard.js?v=20260810-1';
import { shouldShowWelcome, markWelcomeSeen } from './welcome.js?v=20260810-1';
import { createLoadGuard } from './load-guard.js?v=20260810-1';
import { shouldApplyAuthEvent } from './auth-events.js?v=20260810-1';

// Cache-busting version stamp — see the comment block at the top of
// index.html for the full explanation and the bump procedure. This literal
// must be identical to every `?v=...` query string in index.html and in
// every local import specifier below/in catalog.js/auth.js/custom-select.js/
// template.js (tests/js/cache-busting.test.js checks this can't drift).
const FRONTEND_VERSION = '20260810-1';
// eslint-disable-next-line no-console
console.info(`Yourcipe frontend: ${FRONTEND_VERSION}`);

const TURNSTILE_SITE_KEY = '0x4AAAAAAED4OOkYJr1mKBgo';
const CAPTCHA_FRIENDLY_ERROR = 'Não foi possível validar o CAPTCHA. Tente novamente.';
const TURNSTILE_TOKEN_WAIT_MS = 20000;
const TURNSTILE_MOUNT_POLL_MS = 100;
const TURNSTILE_MOUNT_TIMEOUT_MS = 5000;
const MULTI_SELECT_LONG_PRESS_MS = 480;
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
    let productSections = PRODUCT_SECTION_DEFS.map(d => ({ key: d.key, label: d.label, enabled: true, custom: false }));
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
      const sps = localStorage.getItem(LS_KEYS.productSections);
      if (sps) {
        const parsedPs = JSON.parse(sps);
        if (Array.isArray(parsedPs)) productSections = parsedPs;
        else productSections = productSections.map(h => ({ ...h, enabled: parsedPs[h.key] !== undefined ? parsedPs[h.key] : h.enabled }));
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
    // Welcome splash shows once per browser, ever — not once per session/
    // login. If localStorage is unavailable (private browsing, disabled,
    // throws), this fails safe by falling through to the pre-existing
    // "always show" behavior rather than breaking anything else.
    const shouldShowSplash = shouldShowWelcome(localStorage, LS_KEYS.welcomeSeen);
    return {
      frameW: (typeof window !== 'undefined') ? window.innerWidth : 1200,
      deviceMode: (typeof window !== 'undefined' && window.innerWidth >= 1200 && window.innerHeight >= 700) ? 'desktop' : (typeof window !== 'undefined' && (window.innerWidth >= 768 || window.innerWidth > window.innerHeight)) ? 'tablet' : 'mobile',
      darkMode, hiddenRecipeIds, homeSections, productSections, productCategories, newSectionLabel: '', newProductSectionLabel: '', newProteinLabel: '', newSectionIcon: 'star', newProductSectionIcon: 'star', navRailSide, weekStartDay, fontSize,
      productSectionPickerKey: null, productSectionPickerQuery: '', adminSearchQuery: '',
      selectionMode: false, selectedRecipeIds: [], recipeSelectionScope: '', recipeMenuOpenId: null,
      saleSelectionMode: false, selectedSaleIds: [],
      productSelectionMode: false, selectedProductIds: [], productSelectionScope: '',
      sectionSelectionMode: false, selectedSectionKeys: [],
      productSectionSelectionMode: false, selectedProductSectionKeys: [],
      proteinSelectionMode: false, selectedProteinKeys: [],
      heroIndex: 0,
      screen: 'inicio',
      selectedProductId: null,
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
      productsCategoryFilter: 'Todas',
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
      // Reference-checked deletion (supabase/009_recipe_deletion.sql,
      // supabase/010_hard_delete_and_reference_resolution.sql) — see
      // askDeleteRecipeChecked/openProductDeleteImpact/
      // openCategoryDeleteImpact and renderReferencesModal.
      // deleteImpactKind distinguishes which RPC family deleteImpact/
      // deleteBusy/deleteImpactLoading currently refer to, since a recipe,
      // product, and category impact each have a different shape and a
      // different confirm handler (onConfirmDeleteFromReferences /
      // onConfirmProductDeleteFromReferences / onConfirmCategoryDeleteFromReferences).
      deleteImpact: null, deleteImpactKind: null, deleteImpactLoading: false,
      ingredientRemoveConfirm: null,
      deleteResolutions: { revokeShares: false, cancelPendingRequests: false },
      // Per-row resolution choices for the product/category references
      // modal — never prefilled, the user must explicitly pick "replace" +
      // a replacement, or "remove", for every live row before the confirm
      // button becomes enabled (see canConfirm below).
      deleteRows: [], productResolutions: {},
      deleteCategoryRows: { products: [], recipes: [], sections: [], productSections: [] }, categoryResolutions: { products: {}, recipes: {}, sections: {}, productSections: {} },
      deleteBusy: false,
      editingProductId: null,
      editPriceValue: '',
      dataLoaded: true,
      showSplash: shouldShowSplash,
      showImportModal: false,
      importStep: 'instructions',
      importFileName: '',
      importParseError: '',
      importParsedProducts: [],
      importParsedRecipes: [],
      importParsedCategories: [],
      importErrors: [],
      importWarnings: [],
      importNewProductCategories: [],
      importNewSections: [],
      importModes: { recipes: 'add', products: 'add', categories: 'add' },
      importSummary: null,
      importBusy: false,
      importResult: null,
      importFileInputKey: 0,
      homeSectionDragKey: null,
      productSectionDragKey: null,
      homeSectionOrderBusy: false,
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
      myCategories: [], myProducts: [], myRecipes: [],
      // "Compartilhadas Comigo" (shared-with-me library) is a genuinely
      // separate data source from "Minhas Receitas/Produtos/Categorias" —
      // it now has its own independent loading/error flag instead of
      // sharing myCreationLoading/myCreationError, so a slow/failed
      // personal-data fetch never blocks or misreports the shared-library
      // tab's own state, and vice versa (see loadSharedLibrary below).
      sharedLibrary: [], sharedLibraryAuthorNames: {}, sharedLibraryLoading: false, sharedLibraryError: '',
      justRedeemedRecipeId: null,
      // Public (scope='site', active=true) categories/products, loaded
      // alongside the caller's own personal rows so every category/product
      // picker in "Modo de Criação" can offer "public active UNION my own
      // active", per type — never only the caller's own rows, and never
      // requiring the caller to have created anything of their own first.
      creationCategories: [], pickerPublicProducts: [],
      showMyCategoryForm: false, myCategoryFormMode: 'new', myCategoryForm: null,
      showMyProductForm: false, myProductFormMode: 'new', myProductForm: null,
      showMyRecipeForm: false, myRecipeFormMode: 'new', myRecipeForm: null,
      myFormError: '',
      // Recipe detail (own or shared-with-me) — sharing controls, authorship, copy.
      selectedMyRecipe: null, myRecipeDetailLoading: false, myRecipeDetailError: '', myRecipeDetailRequestedId: null,
      recipeAuthorName: '',
      shareStatus: null, shareGrantCount: 0, shareBusy: false, shareFlash: '',
      shareRevokeConfirming: false, shareCopyConfirmed: false,
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
      // Live scope='site'/active=true categories from Supabase (see
      // publicRecipeCategories()/publicProteinCategories()/
      // publicSectionCategories()) — populated by _loadPublicCatalog,
      // never by data.js's static constants or localStorage.
      publicCategories: [],

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
    // Refresh-without-reload fallback (Realtime is not used here — see the
    // comment on refetchActiveArea for why): whenever the tab regains focus
    // or becomes visible again, refetch ONLY whichever area is currently
    // on-screen. Each loader already guards against overlapping requests via
    // _guardedLoad, and this dispatcher itself only ever calls the loader(s)
    // for the screen/tab actually showing right now — never every loader
    // unconditionally — so a background tab never triggers requests for
    // data nobody is looking at.
    this._onVisibleRefetch = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      this.refetchActiveArea();
    };
    window.addEventListener('focus', this._onVisibleRefetch);
    document.addEventListener('visibilitychange', this._onVisibleRefetch);
    // One shared keyboard handler for every modal in the app (Part 11) —
    // see modal-keyboard.js's header comment for why this is a plain global
    // listener driven by getModalStack() rather than a per-modal hook.
    document.addEventListener('keydown', this.onGlobalModalKeydown);
  }
  componentWillUnmount() {
    if (this._ro) this._ro.disconnect();
    if (this._onResize) { window.removeEventListener('resize', this._onResize); window.removeEventListener('orientationchange', this._onResize); }
    if (this._onFsChange) document.removeEventListener('fullscreenchange', this._onFsChange);
    if (this._onVisibleRefetch) { window.removeEventListener('focus', this._onVisibleRefetch); document.removeEventListener('visibilitychange', this._onVisibleRefetch); }
    document.removeEventListener('keydown', this.onGlobalModalKeydown);
    clearTimeout(this._justRedeemedTimer);
    clearTimeout(this._shareCopyConfirmTimer);
    if (this._authSub) this._authSub.data.subscription.unsubscribe();
  }

  // =========================================================================
  // Shared modal keyboard/accessibility mechanism (Part 11) — ONE handler
  // for every modal, built on the pure functions in modal-keyboard.js. This
  // app is a single class Component and template.js's `render*Modal`
  // functions are plain functions (not separate Preact components), so a
  // "useModalKeyboard" hook would have nothing to attach to even though
  // vendor/htm-preact-standalone.js does export hooks — see the comment
  // block at the top of modal-keyboard.js for the full reasoning.
  //
  // getModalStack() is the single source of truth for "what modals exist,
  // in what stacking order, and how to close/submit/guard each one" — every
  // entry's zIndex mirrors the real z-index used in that modal's render
  // function in template.js, so getTopmostModal() picks the exact same
  // modal a user would visually perceive as "on top". Add a new modal here
  // whenever one is added to template.js's conditional render list.
  // =========================================================================
  getModalStack = () => {
    const s = this;
    const st = s.state;
    return [
      // Auth/profile — none of these are dismissible mid-network-call, and
      // showCompleteProfileModal/showProfileSetup have no cancel affordance
      // at all by design (onClose: null — Escape is a no-op for them,
      // exactly like clicking outside already does nothing for them).
      { key: 'profileSetup', open: !!st.showProfileSetup, zIndex: 20, onClose: null, onSubmit: this.onSaveProfile, busy: false, dirty: true, multiline: false },
      { key: 'login', open: !!st.showLoginModal, zIndex: 20, onClose: this.closeLoginModal, onSubmit: this.onLoginSubmit, busy: !!st.loginSubmitting, dirty: false, multiline: false },
      { key: 'signup', open: !!st.showSignupModal, zIndex: 20, onClose: this.closeSignupModal, onSubmit: this.onSignupSubmit, busy: !!st.signupSubmitting, dirty: false, multiline: false },
      { key: 'completeProfile', open: !!st.showCompleteProfileModal, zIndex: 25, onClose: null, onSubmit: this.onCompleteProfileSubmit, busy: !!st.completeProfileSubmitting, dirty: false, multiline: false },
      { key: 'changeName', open: !!st.showChangeNameModal, zIndex: 25, onClose: this.onCloseChangeNameModal, onSubmit: this.onChangeNameSubmit, busy: !!st.changeNameSubmitting, dirty: true, multiline: false },
      // Local (non-Supabase) demo data.
      { key: 'sales', open: !!st.salesModalOpen, zIndex: 20, onClose: this.onCloseSalesModal, onSubmit: this.onSaveSale, busy: false, dirty: true, multiline: false },
      { key: 'alt', open: !!st.altModal, zIndex: 20, onClose: this.closeAltModal, onSubmit: null, busy: false, dirty: false, multiline: false },
      // Produtos: simple read-only detail modal (photo/nome/categoria/preço).
      { key: 'productDetail', open: !!st.selectedProductId, zIndex: 21, onClose: this.closeProductDetail, onSubmit: null, busy: false, dirty: false, multiline: false },
      // "Seções de Produtos" click-to-add-products picker — a search field
      // (multiline: false) with no single "primary" submit action (every row
      // toggles its own checkbox), so onSubmit is null like productDetail.
      { key: 'productSectionPicker', open: !!st.productSectionPickerKey, zIndex: 21, onClose: this.closeProductSectionPicker, onSubmit: null, busy: false, dirty: false, multiline: false },
      // Confirm-delete — a "simple modal/dialog" whose Enter key confirms
      // the destructive action, same as clicking its own "Excluir" button;
      // never while a delete is already mid-flight.
      { key: 'confirmDelete', open: !!st.confirmDelete, zIndex: 25, onClose: this.onConfirmDeleteNo, onSubmit: this.onConfirmDeleteYes, busy: !!st.confirmDeleteBusy, dirty: false, multiline: false },
      // "Referências a resolver" — the reference-checked recipe-deletion
      // popup (askDeleteRecipeChecked/renderReferencesModal). No default
      // Enter action (the user must explicitly tick which references to
      // resolve, never confirm a destructive delete via bare Enter), and
      // Escape/close is blocked while a delete is mid-flight.
      { key: 'referencesModal', open: !!st.deleteImpact, zIndex: 26, onClose: this.onCloseReferencesModal, onSubmit: null, busy: !!st.deleteBusy, dirty: false, multiline: false },
      // Legacy local admin forms (pre-Supabase demo data editor).
      { key: 'legacyRecipeForm', open: !!st.showRecipeForm, zIndex: 20, onClose: this.onCancelRecipeForm, onSubmit: this.onSaveRecipeForm, busy: false, dirty: true, multiline: true },
      { key: 'legacyProductForm', open: !!st.showProductForm, zIndex: 20, onClose: this.onCancelProductForm, onSubmit: this.onSaveProductForm, busy: false, dirty: true, multiline: false },
      // Import wizard has no single "primary" action across all its steps —
      // Enter/Ctrl+Enter intentionally do nothing here to avoid triggering
      // an import a user hasn't explicitly reached the confirm step for.
      { key: 'import', open: !!st.showImportModal, zIndex: 30, onClose: this.onCloseImportModal, onSubmit: null, busy: false, dirty: true, multiline: false },
      // "Modo de Criação" personal forms.
      { key: 'myRecipeForm', open: !!st.showMyRecipeForm, zIndex: 20, onClose: this.onCancelMyRecipeForm, onSubmit: this.onSaveMyRecipeForm, busy: false, dirty: true, multiline: true },
      { key: 'myProductForm', open: !!st.showMyProductForm, zIndex: 20, onClose: this.onCancelMyProductForm, onSubmit: this.onSaveMyProductForm, busy: false, dirty: true, multiline: false },
      { key: 'myCategoryForm', open: !!st.showMyCategoryForm, zIndex: 20, onClose: this.onCancelMyCategoryForm, onSubmit: this.onSaveMyCategoryForm, busy: false, dirty: true, multiline: false },
      // Recipe detail (own or shared-with-me) — hosts the redesigned share
      // section. No single default Enter action (several independent
      // buttons: activate/regenerate/deactivate/revoke/copy), so onSubmit is
      // null; busy covers every in-flight action this modal can start so
      // Escape can never close it mid-transaction.
      // Matches template.js's own `showMyRecipeDetail` condition exactly
      // (loading/error states show this modal before selectedMyRecipe is
      // populated) — otherwise Escape/Enter would silently do nothing
      // during the brief loading window right after opening it.
      { key: 'myRecipeDetail', open: !!st.selectedMyRecipe || !!st.myRecipeDetailLoading || !!st.myRecipeDetailError, zIndex: 22, onClose: this.onCloseMyRecipeDetail, onSubmit: null, busy: !!(st.shareBusy || st.copyBusy || st.myRecipeDetailLoading), dirty: false, multiline: false },
      { key: 'copyResolve', open: !!st.copyModalOpen, zIndex: 24, onClose: this.onCloseCopyModal, onSubmit: this.onConfirmCopy, busy: !!st.copyBusy, dirty: true, multiline: false },
      // "Catálogo Público" (admin) forms.
      { key: 'siteRecipeForm', open: !!st.showSiteRecipeForm, zIndex: 20, onClose: this.onCancelSiteRecipeForm, onSubmit: this.onSaveSiteRecipeForm, busy: false, dirty: true, multiline: true },
      { key: 'siteProductForm', open: !!st.showSiteProductForm, zIndex: 20, onClose: this.onCancelSiteProductForm, onSubmit: this.onSaveSiteProductForm, busy: false, dirty: true, multiline: false },
      { key: 'siteCategoryForm', open: !!st.showSiteCategoryForm, zIndex: 20, onClose: this.onCancelSiteCategoryForm, onSubmit: this.onSaveSiteCategoryForm, busy: false, dirty: true, multiline: false },
      // Change requests.
      { key: 'publishRequest', open: !!st.publishRequest, zIndex: 26, onClose: this.onClosePublishRequest, onSubmit: this.onConfirmPublishRequest, busy: !!st.publishRequestBusy, dirty: true, multiline: true },
      { key: 'requestDetail', open: !!st.selectedRequestId, zIndex: 26, onClose: this.onCloseRequestDetail, onSubmit: null, busy: !!st.requestActionBusy, dirty: false, multiline: false },
      { key: 'returnRequest', open: !!st.showReturnRequestModal, zIndex: 28, onClose: this.onCloseReturnRequestModal, onSubmit: this.onConfirmReturnRequest, busy: !!st.requestActionBusy, dirty: true, multiline: true },
      { key: 'rejectRequest', open: !!st.showRejectRequestModal, zIndex: 28, onClose: this.onCloseRejectRequestModal, onSubmit: this.onConfirmRejectRequest, busy: !!st.requestActionBusy, dirty: true, multiline: true },
    ];
  };

  // Rapid-double-submit guard, independent of whether a given form happens
  // to expose its own busy/saving flag (several of the legacy/personal
  // forms above don't) — see modal-keyboard.js's isDoubleSubmit.
  _lastModalSubmitAt = {};

  onGlobalModalKeydown = (e) => {
    if (e.key !== 'Escape' && e.key !== 'Enter' && e.key !== 'Tab') return;
    const top = getTopmostModal(this.getModalStack());
    if (!top) return;

    if (e.key === 'Tab') { this.trapTabWithin(top.key, e); return; }

    if (e.key === 'Escape') {
      const action = resolveEscapeAction(top);
      if (!action) return;
      e.preventDefault();
      if (action.needsConfirm && !window.confirm('Descartar as alterações não salvas?')) return;
      top.onClose();
      return;
    }

    // e.key === 'Enter'
    const isTextarea = isTextareaElement(document.activeElement);
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    const action = resolveEnterAction(top, { isTextarea, isCtrlOrCmd });
    if (!action) return;
    if (isDoubleSubmit(this._lastModalSubmitAt, top.key, Date.now())) { e.preventDefault(); return; }
    this._lastModalSubmitAt[top.key] = Date.now();
    e.preventDefault();
    top.onSubmit();
  };

  // Focus trap + initial focus + return-focus-on-close, applied to the
  // modals explicitly called out in the spec (confirm-delete, the recipe
  // detail modal that hosts the redesigned share section, and the
  // request-detail modal) via `ref=${this.modalFocusRef('key')}` on each
  // modal's panel element in template.js. Attach the same helper to any
  // other modal's panel the same way — it needs no per-modal code beyond
  // that one `ref` prop.
  _modalTriggerEl = {};
  _modalContainerEl = {};
  FOCUSABLE_SELECTOR = 'input,select,textarea,button,[href],[tabindex]:not([tabindex="-1"])';
  modalFocusRef = (key) => (el) => {
    if (el) {
      this._modalContainerEl[key] = el;
      if (!this._modalTriggerEl[key]) this._modalTriggerEl[key] = document.activeElement;
      requestAnimationFrame(() => {
        if (!el.isConnected) return;
        if (el.contains(document.activeElement)) return;
        const focusable = el.querySelector(this.FOCUSABLE_SELECTOR);
        (focusable || el).focus();
      });
    } else {
      delete this._modalContainerEl[key];
      const trigger = this._modalTriggerEl[key];
      delete this._modalTriggerEl[key];
      if (trigger && typeof trigger.focus === 'function' && document.contains(trigger)) {
        try { trigger.focus(); } catch (err) { /* trigger no longer focusable — nothing to do */ }
      }
    }
  };
  // Tab/Shift+Tab focus trap for whichever modal's container was registered
  // via modalFocusRef above — keeps focus cycling within that modal instead
  // of escaping into the (visually covered, but otherwise still-in-the-DOM)
  // background. A no-op for modals that haven't been wired with
  // `ref=${this.modalFocusRef(key)}` yet (Tab behaves natively for those,
  // same as before this round).
  trapTabWithin = (topKey, e) => {
    const container = this._modalContainerEl[topKey];
    if (!container || !container.isConnected) return;
    const focusables = Array.from(container.querySelectorAll(this.FOCUSABLE_SELECTOR)).filter((el) => !el.disabled);
    if (!focusables.length) { e.preventDefault(); container.focus(); return; }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey ? (active === first || !container.contains(active)) : active === last) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  };

  // Refresh strategy (Part 8): this app's Supabase project setup/Realtime
  // provisioning cannot be confirmed from this sandbox (no network route to
  // the real project — see supabase/STAGING.md's documented esm.sh
  // limitation), so wiring an unverifiable Realtime subscription here would
  // risk shipping something that silently never fires (or errors) against
  // the real project with no way to catch that in this environment. Per the
  // task's own fallback allowance, this uses the always-available,
  // fully-testable alternative instead: refetch on tab/section open (see
  // goProfile/setAdminTab*/onOpenAdminAttempt above) plus this focus/
  // visibilitychange handler, covering the same "don't require a manual
  // reload to see a change" goal without depending on anything unverifiable.
  refetchActiveArea = () => {
    const s = this.state;
    if (s.screen === 'home' || s.screen === 'search' || s.screen === 'favorites') this.loadPublicCatalog();
    if (s.screen === 'profile' && s.session) this.loadSharedLibrary(s.session.user.id);
    if (s.screen === 'admin' && s.session) {
      if (s.adminTab === 'myRecipes' || s.adminTab === 'myProducts' || s.adminTab === 'myCategories') this.loadMyCreationData(s.session.user.id);
      if (s.adminTab === 'sharedRecipes') this.loadSharedLibrary(s.session.user.id);
      if (s.adminTab === 'recipes' || s.adminTab === 'products' || s.adminTab === 'categories') this.loadSiteCatalogData();
      if (s.adminTab === 'myRequests') this.loadMyRequests(s.session.user.id);
      if (s.adminTab === 'requestsInbox') this.loadAllRequests();
    }
  };

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
    if (session) this.loadSalesData();
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

  _authInitStarted = false;
  _authIdentityGeneration = 0;
  initAuth = async () => {
    if (this._authInitStarted) return;
    this._authInitStarted = true;
    this._authSub = supabase.auth.onAuthStateChange((event, session) => {
      const currentUserId = this.state.session?.user?.id || null;
      if (!shouldApplyAuthEvent(event, session, currentUserId)) return;
      // Do not await a Supabase query inside onAuthStateChange: the auth
      // client emits while holding its own lock. Queue profile I/O outside
      // that callback and ignore it if a newer identity wins the race.
      const expectedUserId = session?.user?.id || null;
      const generation = ++this._authIdentityGeneration;
      Promise.resolve().then(async () => {
        if (!expectedUserId) { this.setState({ session: null, authRole: null, authDisplayName: null }); return; }
        const profile = await fetchProfile(expectedUserId);
        if (generation !== this._authIdentityGeneration) return;
        this.applySessionProfile(session, profile);
      }).catch((error) => {
        // eslint-disable-next-line no-console
        console.error('[Auth] late session profile failed', error);
      });
    });
    const initialGeneration = this._authIdentityGeneration;
    const { data } = await supabase.auth.getSession();
    const session = data.session || null;
    const profile = session ? await fetchProfile(session.user.id) : { role: null, displayName: null };
    if (initialGeneration === this._authIdentityGeneration) this.applySessionProfile(session, profile);
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

  screenOrder = { inicio: 0, home: 1, products: 2, search: 3, favorites: 4, dados: 5, profile: 6, detail: 7, admin: 8, salesHistory: 9 };
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
  // Admin catalog table's "last updated" column — pt-BR date+time, empty
  // string for anything missing/invalid rather than "Invalid Date".
  formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  weekStart(d) { const dt = new Date(d); const base = this.state.weekStartDay ?? 1; const day = (dt.getDay() - base + 7) % 7; dt.setHours(0, 0, 0, 0); dt.setDate(dt.getDate() - day); return dt; }
  todayDateInputValue = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  onOpenSalesModal = () => this.setState({ salesModalOpen: true, saleForm: { valor: '', ipc: '', data: this.todayDateInputValue() }, editingSaleId: null });
  onCloseSalesModal = () => this.setState({ salesModalOpen: false, editingSaleId: null });
  onSaleValorChange = (e) => this.setState({ saleForm: { ...this.state.saleForm, valor: e.target.value } });
  onSaleIpcChange = (e) => this.setState({ saleForm: { ...this.state.saleForm, ipc: e.target.value } });
  onSaleDataChange = (e) => this.setState({ saleForm: { ...this.state.saleForm, data: e.target.value } });
  onSaveSale = async () => {
    const f = this.state.saleForm;
    const valor = parseFloat(String(f.valor || '').replace(',', '.')) || 0;
    if (!valor) return;
    const ipc = parseInt(f.ipc, 10) || 0;
    const saleDate = f.data || this.todayDateInputValue();
    const dataISO = new Date(saleDate + 'T12:00:00').toISOString();
    const editId = this.state.editingSaleId;
    if (this.state.session) {
      const res = editId ? await catalog.updateSale(editId, { saleDate, value: valor, ipc }) : await catalog.createSale({ saleDate, value: valor, ipc });
      if (res.error) return;
      await this.loadSalesData();
      this.setState({ salesModalOpen: false, editingSaleId: null });
      return;
    }
    const vendas = editId
      ? this.state.vendas.map(v => v.id === editId ? { ...v, valor, ipc, data: dataISO } : v)
      : [...this.state.vendas, { id: 'v_' + Date.now(), data: dataISO, valor, ipc }];
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
  markLongPressSelectionActivated = () => { this._suppressNextSelectionClick = true; };
  consumeSelectionClickSuppression = () => {
    if (!this._suppressNextSelectionClick) return false;
    this._suppressNextSelectionClick = false;
    return true;
  };

  startSaleRowPress = (id) => {
    clearTimeout(this._salePressTimer);
    this._salePressTimer = setTimeout(() => {
      this.markLongPressSelectionActivated();
      this.setState(s => ({ saleSelectionMode: true, selectedSaleIds: s.selectedSaleIds.includes(id) ? s.selectedSaleIds : [...s.selectedSaleIds, id] }));
    }, MULTI_SELECT_LONG_PRESS_MS);
  };
  endSaleRowPress = () => clearTimeout(this._salePressTimer);
  toggleSaleSelected = (id) => this.setState(s => {
    const has = s.selectedSaleIds.includes(id);
    const selectedSaleIds = has ? s.selectedSaleIds.filter(x => x !== id) : [...s.selectedSaleIds, id];
    return { selectedSaleIds, saleSelectionMode: selectedSaleIds.length > 0 };
  });
  onCancelSaleSelection = () => this.setState({ saleSelectionMode: false, selectedSaleIds: [] });
  askBulkDeleteSales = () => this.setState({ confirmDelete: { type: 'bulk-delete-sales', ids: [...this.state.selectedSaleIds], message: `Excluir ${this.state.selectedSaleIds.length} venda(s) selecionada(s)? Esta ação não pode ser desfeita.` } });

  supabaseSaleToView = (v) => ({ id: v.id, data: new Date(v.sale_date + 'T12:00:00').toISOString(), valor: Number(v.value) || 0, ipc: Number(v.ipc) || 0 });
  loadSalesData = async () => {
    if (!this.state.session) return;
    const { data, error } = await catalog.fetchMySales();
    if (error) return;
    this.setState({ vendas: (data || []).map(this.supabaseSaleToView) });
  };

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
    markWelcomeSeen(localStorage, LS_KEYS.welcomeSeen);
    if (!this.state.profile) this.setState({ showProfileSetup: true, profileForm: { idade: '', genero: 'Prefiro não informar', cargo: '' } });
  };
  goInicio = () => { this.animateTo('inicio'); this.setState({ screen: 'inicio' }); };
  goHome = () => { this.animateTo('home'); this.setState({ screen: 'home' }); };
  goProducts = () => { this.animateTo('products'); this.setState({ screen: 'products' }); };
  goSearch = () => { this.animateTo('search'); this.setState({ screen: 'search' }); };
  goFavorites = () => { this.animateTo('favorites'); this.setState({ screen: 'favorites' }); };
  goDados = () => { this.animateTo('dados'); this.setState({ screen: 'dados' }); };
  goSearchWithFilter = (cat) => { this.animateTo('search'); this.setState({ screen: 'search', activeFilter: cat }); };
  onInicioSearchSubmit = (e) => {
    if (e && e.key && e.key !== 'Enter') return;
    this.goSearch();
  };
  openProductDetail = (id) => this.setState({ selectedProductId: id });
  closeProductDetail = () => this.setState({ selectedProductId: null });
  goProfile = () => {
    this.animateTo('profile');
    this.setState({ screen: 'profile' });
    if (!this.state.profile) this.setState({ showProfileSetup: true, profileForm: { idade: '', genero: 'Prefiro não informar', cargo: '' } });
    // Profile shows "Biblioteca Compartilhada Comigo" inline — refetch it
    // every time this screen is opened (cheap, guarded by loadSharedLibrary's
    // own in-flight check), same reasoning as setAdminTabSharedRecipes.
    if (this.state.session) this.loadSharedLibrary(this.state.session.user.id);
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
  setProductsCategoryFilter = (cat) => this.setState({ productsCategoryFilter: cat });

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
      this.loadSharedLibrary(this.state.session.user.id);
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
    this.loadMyCreationData(result.user.id); this.loadSalesData();
    this.loadSharedLibrary(result.user.id);
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
  onAdminSearchChange = (e) => this.setState({ adminSearchQuery: e.target.value });
  setAdminTabRecipes = () => this.setState({ adminTab: 'recipes', adminSearchQuery: '' });
  setAdminTabProducts = () => this.setState({ adminTab: 'products', adminSearchQuery: '' });
  setAdminTabCategories = () => this.setState({ adminTab: 'categories', adminSearchQuery: '' });
  setAdminTabMyRecipes = () => this.setState({ adminTab: 'myRecipes', adminSearchQuery: '' });
  setAdminTabMyProducts = () => this.setState({ adminTab: 'myProducts', adminSearchQuery: '' });
  setAdminTabMyCategories = () => this.setState({ adminTab: 'myCategories', adminSearchQuery: '' });
  // Refetches "Compartilhadas Comigo" every time the tab is opened (cheap,
  // guarded against overlap by loadSharedLibrary's own in-flight check) —
  // not just once on first "Modo de Criação" entry — so a redemption made
  // in another tab/device, or a revocation by the owner, is reflected the
  // next time the user comes back to this tab without a manual reload.
  setAdminTabSharedRecipes = () => { this.setState({ adminTab: 'sharedRecipes', adminSearchQuery: '' }); if (this.state.session) this.loadSharedLibrary(this.state.session.user.id); };

  flashAdmin = (msg) => { this.setState({ adminFlash: msg }); setTimeout(() => this.setState({ adminFlash: '' }), 4000); };
  flashShare = (msg) => { this.setState({ shareFlash: msg }); setTimeout(() => this.setState({ shareFlash: '' }), 3500); };

  // Category/product pickers for personal recipe/product forms show public
  // (scope='site', active=true) rows UNION all of the caller's personal
  // rows of the matching type — never another user's personal rows
  // (`creationCategories` comes from fetchCreationCategories's single safe
  // union query; pickerPublicProducts only contains scope='site' rows;
  // this.state.myProducts only contains the caller's own rows) — and never
  // require the caller to have created their own category/product first.
  pickerCategoriesByType = (type) => this.state.creationCategories.filter(c => c.type === type);
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
  // In-flight guard shared by every "Modo de Criação"/admin loader below —
  // keyed by loader name, so a focus/visibilitychange-triggered refetch (see
  // componentDidMount) never stacks a second overlapping request for the
  // same area on top of one already running, while a DIFFERENT area's loader
  // is completely unaffected (each key is independent).
  // Bug fixed here: without a timeout, a request that never settles (device
  // sleep/wake, backgrounded tab, a stalled connection with no server-side
  // timeout either) left `_inFlight[key]` permanently set, since its own
  // `finally` below only ever ran once `fn()` actually settled. Every later
  // attempt to load that same area — reopening the tab, the focus/
  // visibilitychange refetch, even clicking "Tentar novamente" — hit the
  // dedup guard and silently returned the same dead promise, never calling
  // setState again. That's the "stuck on Carregando... forever, needs a
  // reload" bug. Fixed by racing a timer alongside `fn()`: if the timer
  // wins, `onTimeout` (per-call-site, sets that area's own loading/error
  // state so its existing "Tentar novamente" button appears) fires and
  // `_inFlight[key]` is freed immediately, so the next call — including an
  // automatic retry — starts a genuinely new request instead of returning
  // the hung one. The old implementation still allowed that timed-out
  // request's late success/error/finally to mutate state after a retry.
  // `createLoadGuard` assigns a generation to each run, and every loader
  // state write below verifies that generation, so stale work is a no-op.
  _loadGuard = createLoadGuard();
  _inFlight = {};
  _guardedLoad(key, fn, onTimeout, timeoutMs = 20000) {
    let executionId;
    const finishWithError = (callback) => {
      if (this._inFlight[key]?.executionId === executionId) delete this._inFlight[key];
      if (callback) callback();
    };
    const promise = this._loadGuard.run(key, (_commit, runId) => fn(runId), {
      timeoutMs,
      onTimeout: () => finishWithError(onTimeout),
      onError: (error) => {
        // eslint-disable-next-line no-console
        console.error(`[Loader:${key}] unhandled failure`, error);
        finishWithError(onTimeout);
      },
    });
    executionId = this._loadGuard.executionId(key);
    // Kept as a read-only compatibility/debug mirror for diagnostics.
    this._inFlight[key] = { promise, executionId };
    promise.finally(() => {
      if (!this._loadGuard.has(key)) delete this._inFlight[key];
    });
    return promise;
  }

  loadMyCreationData = (uid) => this._guardedLoad('myCreationData', (runId) => this._loadMyCreationData(uid, runId), () => this.setState({ myCreationLoading: false, myCreationError: 'Tempo de carregamento esgotado. Tente novamente.' }));
  _loadMyCreationData = async (uid, runId) => {
    if (!uid) return { ok: false, error: 'missing uid' };
    if (this._loadGuard.isCurrent('myCreationData', runId)) this.setState({ myCreationLoading: true, myCreationError: '' });
    try {
      const [cats, prods, recs, creationCats, publicProds] = await Promise.all([
        catalog.fetchMyCategories(uid), catalog.fetchMyProducts(uid), catalog.fetchMyRecipes(uid),
        // Public (scope='site', active=true) categories/products — every
        // category/product picker below unions these with the caller's own
        // personal rows, so pickers work immediately from a freshly-seeded
        // catalog (supabase/008_seed_default_catalog.sql) with no dependency
        // on the caller having created anything personal first.
        catalog.fetchCreationCategories(uid), catalog.fetchPublicProducts(),
      ]);
      const failed = cats.error || prods.error || recs.error || creationCats.error || publicProds.error;
      if (failed) {
        // catalog.js already logged the full { code, message, details, hint }
        // to the console (see logSupabaseError) — this is the same real
        // message, just also surfaced in the UI instead of only a generic
        // string, per the explicit "não manter somente a mensagem genérica"
        // requirement.
        const detail = failed.message ? `${failed.message}${failed.code ? ` (${failed.code})` : ''}` : 'erro desconhecido';
        if (this._loadGuard.isCurrent('myCreationData', runId)) this.setState({ myCreationError: `Não foi possível carregar seus dados: ${detail}` });
        return { ok: false, error: detail };
      }
      if (this._loadGuard.isCurrent('myCreationData', runId)) this.setState({
        myCategories: cats.data || [], myProducts: prods.data || [], myRecipes: recs.data || [],
        creationCategories: creationCats.data || [], pickerPublicProducts: publicProds.data || [],
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
      if (this._loadGuard.isCurrent('myCreationData', runId)) this.setState({ myCreationError: `Não foi possível carregar seus dados: ${detail}` });
      return { ok: false, error: detail };
    } finally {
      if (this._loadGuard.isCurrent('myCreationData', runId)) this.setState({ myCreationLoading: false });
    }
  };

  // "Compartilhadas Comigo" — its own independent loader/loading/error flag,
  // deliberately separate from loadMyCreationData above (see the
  // sharedLibraryLoading/sharedLibraryError comment in the initial state):
  // redeeming a code, opening the "sharedRecipes" tab, or a
  // focus/visibilitychange refetch while that tab is open should never have
  // to wait on (or misreport) "Minhas Receitas/Produtos/Categorias", and
  // vice versa.
  loadSharedLibrary = (uid) => this._guardedLoad('sharedLibrary', (runId) => this._loadSharedLibrary(uid, runId), () => this.setState({ sharedLibraryLoading: false, sharedLibraryError: 'Tempo de carregamento esgotado. Tente novamente.' }));
  _loadSharedLibrary = async (uid, runId) => {
    if (!uid) return { ok: false, error: 'missing uid' };
    if (this._loadGuard.isCurrent('sharedLibrary', runId)) this.setState({ sharedLibraryLoading: true, sharedLibraryError: '' });
    try {
      const shared = await catalog.fetchSharedLibrary(uid);
      if (shared.error) {
        const detail = shared.error.message ? `${shared.error.message}${shared.error.code ? ` (${shared.error.code})` : ''}` : 'erro desconhecido';
        if (this._loadGuard.isCurrent('sharedLibrary', runId)) this.setState({ sharedLibraryError: `Não foi possível carregar as receitas compartilhadas: ${detail}` });
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
      if (this._loadGuard.isCurrent('sharedLibrary', runId)) this.setState({ sharedLibrary, sharedLibraryAuthorNames });
      return { ok: true };
    } catch (e) {
      const detail = (e && e.message) || 'erro inesperado';
      if (this._loadGuard.isCurrent('sharedLibrary', runId)) this.setState({ sharedLibraryError: `Não foi possível carregar as receitas compartilhadas: ${detail}` });
      return { ok: false, error: detail };
    } finally {
      if (this._loadGuard.isCurrent('sharedLibrary', runId)) this.setState({ sharedLibraryLoading: false });
    }
  };
  onRetrySharedLibrary = () => { if (this.state.session) this.loadSharedLibrary(this.state.session.user.id); };

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
  // askDeleteMyCategory: see the reference-checked version defined below,
  // alongside askDeleteRecipeChecked (openCategoryDeleteImpact).

  // ---- Meus Produtos ----
  onNewMyProduct = () => this.setState({ showMyProductForm: true, myProductFormMode: 'new', myFormError: '', myProductForm: { id: null, name: '', categoryId: (this.myProteinCategories()[0] && this.myProteinCategories()[0].id) || '', unit: 'kg', price: 0, imageUrl: '' } });
  onEditMyProduct = (p) => this.setState({ showMyProductForm: true, myProductFormMode: 'edit', myFormError: '', myProductForm: { id: p.id, name: p.name, categoryId: p.category_id, unit: p.unit, price: p.price, imageUrl: p.image_url || '' } });
  onCancelMyProductForm = () => this.setState({ showMyProductForm: false, myProductForm: null, myFormError: '' });
  myProductFormField = (field) => (e) => this.setState(s => ({ myProductForm: { ...s.myProductForm, [field]: e.target.value } }));
  onSaveMyProductForm = async () => {
    const f = this.state.myProductForm;
    const uid = this.state.session.user.id;
    if (!f.name || !f.name.trim() || !f.categoryId) { this.setState({ myFormError: 'Informe o nome e a categoria do produto.' }); return; }
    const patch = { name: f.name.trim(), category_id: f.categoryId, unit: f.unit, price: parseFloat(String(f.price).replace(',', '.')) || 0, image_url: (f.imageUrl || '').trim() || null };
    const res = f.id
      ? await catalog.updateProduct(f.id, patch)
      : await catalog.createProduct(uid, { name: patch.name, categoryId: patch.category_id, unit: patch.unit, price: patch.price, imageUrl: patch.image_url });
    if (res.error) { this.setState({ myFormError: 'Não foi possível salvar o produto.' }); return; }
    this.setState({ showMyProductForm: false, myProductForm: null });
    this.refreshAfterMyCreationMutation(uid, 'Produto salvo com sucesso.');
  };
  // askDeleteMyProduct: see the reference-checked version defined below,
  // alongside askDeleteRecipeChecked (openProductDeleteImpact).

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
    let data, error;
    try {
      ({ data, error } = await catalog.fetchRecipeDetail(row.id));
    } catch (e) {
      error = e;
    } finally {
      this.setState({ myRecipeDetailLoading: false });
    }
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
  onCancelMyRecipeForm = () => this.setState({ showMyRecipeForm: false, myRecipeForm: null, myFormError: '', ingredientRemoveConfirm: null });
  myRecipeFormField = (field) => (e) => this.setState(s => ({ myRecipeForm: { ...s.myRecipeForm, [field]: e.target.value } }));
  onMyRecipeIngredientChange = (idx, field, value) => this.setState(s => ({ myRecipeForm: { ...s.myRecipeForm, ingredients: s.myRecipeForm.ingredients.map((row, i) => i === idx ? { ...row, [field]: value } : row) } }));
  addMyRecipeIngredient = () => this.setState(s => ({ myRecipeForm: { ...s.myRecipeForm, ingredients: [...s.myRecipeForm.ingredients, { productId: this.pickerProducts()[0] ? this.pickerProducts()[0].id : '', quantity: 1 }] } }));
  removeMyRecipeIngredient = (idx) => this.removeIngredientAt('myRecipeForm', idx);
  // Confirm-before-remove for a single ingredient row (shared by
  // myRecipeForm and siteRecipeForm — see askRemoveIngredient below). Only
  // arms a confirmation when there's actually something to lose (a product
  // already selected for this row); an empty/just-added row removes
  // immediately, matching "confirmar somente quando necessário".
  removeIngredientAt = (formKey, idx) => this.setState(s => ({ [formKey]: { ...s[formKey], ingredients: s[formKey].ingredients.filter((_, i) => i !== idx) } }));
  askRemoveIngredient = async (formKey, idx) => {
    const form = this.state[formKey];
    const ing = form.ingredients[idx];
    if (!ing || !ing.productId) { this.removeIngredientAt(formKey, idx); return; }
    const products = formKey === 'myRecipeForm' ? this.pickerProducts() : this.state.siteProducts;
    const product = products.find(p => p.id === ing.productId);
    const quantity = parseFloat(String(ing.quantity).replace(',', '.')) || 0;
    const costImpact = product ? product.price * quantity : 0;
    this.setState({
      ingredientRemoveConfirm: {
        formKey, idx, productId: ing.productId, productName: product ? product.name : 'este produto', unit: product ? product.unit : '',
        quantity, costLabel: this.formatBRL(costImpact), usageCount: null,
      },
    });
    const { data } = await catalog.countOtherRecipesUsingProduct(ing.productId, form.id);
    // Guard against the user having already dismissed/changed the pending
    // row — or reopened/replaced the form entirely with a different
    // recipe reusing the same idx — by the time this resolves. Checking
    // productId too (not just formKey+idx) means a stale confirm can never
    // silently reattach itself to an unrelated row.
    this.setState(s => (s.ingredientRemoveConfirm && s.ingredientRemoveConfirm.formKey === formKey && s.ingredientRemoveConfirm.idx === idx && s.ingredientRemoveConfirm.productId === ing.productId)
      ? { ingredientRemoveConfirm: { ...s.ingredientRemoveConfirm, usageCount: data || 0 } } : {});
  };
  onConfirmRemoveIngredient = () => {
    const c = this.state.ingredientRemoveConfirm; if (!c) return;
    this.removeIngredientAt(c.formKey, c.idx);
    this.setState({ ingredientRemoveConfirm: null });
  };
  onCancelRemoveIngredient = () => this.setState({ ingredientRemoveConfirm: null });
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
  // Reference-checked recipe deletion (supabase/009_recipe_deletion.sql).
  // Used for both a personal recipe (owner, "Minhas Receitas") and a site
  // recipe (admin, "Catálogo Público") — get_recipe_delete_impact/
  // delete_recipe branch on scope/ownership server-side, so this one flow
  // covers both call sites; a non-owner/non-admin caller gets
  // not_authorized/not_owner/not_admin from the RPC itself, never a UI
  // that pretends the action is available. If the recipe has no live
  // references, this skips straight to the ordinary confirm-delete dialog
  // (showing its YCR code and name, "não pode ser desfeita") instead of
  // opening the references popup for nothing.
  askDeleteRecipeChecked = async (id) => {
    this.setState({ deleteImpactLoading: true, deleteImpact: null, deleteImpactKind: null });
    let data, error;
    try {
      ({ data, error } = await catalog.getRecipeDeleteImpact(id));
    } catch (e) {
      error = e;
    } finally {
      this.setState({ deleteImpactLoading: false });
    }
    if (error || !data) {
      this.flashAdmin('Não foi possível verificar as referências desta receita. Tente novamente.');
      return;
    }
    // A scope='site' recipe always goes through the explicit archive-vs-
    // delete choice (renderReferencesModal's recipeActionChoice), even
    // with zero live references — this is the "o botão Excluir não deve
    // transformar-se automaticamente em Arquivar" requirement: an admin
    // must always be offered "Excluir permanentemente" as a distinct
    // option, never silently redirected to archive just because the
    // recipe was once published. A personal recipe has no archived state
    // at all, so it keeps the simpler fast-path confirm below.
    if (data.scope === 'site') {
      this.setState({
        deleteImpact: data, deleteImpactKind: 'recipe',
        deleteResolutions: { revokeShares: false, cancelPendingRequests: false, recipeAction: data.recommend_archive ? 'archive' : 'delete' },
      });
      return;
    }
    const hasRefs = data.active_share || data.active_grant_count > 0 || data.pending_request_count > 0;
    if (!hasRefs) {
      this.setState({ confirmDelete: { type: 'recipeChecked', id, message: `Excluir a receita "${data.name}" (código ${data.recipe_code})? Esta ação não pode ser desfeita.` } });
      return;
    }
    this.setState({ deleteImpact: data, deleteImpactKind: 'recipe', deleteResolutions: { revokeShares: false, cancelPendingRequests: false } });
  };
  onSetRecipeDeleteAction = (action) => this.setState(s => ({ deleteResolutions: { ...s.deleteResolutions, recipeAction: action } }));
  onCloseReferencesModal = () => {
    if (this.state.deleteBusy) return;
    this.setState({ deleteImpact: null, deleteImpactKind: null, deleteRows: [], productResolutions: {}, deleteCategoryRows: { products: [], recipes: [], sections: [], productSections: [] }, categoryResolutions: { products: {}, recipes: {}, sections: {}, productSections: {} } });
  };
  onToggleResolveRevokeShares = () => this.setState(s => ({ deleteResolutions: { ...s.deleteResolutions, revokeShares: !s.deleteResolutions.revokeShares } }));
  onToggleResolveCancelRequests = () => this.setState(s => ({ deleteResolutions: { ...s.deleteResolutions, cancelPendingRequests: !s.deleteResolutions.cancelPendingRequests } }));
  onConfirmDeleteFromReferences = async () => {
    const impact = this.state.deleteImpact; if (!impact) return;
    const r = this.state.deleteResolutions;
    if (impact.active_share && !r.revokeShares) { this.flashAdmin('Marque "Revogar compartilhamentos" para continuar.'); return; }
    if (impact.pending_request_count > 0 && !r.cancelPendingRequests) { this.flashAdmin('Marque "Cancelar solicitações pendentes" para continuar.'); return; }
    this.setState({ deleteBusy: true });
    // scope='site' always goes through delete_recipe_action with the
    // admin's explicit archive/delete choice (see askDeleteRecipeChecked);
    // a personal recipe has no such choice and keeps the original RPC.
    const { data, error } = impact.scope === 'site'
      ? await catalog.deleteRecipeAction(impact.recipe_id, r.recipeAction || 'archive', { revokeShares: r.revokeShares, cancelPendingRequests: r.cancelPendingRequests })
      : await catalog.deleteRecipeChecked(impact.recipe_id, { revokeShares: r.revokeShares, cancelPendingRequests: r.cancelPendingRequests });
    this.setState({ deleteBusy: false });
    if (error) { this.flashAdmin('Não foi possível excluir a receita.'); return; }
    this.onCloseReferencesModal();
    this.afterRecipeDeleted(impact.recipe_id, data);
  };

  // ---- Produtos: exclusão permanente com resolução de referências
  // (supabase/010_hard_delete_and_reference_resolution.sql) — mirrors
  // askDeleteRecipeChecked above. Used for both a personal product ("Meus
  // Produtos") and a site product (admin "Catálogo Público"); the RPC
  // itself decides owner-vs-admin authorization server-side. If the
  // product has no live references at all, this skips straight to the
  // ordinary confirm-delete dialog instead of opening the references
  // popup for nothing.
  askDeleteMyProduct = (id) => this.openProductDeleteImpact(id);
  askDeleteSiteProduct = (id) => this.openProductDeleteImpact(id);
  openProductDeleteImpact = async (id) => {
    this.setState({ deleteImpactLoading: true, deleteImpact: null, deleteImpactKind: null });
    let data, error;
    try {
      ({ data, error } = await catalog.getProductDeleteImpact(id));
    } catch (e) {
      error = e;
    } finally {
      this.setState({ deleteImpactLoading: false });
    }
    if (error || !data) {
      this.flashAdmin('Não foi possível verificar as referências deste produto. Tente novamente.');
      return;
    }
    const hasRefs = data.total_ingredient_rows > 0 || data.pending_request_count > 0;
    if (!hasRefs) {
      this.setState({ confirmDelete: { type: 'productChecked', id, scope: data.scope, message: `Excluir o produto "${data.name}" (código ${data.product_code})? Esta ação não pode ser desfeita.` } });
      return;
    }
    const { data: rows, error: rowsError } = await catalog.fetchIngredientRowsForProduct(id);
    if (rowsError) {
      this.flashAdmin('Não foi possível carregar os usos deste produto. Tente novamente.');
      return;
    }
    const productResolutions = {};
    (rows || []).forEach((row) => { productResolutions[row.id] = { action: '', replacementProductId: '' }; });
    this.setState({ deleteImpact: data, deleteImpactKind: 'product', deleteRows: rows || [], productResolutions });
  };
  onSetProductResolutionAction = (rowId, action) => this.setState(s => ({ productResolutions: { ...s.productResolutions, [rowId]: { ...s.productResolutions[rowId], action, replacementProductId: action === 'remove' ? '' : (s.productResolutions[rowId] && s.productResolutions[rowId].replacementProductId) || '' } } }));
  onSetProductResolutionReplacement = (rowId, replacementProductId) => this.setState(s => ({ productResolutions: { ...s.productResolutions, [rowId]: { ...s.productResolutions[rowId], action: 'replace', replacementProductId } } }));
  onConfirmProductDeleteFromReferences = async () => {
    const impact = this.state.deleteImpact; if (!impact) return;
    const rows = this.state.deleteRows || [];
    const res = this.state.productResolutions || {};
    const unresolved = rows.some(row => {
      const r = res[row.id];
      return !r || !r.action || (r.action === 'replace' && !r.replacementProductId);
    });
    if (unresolved) { this.flashAdmin('Escolha "Substituir" ou "Remover" para cada uso do produto antes de continuar.'); return; }
    this.setState({ deleteBusy: true });
    const resolution = { ingredients: rows.map(row => (res[row.id].action === 'replace'
      ? { id: row.id, action: 'replace', replacement_product_id: res[row.id].replacementProductId }
      : { id: row.id, action: 'remove' })) };
    const { error } = await catalog.deleteProductResolved(impact.product_id, resolution);
    this.setState({ deleteBusy: false });
    if (error) {
      const detail = impact.foreign_personal_recipe_count > 0
        ? ' Outra pessoa ainda usa este produto em uma receita pessoal dela; a exclusão continuará bloqueada até que ela deixe de usá-lo.'
        : '';
      this.flashAdmin(`Não foi possível excluir o produto.${detail}`);
      return;
    }
    this.onCloseReferencesModal();
    this.afterProductOrCategoryDeleted(impact.scope);
  };

  // ---- Categorias: exclusão permanente com resolução de referências ----
  askDeleteMyCategory = (id) => this.openCategoryDeleteImpact(id);
  askDeleteSiteCategory = (id) => this.openCategoryDeleteImpact(id);
  openCategoryDeleteImpact = async (id) => {
    this.setState({ deleteImpactLoading: true, deleteImpact: null, deleteImpactKind: null });
    let data, error;
    try {
      ({ data, error } = await catalog.getCategoryDeleteImpact(id));
    } catch (e) {
      error = e;
    } finally {
      this.setState({ deleteImpactLoading: false });
    }
    if (error || !data) {
      this.flashAdmin('Não foi possível verificar as referências desta categoria. Tente novamente.');
      return;
    }
    const hasRefs = data.required_ref_count > 0 || data.optional_ref_count > 0 || data.pending_request_count > 0;
    if (!hasRefs) {
      this.setState({ confirmDelete: { type: 'categoryChecked', id, scope: data.scope, message: `Excluir a categoria "${data.name}" (código ${data.category_code})? Esta ação não pode ser desfeita.` } });
      return;
    }
    const [productsRes, recipesRes, sectionsRes, productSectionsRes] = await Promise.all([
      catalog.fetchProductRowsForCategory(id), catalog.fetchRecipeRowsForCategory(id), catalog.fetchSectionRowsForCategory(id),
      catalog.fetchProductSectionRowsForCategory(id),
    ]);
    if (productsRes.error || recipesRes.error || sectionsRes.error || productSectionsRes.error) {
      this.flashAdmin('Não foi possível carregar os usos desta categoria. Tente novamente.');
      return;
    }
    const deleteCategoryRows = {
      products: productsRes.data || [], recipes: recipesRes.data || [],
      sections: (sectionsRes.data || []).filter(row => row.recipe),
      productSections: (productSectionsRes.data || []).filter(row => row.product),
    };
    const categoryResolutions = {
      products: Object.fromEntries(deleteCategoryRows.products.map(p => [p.id, ''])),
      recipes: Object.fromEntries(deleteCategoryRows.recipes.map(r => [r.id, ''])),
      sections: Object.fromEntries(deleteCategoryRows.sections.map(s => [s.recipe_id, { action: '', replacementCategoryId: '' }])),
      productSections: Object.fromEntries(deleteCategoryRows.productSections.map(s => [s.product_id, { action: '', replacementCategoryId: '' }])),
    };
    this.setState({ deleteImpact: data, deleteImpactKind: 'category', deleteCategoryRows, categoryResolutions });
  };
  onSetCategoryProductReplacement = (productId, replacementCategoryId) => this.setState(s => ({ categoryResolutions: { ...s.categoryResolutions, products: { ...s.categoryResolutions.products, [productId]: replacementCategoryId } } }));
  onSetCategoryRecipeReplacement = (recipeId, replacementCategoryId) => this.setState(s => ({ categoryResolutions: { ...s.categoryResolutions, recipes: { ...s.categoryResolutions.recipes, [recipeId]: replacementCategoryId } } }));
  onSetCategorySectionAction = (recipeId, action) => this.setState(s => ({ categoryResolutions: { ...s.categoryResolutions, sections: { ...s.categoryResolutions.sections, [recipeId]: { action, replacementCategoryId: action === 'remove' ? '' : (s.categoryResolutions.sections[recipeId] && s.categoryResolutions.sections[recipeId].replacementCategoryId) || '' } } } }));
  onSetCategorySectionReplacement = (recipeId, replacementCategoryId) => this.setState(s => ({ categoryResolutions: { ...s.categoryResolutions, sections: { ...s.categoryResolutions.sections, [recipeId]: { action: 'replace', replacementCategoryId } } } }));
  onSetCategoryProductSectionAction = (productId, action) => this.setState(s => ({ categoryResolutions: { ...s.categoryResolutions, productSections: { ...s.categoryResolutions.productSections, [productId]: { action, replacementCategoryId: action === 'remove' ? '' : (s.categoryResolutions.productSections[productId] && s.categoryResolutions.productSections[productId].replacementCategoryId) || '' } } } }));
  onSetCategoryProductSectionReplacement = (productId, replacementCategoryId) => this.setState(s => ({ categoryResolutions: { ...s.categoryResolutions, productSections: { ...s.categoryResolutions.productSections, [productId]: { action: 'replace', replacementCategoryId } } } }));
  onConfirmCategoryDeleteFromReferences = async () => {
    const impact = this.state.deleteImpact; if (!impact) return;
    const rows = this.state.deleteCategoryRows; const res = this.state.categoryResolutions;
    const missingProduct = rows.products.some(p => !res.products[p.id]);
    const missingRecipe = rows.recipes.some(r => !res.recipes[r.id]);
    const missingSection = rows.sections.some(s => {
      const sec = res.sections[s.recipe_id];
      return !sec || !sec.action || (sec.action === 'replace' && !sec.replacementCategoryId);
    });
    const missingProductSection = rows.productSections.some(s => {
      const sec = res.productSections[s.product_id];
      return !sec || !sec.action || (sec.action === 'replace' && !sec.replacementCategoryId);
    });
    if (missingProduct || missingRecipe || missingSection || missingProductSection) { this.flashAdmin('Escolha uma categoria substituta (ou remova a seção) para cada uso desta categoria antes de continuar.'); return; }
    this.setState({ deleteBusy: true });
    const resolution = {
      products: rows.products.map(p => ({ id: p.id, replacement_category_id: res.products[p.id] })),
      recipes: rows.recipes.map(r => ({ id: r.id, replacement_category_id: res.recipes[r.id] })),
      sections: rows.sections.map(s => (res.sections[s.recipe_id].action === 'replace'
        ? { recipe_id: s.recipe_id, action: 'replace', replacement_category_id: res.sections[s.recipe_id].replacementCategoryId }
        : { recipe_id: s.recipe_id, action: 'remove' })),
      product_sections: rows.productSections.map(s => (res.productSections[s.product_id].action === 'replace'
        ? { product_id: s.product_id, action: 'replace', replacement_category_id: res.productSections[s.product_id].replacementCategoryId }
        : { product_id: s.product_id, action: 'remove' })),
    };
    const { error } = await catalog.deleteCategoryResolved(impact.category_id, resolution);
    this.setState({ deleteBusy: false });
    if (error) {
      const detail = impact.foreign_personal_ref_count > 0
        ? ' Outra pessoa ainda usa esta categoria em um item pessoal dela; a exclusão continuará bloqueada até que ela deixe de usá-la.'
        : '';
      this.flashAdmin(`Não foi possível excluir a categoria.${detail}`);
      return;
    }
    this.onCloseReferencesModal();
    this.afterProductOrCategoryDeleted(impact.scope);
  };
  // Shared post-delete refresh for both product and category resolved
  // deletes: a personal (scope='personal') row only ever affects "Modo de
  // Criação" lists; a scope='site' row only ever affects the admin catalog
  // tab — never both, so only the relevant loader is re-run.
  afterProductOrCategoryDeleted = (scope) => {
    if (scope === 'personal') {
      this.flashAdmin('Item excluído com sucesso.');
      this.refreshAfterMyCreationMutation(this.state.session.user.id, 'Item excluído com sucesso.');
    } else {
      this.loadSiteCatalogData(this.state.authRole);
      this.loadPublicCatalog();
      this.flashAdmin('Item excluído com sucesso.');
    }
  };

  // ---- Ativar/Desativar (arquivar) — separado de excluir permanentemente.
  // Mantém o registro, preserva histórico/relações, apenas some das áreas
  // públicas/normais de uso; sempre reversível.
  onToggleMyProductActive = async (p) => {
    const { error } = await catalog.setProductActive(p.id, !p.active);
    if (error) { this.flashAdmin('Não foi possível atualizar o produto.'); return; }
    this.refreshAfterMyCreationMutation(this.state.session.user.id, p.active ? 'Produto desativado.' : 'Produto ativado.');
  };
  onToggleMyCategoryActive = async (c) => {
    const { error } = await catalog.setCategoryActive(c.id, !c.active);
    if (error) { this.flashAdmin('Não foi possível atualizar a categoria.'); return; }
    this.refreshAfterMyCreationMutation(this.state.session.user.id, c.active ? 'Categoria desativada.' : 'Categoria ativada.');
  };
  // Runs after either delete path (simple confirm or references-resolved)
  // succeeds — updates every list this recipe could appear in, without a
  // page reload: local favorites (client-side only, no server table — see
  // supabase/009_recipe_deletion.sql's header comment), "Minhas
  // Receitas"/"Catálogo Público" (whichever applies), and the public
  // catalog (Home/Search), since a delete or archive can change what's
  // publicly visible.
  afterRecipeDeleted = (recipeId, result) => {
    if (this.state.favoriteIds.includes(recipeId)) {
      const favoriteIds = this.state.favoriteIds.filter(id => id !== recipeId);
      this.setState({ favoriteIds });
      this.persist(LS_KEYS.favorites, favoriteIds);
    }
    const msg = result && result.action === 'archived'
      ? 'Receita arquivada — havia histórico de compartilhamento ou publicação, então foi arquivada em vez de excluída.'
      : 'Receita excluída com sucesso.';
    const uid = this.state.session && this.state.session.user && this.state.session.user.id;
    if (uid) this.loadMyCreationData(uid);
    if (this.state.authRole === 'admin') this.loadSiteCatalogData();
    this.loadPublicCatalog();
    this.flashAdmin(msg);
  };

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
  // myRecipeDetailLoading is reset here too (not just by the loaders that
  // set it) as a backstop: showMyRecipeDetail (computed prop) is true
  // whenever this flag is true regardless of selectedMyRecipe, so without
  // this the modal's own close button couldn't dismiss a stuck
  // "Carregando..." state.
  onCloseMyRecipeDetail = () => this.setState({ selectedMyRecipe: null, shareStatus: null, shareGrantCount: 0, recipeAuthorName: '', shareFlash: '', myRecipeDetailError: '', myRecipeDetailLoading: false, myRecipeDetailRequestedId: null, shareRevokeConfirming: false, shareCopyConfirmed: false });

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
  // "Revogar acessos existentes" is destructive (existing grantees
  // immediately lose read access to the original), so it always goes
  // through an explicit inline confirmation step first — never fires on the
  // first click. See renderMyRecipeDetailModal's "Compartilhamento" section.
  onAskRevokeAllAccess = () => this.setState({ shareRevokeConfirming: true });
  onCancelRevokeAllAccess = () => this.setState({ shareRevokeConfirming: false });
  onRevokeAllAccess = async () => {
    const rid = this.state.selectedMyRecipe.id;
    this.setState({ shareBusy: true, shareRevokeConfirming: false });
    const { data, error } = await catalog.revokeAccess(rid, null);
    this.setState({ shareBusy: false });
    if (error) { this.flashShare('Não foi possível revogar os acessos.'); return; }
    this.setState({ shareGrantCount: 0 });
    this.flashShare(`${data || 0} acesso(s) revogado(s).`);
  };
  onCopyShareCode = () => {
    const code = this.state.shareStatus && this.state.shareStatus.share_code;
    if (!code) return;
    const onCopied = () => {
      this.flashShare('Código copiado.');
      this.setState({ shareCopyConfirmed: true });
      clearTimeout(this._shareCopyConfirmTimer);
      this._shareCopyConfirmTimer = setTimeout(() => this.setState({ shareCopyConfirmed: false }), 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(onCopied).catch(() => this.copyShareCodeFallback(code, onCopied));
      return;
    }
    this.copyShareCodeFallback(code, onCopied);
  };
  // Fallback for browsers/contexts without the async Clipboard API (e.g.
  // non-secure context, or an older browser) — a hidden, off-screen
  // <textarea> + document.execCommand('copy') is the standard shim for
  // this. Silently does nothing further if even that isn't available
  // (execCommand missing entirely) — never throws.
  copyShareCodeFallback = (code, onCopied) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) onCopied();
    } catch (e) { /* no copy mechanism available — nothing more we can do */ }
  };

  // ---- Perfil: "Cadastrar Receita por ID" ----
  onRedeemCodeChange = (e) => this.setState({ redeemCode: e.target.value, redeemMessage: '' });
  onRedeemSubmit = async () => {
    const code = this.state.redeemCode.trim();
    if (!code || this.state.redeemBusy) return;
    this.setState({ redeemBusy: true, redeemMessage: '' });
    const { data: redeemedRecipeId, error } = await catalog.redeemShareCode(code);
    if (error) { this.setState({ redeemBusy: false, redeemMessage: error.friendly || 'Código inválido.', redeemMessageKind: 'error' }); return; }
    this.setState({ redeemBusy: false, redeemMessage: 'Receita adicionada à sua biblioteca, em modo somente leitura.', redeemMessageKind: 'success', redeemCode: '', justRedeemedRecipeId: redeemedRecipeId || null });
    // Clear the highlight a little while after — it's a "just happened"
    // affordance, not a permanent marker on the row.
    clearTimeout(this._justRedeemedTimer);
    this._justRedeemedTimer = setTimeout(() => this.setState({ justRedeemedRecipeId: null }), 15000);
    // Redemption already succeeded (redeemMessage above already says so) —
    // if the refetch that populates "Receitas Compartilhadas" fails, that
    // must not read as if the redemption itself failed. Same differentiation
    // as every other personal-data mutation (see refreshAfterMyCreationMutation).
    // Only the shared-library loader needs to run here — redemption only
    // ever affects "Compartilhadas Comigo", never Minhas Receitas/Produtos/
    // Categorias — so this refreshes just that one area, per the
    // independent-loading-states requirement.
    const refresh = await this.loadSharedLibrary(this.state.session.user.id);
    if (refresh && refresh.ok === false) {
      this.setState({ sharedLibraryError: `Código resgatado com sucesso. A lista não pôde ser atualizada automaticamente: ${refresh.error}` });
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
  loadPublicCatalog = () => this._guardedLoad('publicCatalog', (runId) => this._loadPublicCatalog(runId), () => this.setState({
    publicCatalogSource: 'demo-fallback', publicCatalogError: 'Tempo de carregamento esgotado. Tente novamente.',
    products: DEFAULT_PRODUCTS, recipes: DEFAULT_RECIPES, publicCategories: [],
  }));
  _loadPublicCatalog = async (runId) => {
    // Reset to 'loading' on every call (not just the very first, initial
    // one) so a retry after a demo-fallback error shows the loading state
    // again instead of leaving the stale fallback banner up mid-request.
    if (this._loadGuard.isCurrent('publicCatalog', runId)) this.setState({ publicCatalogSource: 'loading', publicCatalogError: '' });
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
        if (this._loadGuard.isCurrent('publicCatalog', runId)) this.setState({
          publicCatalogSource: 'demo-fallback',
          publicCatalogError: `${firstError.message || 'erro desconhecido'}${firstError.code ? ` (${firstError.code})` : ''}`,
          products: DEFAULT_PRODUCTS, recipes: DEFAULT_RECIPES, publicCategories: [],
        });
        return;
      }
      const recipeIds = (recsRes.data || []).map(r => r.id);
      const productIds = (prodsRes.data || []).map(p => p.id);
      const [ingRes, secRes, prodSecRes] = await Promise.all([
        catalog.fetchRecipeIngredientsBulk(recipeIds), catalog.fetchRecipeSectionsBulk(recipeIds),
        catalog.fetchProductSectionsBulk(productIds),
      ]);
      const secondError = ingRes.error || secRes.error || prodSecRes.error;
      if (secondError) {
        if (this._loadGuard.isCurrent('publicCatalog', runId)) this.setState({
          publicCatalogSource: 'demo-fallback',
          publicCatalogError: `${secondError.message || 'erro desconhecido'}${secondError.code ? ` (${secondError.code})` : ''}`,
          products: DEFAULT_PRODUCTS, recipes: DEFAULT_RECIPES, publicCategories: [],
        });
        return;
      }
      const ingByRecipe = {};
      (ingRes.data || []).forEach(i => { (ingByRecipe[i.recipe_id] = ingByRecipe[i.recipe_id] || []).push(i); });
      const secByRecipe = {};
      (secRes.data || []).forEach(s => { (secByRecipe[s.recipe_id] = secByRecipe[s.recipe_id] || []).push(s); });
      const secByProduct = {};
      (prodSecRes.data || []).forEach(s => { (secByProduct[s.product_id] = secByProduct[s.product_id] || []).push(s); });

      // Mapped into the exact same shape data.js's DEFAULT_PRODUCTS/
      // DEFAULT_RECIPES already used, so the rest of the (already extensive)
      // Home/Search/Detail rendering pipeline needs no changes at all — only
      // the data source changes, from a local seed to live Supabase data.
      const products = (prodsRes.data || []).map(p => ({
        id: p.id, nome: p.name, categoria: (p.category && p.category.name) || '', unidade: p.unit, preco: Number(p.price) || 0,
        imagem: p.image_url || FALLBACK_IMG,
        tags: (secByProduct[p.id] || []).map(s => s.slug).filter(Boolean),
      }));
      const recipes = (recsRes.data || []).map(r => {
        const tags = (secByRecipe[r.id] || []).map(s => s.slug).filter(Boolean);
        if (r.featured) tags.push('destaque');
        return {
          id: r.id, nome: r.name, categoria: (r.category && r.category.name) || '', tempo: r.prep_time, porcoes: r.servings,
          dificuldade: r.difficulty, imagem: r.image_url || FALLBACK_IMG, tags,
          ingredientes: (ingByRecipe[r.id] || []).map(i => ({ produtoId: i.product_id, qtd: Number(i.quantity) || 0 })),
          extras: r.extras || [], modoPreparo: r.instructions || [], dicas: r.tips || [],
        };
      });
      // fetchPublicCategories() (catalog.js) already filters scope='site'
      // and active=true server-side — catsRes.data is exactly the set of
      // public categories Home/Search should ever show, never the static
      // data.js constants (CATEGORIAS_RECEITA/SECTION_DEFS) that Home used
      // to read instead. Kept as the raw rows (not pre-split by type) so
      // publicRecipeCategories()/publicProteinCategories()/
      // publicSectionCategories() below stay the single place that splits
      // by type — see the comment there for why the three must never mix.
      if (this._loadGuard.isCurrent('publicCatalog', runId)) this.setState({ publicCatalogSource: 'supabase', publicCatalogError: '', products, recipes, publicCategories: catsRes.data || [] });
    } catch (e) {
      // Same defensive net as loadMyCreationData: an unexpected synchronous
      // throw here (not a normal Supabase `{ error }` response, which is
      // already handled above) must still resolve publicCatalogSource out
      // of 'loading' instead of leaving Home stuck.
      if (this._loadGuard.isCurrent('publicCatalog', runId)) this.setState({
        publicCatalogSource: 'demo-fallback',
        publicCatalogError: (e && e.message) || 'erro inesperado',
        products: DEFAULT_PRODUCTS, recipes: DEFAULT_RECIPES, publicCategories: [],
      });
    }
  };

  // Home/Search's only source of the live public category vocabulary —
  // never data.js's static CATEGORIAS_RECEITA/CATEGORIAS_PRODUTO/
  // SECTION_DEFS, and never localStorage. type is one of 'receita'
  // (recipe category chips), 'proteina' (product/protein categories) or
  // 'secao' (section/filter tags) — deliberately three separate getters,
  // never merged into one list, so a caller can't accidentally mix types.
  publicRecipeCategories = () => (this.state.publicCategories || []).filter(c => c.type === 'receita');
  publicProteinCategories = () => (this.state.publicCategories || []).filter(c => c.type === 'proteina');
  publicSectionCategories = () => (this.state.publicCategories || []).filter(c => c.type === 'secao');
  publicProductSectionCategories = () => (this.state.publicCategories || []).filter(c => c.type === 'secao_produto');

  // =========================================================================
  // Modo de Criação: "Catálogo Público" — admin-only direct authoring of
  // scope='site' rows (supabase/006_admin_catalog_publishing.sql). Mirrors
  // the "Minhas Receitas/Produtos/Categorias" CRUD above, parametrized for
  // the public catalog instead of personal data.
  // =========================================================================
  siteRecipeCategories = () => this.state.siteCategories.filter(c => c.type === 'receita');
  siteSectionCategories = () => this.state.siteCategories.filter(c => c.type === 'secao');
  siteProteinCategories = () => this.state.siteCategories.filter(c => c.type === 'proteina');
  siteProductSectionCategories = () => this.state.siteCategories.filter(c => c.type === 'secao_produto');

  // `role` is optional and defaults to reading this.state.authRole — pass
  // it explicitly when calling synchronously right after applySessionProfile
  // in the same tick (e.g. onLoginSubmit), for the same reason
  // loadMyCreationData takes an explicit uid: this.state.authRole would
  // still be stale there (Preact setState hasn't flushed yet).
  // Shared post-mutation refresh for every admin "Catálogo Público" action
  // (create/edit/activate/deactivate/publish/unpublish/archive category,
  // product, or recipe) and every approval that lands in scope='site'.
  // Always refreshes both the admin catalog view (so admin sees the new
  // status/active state immediately) and the public library (so a
  // newly-published/activated row appears for visitors/plain users without
  // a manual reload, and a newly-unpublished/deactivated one disappears).
  // Refetching the public catalog unconditionally on every admin mutation
  // is deliberately simple/safe here — it is a cheap read-only refetch, not
  // a write, so there is no correctness cost to occasionally refreshing it
  // for a change that turned out not to affect a published/active row.
  refreshAdminCatalog = () => {
    this.loadSiteCatalogData();
    this.loadPublicCatalog();
  };

  loadSiteCatalogData = (role) => this._guardedLoad('siteCatalogData', (runId) => this._loadSiteCatalogData(role, runId), () => this.setState({ siteCatalogLoading: false, siteCatalogError: 'Tempo de carregamento esgotado. Tente novamente.' }));
  _loadSiteCatalogData = async (role, runId) => {
    const effectiveRole = role !== undefined ? role : this.state.authRole;
    if (effectiveRole !== 'admin') return;
    if (this._loadGuard.isCurrent('siteCatalogData', runId)) this.setState({ siteCatalogLoading: true, siteCatalogError: '' });
    try {
      const [cats, prods, recs] = await Promise.all([
        catalog.fetchAdminCategories(), catalog.fetchAdminProducts(), catalog.fetchAdminRecipes(),
      ]);
      const failed = cats.error || prods.error || recs.error;
      if (failed) {
        const detail = failed.message ? `${failed.message}${failed.code ? ` (${failed.code})` : ''}` : 'erro desconhecido';
        if (this._loadGuard.isCurrent('siteCatalogData', runId)) this.setState({ siteCatalogError: `Não foi possível carregar o catálogo público: ${detail}` });
        return;
      }
      if (this._loadGuard.isCurrent('siteCatalogData', runId)) this.setState({ siteCategories: cats.data || [], siteProducts: prods.data || [], siteRecipes: recs.data || [] });
    } catch (e) {
      if (this._loadGuard.isCurrent('siteCatalogData', runId)) this.setState({ siteCatalogError: `Não foi possível carregar o catálogo público: ${(e && e.message) || 'erro inesperado'}` });
    } finally {
      if (this._loadGuard.isCurrent('siteCatalogData', runId)) this.setState({ siteCatalogLoading: false });
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
    this.refreshAdminCatalog();
  };
  onToggleSiteCategoryActive = async (c) => {
    const res = await catalog.updateSiteCategory(c.id, { active: !c.active });
    if (res.error) { this.flashAdmin(`Não foi possível atualizar: ${res.error.message || 'erro desconhecido'}`); return; }
    this.refreshAdminCatalog();
  };

  onNewSiteProduct = () => this.setState({ showSiteProductForm: true, siteProductFormMode: 'new', siteFormError: '', siteProductForm: { id: null, name: '', categoryId: (this.siteProteinCategories()[0] && this.siteProteinCategories()[0].id) || '', unit: 'kg', price: 0, active: true, imageUrl: '', sectionCategoryIds: [] } });
  onEditSiteProduct = async (p) => {
    this.setState({
      showSiteProductForm: true, siteProductFormMode: 'edit', siteFormError: '',
      siteProductForm: { id: p.id, name: p.name, categoryId: p.category_id, unit: p.unit, price: p.price, active: p.active, imageUrl: p.image_url || '', sectionCategoryIds: [] },
    });
    const { data, error } = await catalog.fetchProductSections(p.id);
    if (!error) this.setState(s => (s.siteProductForm && s.siteProductForm.id === p.id
      ? { siteProductForm: { ...s.siteProductForm, sectionCategoryIds: (data || []).map(row => row.category_id) } }
      : {}));
  };
  onCancelSiteProductForm = () => this.setState({ showSiteProductForm: false, siteProductForm: null, siteFormError: '' });
  siteProductFormField = (field) => (e) => this.setState(s => ({ siteProductForm: { ...s.siteProductForm, [field]: e.target.value } }));
  toggleSiteProductFormActive = (e) => this.setState(s => ({ siteProductForm: { ...s.siteProductForm, active: e.target.checked } }));
  toggleSiteProductSection = (categoryId) => this.setState(s => {
    const cur = s.siteProductForm.sectionCategoryIds || [];
    const sectionCategoryIds = cur.includes(categoryId) ? cur.filter(id => id !== categoryId) : [...cur, categoryId];
    return { siteProductForm: { ...s.siteProductForm, sectionCategoryIds } };
  });
  onSaveSiteProductForm = async () => {
    const f = this.state.siteProductForm;
    if (!f.name || !f.name.trim() || !f.categoryId) { this.setState({ siteFormError: 'Informe o nome e a categoria do produto.' }); return; }
    const patch = { name: f.name.trim(), category_id: f.categoryId, unit: f.unit, price: parseFloat(String(f.price).replace(',', '.')) || 0, active: !!f.active, image_url: (f.imageUrl || '').trim() || null };
    const res = f.id
      ? await catalog.updateSiteProduct(f.id, patch)
      : await catalog.createSiteProduct({ name: patch.name, categoryId: patch.category_id, unit: patch.unit, price: patch.price, active: patch.active, imageUrl: patch.image_url });
    if (res.error) { this.setState({ siteFormError: `Não foi possível salvar: ${res.error.message || 'erro desconhecido'}` }); return; }
    const productId = f.id || (res.data && res.data.id);
    const secRes = await catalog.replaceProductCategories(productId, f.sectionCategoryIds || []);
    if (secRes.error) this.flashAdmin('O produto foi salvo, mas houve um erro ao salvar as seções.');
    this.setState({ showSiteProductForm: false, siteProductForm: null });
    this.refreshAdminCatalog();
  };
  onToggleSiteProductActive = async (p) => {
    const res = await catalog.updateSiteProduct(p.id, { active: !p.active });
    if (res.error) { this.flashAdmin(`Não foi possível atualizar: ${res.error.message || 'erro desconhecido'}`); return; }
    this.refreshAdminCatalog();
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
    let data, error;
    try {
      ({ data, error } = await catalog.fetchRecipeDetail(row.id));
    } catch (e) {
      error = e;
    } finally {
      this.setState({ myRecipeDetailLoading: false });
    }
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
  onCancelSiteRecipeForm = () => this.setState({ showSiteRecipeForm: false, siteRecipeForm: null, siteFormError: '', ingredientRemoveConfirm: null });
  siteRecipeFormField = (field) => (e) => this.setState(s => ({ siteRecipeForm: { ...s.siteRecipeForm, [field]: e.target.value } }));
  toggleSiteRecipeFormFeatured = (e) => this.setState(s => ({ siteRecipeForm: { ...s.siteRecipeForm, featured: e.target.checked } }));
  onSiteRecipeIngredientChange = (idx, field, value) => this.setState(s => ({ siteRecipeForm: { ...s.siteRecipeForm, ingredients: s.siteRecipeForm.ingredients.map((row, i) => i === idx ? { ...row, [field]: value } : row) } }));
  addSiteRecipeIngredient = () => this.setState(s => ({ siteRecipeForm: { ...s.siteRecipeForm, ingredients: [...s.siteRecipeForm.ingredients, { productId: this.state.siteProducts[0] ? this.state.siteProducts[0].id : '', quantity: 1 }] } }));
  removeSiteRecipeIngredient = (idx) => this.removeIngredientAt('siteRecipeForm', idx);
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
    this.refreshAdminCatalog();
  };
  onToggleSiteRecipeStatus = async (r) => {
    const nextStatus = r.status === 'published' ? 'draft' : 'published';
    const res = await catalog.updateSiteRecipe(r.id, { status: nextStatus });
    if (res.error) { this.flashAdmin(`Não foi possível atualizar: ${res.error.message || 'erro desconhecido'}`); return; }
    this.refreshAdminCatalog();
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
  loadMyRequests = (uid) => this._guardedLoad('myRequests', (runId) => this._loadMyRequests(uid, runId), () => this.setState({ myRequestsLoading: false, myRequestsError: 'Tempo de carregamento esgotado. Tente novamente.' }));
  _loadMyRequests = async (uid, runId) => {
    if (!uid) return;
    if (this._loadGuard.isCurrent('myRequests', runId)) this.setState({ myRequestsLoading: true, myRequestsError: '' });
    try {
      const { data, error } = await catalog.fetchMyChangeRequests(uid);
      if (error) {
        if (this._loadGuard.isCurrent('myRequests', runId)) this.setState({ myRequestsError: `Não foi possível carregar seus pedidos: ${error.message || 'erro desconhecido'}` });
        return;
      }
      if (this._loadGuard.isCurrent('myRequests', runId)) this.setState({ myRequests: data || [] });
    } catch (e) {
      if (this._loadGuard.isCurrent('myRequests', runId)) this.setState({ myRequestsError: `Não foi possível carregar seus pedidos: ${(e && e.message) || 'erro inesperado'}` });
    } finally {
      if (this._loadGuard.isCurrent('myRequests', runId)) this.setState({ myRequestsLoading: false });
    }
  };
  setAdminTabMyRequests = () => { this.setState({ adminTab: 'myRequests', adminSearchQuery: '' }); if (this.state.session) this.loadMyRequests(this.state.session.user.id); };
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
  loadAllRequests = (role) => this._guardedLoad('allRequests', (runId) => this._loadAllRequests(role, runId), () => this.setState({ allRequestsLoading: false, allRequestsError: 'Tempo de carregamento esgotado. Tente novamente.' }));
  _loadAllRequests = async (role, runId) => {
    const effectiveRole = role !== undefined ? role : this.state.authRole;
    if (effectiveRole !== 'admin') return;
    if (this._loadGuard.isCurrent('allRequests', runId)) this.setState({ allRequestsLoading: true, allRequestsError: '' });
    try {
      const { data, error } = await catalog.fetchAllChangeRequests();
      if (error) {
        if (this._loadGuard.isCurrent('allRequests', runId)) this.setState({ allRequestsError: `Não foi possível carregar as solicitações: ${error.message || 'erro desconhecido'}` });
        return;
      }
      if (this._loadGuard.isCurrent('allRequests', runId)) this.setState({ allRequests: data || [] });
    } catch (e) {
      if (this._loadGuard.isCurrent('allRequests', runId)) this.setState({ allRequestsError: `Não foi possível carregar as solicitações: ${(e && e.message) || 'erro inesperado'}` });
    } finally {
      if (this._loadGuard.isCurrent('allRequests', runId)) this.setState({ allRequestsLoading: false });
    }
  };
  setAdminTabRequestsInbox = () => { this.setState({ adminTab: 'requestsInbox', adminSearchQuery: '' }); this.loadAllRequests(); };

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
    this.refreshAdminCatalog();
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
  onPickSectionIcon = (iconKey) => this.setState({ newSectionIcon: iconKey });
  addHomeSection = () => {
    const label = this.state.newSectionLabel.trim();
    if (!label) return;
    const slug = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || ('secao_' + Date.now());
    this.setState(s => {
      if (s.homeSections.some(h => h.key === slug)) return {};
      const homeSections = [...s.homeSections, { key: slug, label, enabled: true, custom: true, icon: s.newSectionIcon }];
      this.persist(LS_KEYS.sections, homeSections);
      return { homeSections, newSectionLabel: '', newSectionIcon: 'star' };
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
      this.markLongPressSelectionActivated();
      this.setState(s => ({ sectionSelectionMode: true, selectedSectionKeys: s.selectedSectionKeys.includes(key) ? s.selectedSectionKeys : [...s.selectedSectionKeys, key] }));
    }, MULTI_SELECT_LONG_PRESS_MS);
  };
  endSectionRowPress = () => clearTimeout(this._sectionPressTimer);
  toggleSectionSelected = (key) => this.setState(s => {
    const has = s.selectedSectionKeys.includes(key);
    const selectedSectionKeys = has ? s.selectedSectionKeys.filter(x => x !== key) : [...s.selectedSectionKeys, key];
    return { selectedSectionKeys, sectionSelectionMode: selectedSectionKeys.length > 0 };
  });
  onCancelSectionSelection = () => this.setState({ sectionSelectionMode: false, selectedSectionKeys: [] });
  askBulkDeleteSections = () => this.setState({ confirmDelete: { type: 'bulk-delete-sections', ids: [...this.state.selectedSectionKeys], message: `Excluir ${this.state.selectedSectionKeys.length} seção(ões) selecionada(s)? Esta ação não pode ser desfeita.` } });

  // ---- Seções de Produtos (local-only, mirrors "Seções de Receitas" above) ----
  toggleProductSection = (key) => this.setState(s => {
    const productSections = s.productSections.map(h => h.key === key ? { ...h, enabled: !h.enabled } : h);
    this.persist(LS_KEYS.productSections, productSections);
    return { productSections };
  });
  onNewProductSectionLabelChange = (e) => this.setState({ newProductSectionLabel: e.target.value });
  onPickProductSectionIcon = (iconKey) => this.setState({ newProductSectionIcon: iconKey });
  addProductSection = () => {
    const label = this.state.newProductSectionLabel.trim();
    if (!label) return;
    const slug = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || ('secao_' + Date.now());
    this.setState(s => {
      if (s.productSections.some(h => h.key === slug)) return {};
      const productSections = [...s.productSections, { key: slug, label, enabled: true, custom: true, icon: s.newProductSectionIcon }];
      this.persist(LS_KEYS.productSections, productSections);
      return { productSections, newProductSectionLabel: '', newProductSectionIcon: 'star' };
    });
  };
  removeProductSection = (key) => this.setState(s => {
    const productSections = s.productSections.filter(h => h.key !== key);
    this.persist(LS_KEYS.productSections, productSections);
    return { productSections };
  });
  // Click-to-add-products picker (product sections only, per user request —
  // recipe sections intentionally do not get this).
  openProductSectionPicker = (key) => this.setState({ productSectionPickerKey: key, productSectionPickerQuery: '' });
  closeProductSectionPicker = () => this.setState({ productSectionPickerKey: null, productSectionPickerQuery: '' });
  onProductSectionPickerSearchChange = (e) => this.setState({ productSectionPickerQuery: e.target.value });
  toggleProductInSection = (productId, sectionKey) => this.setState(s => {
    const products = s.products.map(p => {
      if (p.id !== productId) return p;
      const cur = p.tags || [];
      const tags = cur.includes(sectionKey) ? cur.filter(t => t !== sectionKey) : [...cur, sectionKey];
      return { ...p, tags };
    });
    this.persist(LS_KEYS.products, products);
    return { products };
  });
  startProductSectionRowPress = (key) => {
    clearTimeout(this._productSectionPressTimer);
    this._productSectionPressTimer = setTimeout(() => {
      this.markLongPressSelectionActivated();
      this.setState(s => ({ productSectionSelectionMode: true, selectedProductSectionKeys: s.selectedProductSectionKeys.includes(key) ? s.selectedProductSectionKeys : [...s.selectedProductSectionKeys, key] }));
    }, MULTI_SELECT_LONG_PRESS_MS);
  };
  endProductSectionRowPress = () => clearTimeout(this._productSectionPressTimer);
  toggleProductSectionSelected = (key) => this.setState(s => {
    const has = s.selectedProductSectionKeys.includes(key);
    const selectedProductSectionKeys = has ? s.selectedProductSectionKeys.filter(x => x !== key) : [...s.selectedProductSectionKeys, key];
    return { selectedProductSectionKeys, productSectionSelectionMode: selectedProductSectionKeys.length > 0 };
  });
  onCancelProductSectionSelection = () => this.setState({ productSectionSelectionMode: false, selectedProductSectionKeys: [] });
  askBulkDeleteProductSections = () => this.setState({ confirmDelete: { type: 'bulk-delete-product-sections', ids: [...this.state.selectedProductSectionKeys], message: `Excluir ${this.state.selectedProductSectionKeys.length} seção(ões) de produtos selecionada(s)? Esta ação não pode ser desfeita.` } });
  onLocalProductSectionDragStart = (key) => this.setState({ productSectionDragKey: key });
  onLocalProductSectionDragOver = (e) => { if (e && e.preventDefault) e.preventDefault(); };
  onLocalProductSectionDrop = (targetKey) => {
    const sourceKey = this.state.productSectionDragKey;
    if (!sourceKey || sourceKey === targetKey) { this.setState({ productSectionDragKey: null }); return; }
    this.setState(s => {
      const productSections = [...s.productSections];
      const from = productSections.findIndex(h => h.key === sourceKey);
      const to = productSections.findIndex(h => h.key === targetKey);
      if (from < 0 || to < 0) return { productSectionDragKey: null };
      const [moved] = productSections.splice(from, 1);
      productSections.splice(to, 0, moved);
      this.persist(LS_KEYS.productSections, productSections);
      return { productSections, productSectionDragKey: null };
    });
  };

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
      this.markLongPressSelectionActivated();
      this.setState(s => ({ proteinSelectionMode: true, selectedProteinKeys: s.selectedProteinKeys.includes(key) ? s.selectedProteinKeys : [...s.selectedProteinKeys, key] }));
    }, MULTI_SELECT_LONG_PRESS_MS);
  };
  endProteinRowPress = () => clearTimeout(this._proteinPressTimer);
  toggleProteinSelected = (key) => this.setState(s => {
    const has = s.selectedProteinKeys.includes(key);
    const selectedProteinKeys = has ? s.selectedProteinKeys.filter(x => x !== key) : [...s.selectedProteinKeys, key];
    return { selectedProteinKeys, proteinSelectionMode: selectedProteinKeys.length > 0 };
  });
  onCancelProteinSelection = () => this.setState({ proteinSelectionMode: false, selectedProteinKeys: [] });
  askBulkDeleteProteins = () => this.setState({ confirmDelete: { type: 'bulk-delete-proteins', ids: [...this.state.selectedProteinKeys], message: `Excluir ${this.state.selectedProteinKeys.length} categoria(s) selecionada(s)? Esta ação não pode ser desfeita.` } });

  onLocalHomeSectionDragStart = (key) => this.setState({ homeSectionDragKey: key });
  onLocalHomeSectionDragOver = (e) => { if (e && e.preventDefault) e.preventDefault(); };
  onLocalHomeSectionDrop = (targetKey) => {
    const sourceKey = this.state.homeSectionDragKey;
    if (!sourceKey || sourceKey === targetKey) { this.setState({ homeSectionDragKey: null }); return; }
    this.setState(s => {
      const homeSections = [...s.homeSections];
      const from = homeSections.findIndex(h => h.key === sourceKey);
      const to = homeSections.findIndex(h => h.key === targetKey);
      if (from < 0 || to < 0) return { homeSectionDragKey: null };
      const [moved] = homeSections.splice(from, 1);
      homeSections.splice(to, 0, moved);
      this.persist(LS_KEYS.sections, homeSections);
      return { homeSections, homeSectionDragKey: null };
    });
  };

  onHomeSectionDragStart = (id) => this.setState({ homeSectionDragKey: id });
  onHomeSectionDragOver = (e) => { if (e && e.preventDefault) e.preventDefault(); };
  // Handles both type='secao' (Receitas/Início sections) and
  // type='secao_produto' (Produtos sections) rows in the same Categorias
  // admin list — the dragged row's own type decides which subset gets
  // reordered and which admin_reorder_*_sections RPC persists it, so the
  // two vocabularies never mix into one order.
  onHomeSectionDrop = async (targetId) => {
    const sourceId = this.state.homeSectionDragKey;
    if (!sourceId || sourceId === targetId || this.state.authRole !== 'admin') { this.setState({ homeSectionDragKey: null }); return; }
    const siteCategories = [...this.state.siteCategories];
    const dragged = siteCategories.find(c => c.id === sourceId);
    if (!dragged || (dragged.type !== 'secao' && dragged.type !== 'secao_produto')) { this.setState({ homeSectionDragKey: null }); return; }
    const sectionType = dragged.type;
    const sections = siteCategories.filter(c => c.type === sectionType);
    const from = sections.findIndex(c => c.id === sourceId), to = sections.findIndex(c => c.id === targetId);
    if (from < 0 || to < 0) { this.setState({ homeSectionDragKey: null }); return; }
    const [moved] = sections.splice(from, 1); sections.splice(to, 0, moved);
    const orderedIds = new Set(sections.map(c => c.id));
    const reordered = [...siteCategories.filter(c => !orderedIds.has(c.id)), ...sections.map((c, i) => ({ ...c, sort_order: i }))];
    this.setState({ siteCategories: reordered, publicCategories: reordered, homeSectionDragKey: null, homeSectionOrderBusy: true });
    const reorderFn = sectionType === 'secao' ? catalog.adminReorderHomeSections : catalog.adminReorderProductSections;
    const { error } = await reorderFn(sections.map((c, i) => ({ id: c.id, sort_order: i })));
    this.setState({ homeSectionOrderBusy: false });
    if (error) { this.flashAdmin('Não foi possível sincronizar a ordem das seções.'); this.loadSiteCatalogData(); this.loadPublicCatalog(); }
  };

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
      this.markLongPressSelectionActivated();
      this.setState(s => ({ selectionMode: true, selectedRecipeIds: s.selectedRecipeIds.includes(id) ? s.selectedRecipeIds : [...s.selectedRecipeIds, id] }));
    }, MULTI_SELECT_LONG_PRESS_MS);
  };
  endRowPress = () => clearTimeout(this._pressTimer);
  startScopedRecipeRowPress = (id, scope) => {
    clearTimeout(this._pressTimer);
    this._pressTimer = setTimeout(() => {
      this.markLongPressSelectionActivated();
      this.setState(s => ({
        selectionMode: true,
        recipeSelectionScope: scope,
        selectedRecipeIds: s.recipeSelectionScope === scope && s.selectedRecipeIds.includes(id) ? s.selectedRecipeIds : [id],
      }));
    }, MULTI_SELECT_LONG_PRESS_MS);
  };
  toggleRecipeSelected = (id) => this.setState(s => {
    const has = s.selectedRecipeIds.includes(id);
    const selectedRecipeIds = has ? s.selectedRecipeIds.filter(x => x !== id) : [...s.selectedRecipeIds, id];
    return { selectedRecipeIds, selectionMode: selectedRecipeIds.length > 0, recipeSelectionScope: selectedRecipeIds.length ? s.recipeSelectionScope : '' };
  });
  onCancelSelection = () => this.setState({ selectionMode: false, selectedRecipeIds: [], recipeSelectionScope: '' });
  askBulkHide = () => this.setState({ confirmDelete: { type: 'bulk-hide', ids: [...this.state.selectedRecipeIds], message: `Ocultar ${this.state.selectedRecipeIds.length} receita(s) selecionada(s)? Elas deixarão de aparecer para os usuários.` } });
  askBulkDelete = () => { const scope = this.state.recipeSelectionScope || (this.state.adminTab === 'recipes' ? 'site' : this.state.adminTab === 'myRecipes' ? 'my' : 'local'); this.setState({ confirmDelete: { type: scope === 'site' ? 'bulk-delete-site-recipes' : scope === 'my' ? 'bulk-delete-my-recipes' : 'bulk-delete', ids: [...this.state.selectedRecipeIds], message: `Excluir ${this.state.selectedRecipeIds.length} receita(s) selecionada(s)? Esta ação não pode ser desfeita.` } }); };

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

  makeProductCard = (p, idx) => {
    const d = Math.min(idx || 0, 12) * 65;
    const rise = `animation:ycRise 0.5s cubic-bezier(0.22,0.8,0.24,1) ${d}ms backwards`;
    return {
      id: p.id, nome: p.nome, imagem: p.imagem || FALLBACK_IMG, categoria: p.categoria,
      tempoLabel: this.formatBRL(p.preco), dificuldade: p.unidade,
      carouselStyle: `flex:0 0 ${this.state.deviceMode === 'desktop' ? 280 : (this.state.deviceMode === 'tablet' ? 260 : 240)}px;cursor:pointer;transition:transform 0.18s ease,flex-basis 0.2s ease;scroll-snap-align:start;${rise}`,
      gridCardStyle: `position:relative;cursor:pointer;background:var(--neutral-0);border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-sm);border:1px solid var(--neutral-100);transition:transform 0.18s ease,box-shadow 0.18s ease;${rise}`,
      onOpen: () => this.openProductDetail(p.id),
    };
  };

  askDeleteRecipe = (id, nome) => this.setState({ confirmDelete: { type: 'recipe', id, message: `Excluir a receita "${nome}"? Esta ação não pode ser desfeita.` } });
  askDeleteProduct = (id, nome) => this.setState({ confirmDelete: { type: 'product', id, message: `Excluir o produto "${nome}"? Ele será removido também das receitas que o usam.` } });
  onConfirmDeleteNo = () => this.setState({ confirmDelete: null });
  onConfirmDeleteYes = async () => {
    const cd = this.state.confirmDelete; if (!cd) return;
    if (cd.type === 'recipeChecked') {
      this.setState({ confirmDelete: null, deleteBusy: true });
      const { data, error } = await catalog.deleteRecipeChecked(cd.id, {});
      this.setState({ deleteBusy: false });
      if (error) { this.flashAdmin('Não foi possível excluir a receita.'); return; }
      this.afterRecipeDeleted(cd.id, data);
      return;
    }
    // Reference-checked, zero-references fast path for a product/category
    // (supabase/010_hard_delete_and_reference_resolution.sql) — set by
    // openProductDeleteImpact/openCategoryDeleteImpact when the impact
    // check found nothing to resolve, mirroring 'recipeChecked' above. An
    // empty p_resolution is valid for both RPCs when there is nothing to
    // resolve.
    if (cd.type === 'productChecked' || cd.type === 'categoryChecked') {
      this.setState({ confirmDelete: null, deleteBusy: true });
      const fn = cd.type === 'productChecked' ? catalog.deleteProductResolved : catalog.deleteCategoryResolved;
      const { error } = await fn(cd.id, {});
      this.setState({ deleteBusy: false });
      if (error) { this.flashAdmin('Não foi possível excluir. Verifique se o item ainda está em uso em outra receita.'); return; }
      // cd.scope was captured from the impact check (openProductDeleteImpact/
      // openCategoryDeleteImpact) — the RPC's own return payload only has
      // action/id, not scope, so afterProductOrCategoryDeleted needs it from
      // here to know which loader to refresh.
      this.afterProductOrCategoryDeleted(cd.scope);
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
    } else if (cd.type === 'bulk-delete-my-recipes' || cd.type === 'bulk-delete-site-recipes') {
      for (const id of cd.ids) await catalog.deleteRecipeChecked(id, { revokeShares: true, cancelPendingRequests: true });
      this.setState({ confirmDelete: null, selectionMode: false, selectedRecipeIds: [], recipeSelectionScope: '' });
      if (cd.type === 'bulk-delete-site-recipes') { this.loadSiteCatalogData(this.state.authRole); this.loadPublicCatalog(); } else this.loadMyCreationData(this.state.session && this.state.session.user.id);
    } else if (cd.type === 'bulk-delete-my-products' || cd.type === 'bulk-delete-site-products') {
      for (const id of cd.ids) await catalog.deleteProductResolved(id, {});
      this.setState({ confirmDelete: null, productSelectionMode: false, selectedProductIds: [], productSelectionScope: '' });
      if (cd.type === 'bulk-delete-site-products') { this.loadSiteCatalogData(this.state.authRole); this.loadPublicCatalog(); } else this.loadMyCreationData(this.state.session && this.state.session.user.id);
    } else if (cd.type === 'sale') {
      if (this.state.session) { await catalog.deleteSale(cd.id); await this.loadSalesData(); this.setState({ confirmDelete: null }); }
      else { const vendas = this.state.vendas.filter(v => v.id !== cd.id); this.setState({ vendas, confirmDelete: null }); this.persist(LS_KEYS.vendas, vendas); }
    } else if (cd.type === 'bulk-delete-sales') {
      if (this.state.session) { await Promise.all(cd.ids.map(id => catalog.deleteSale(id))); await this.loadSalesData(); this.setState({ confirmDelete: null, saleSelectionMode: false, selectedSaleIds: [] }); }
      else { const vendas = this.state.vendas.filter(v => !cd.ids.includes(v.id)); this.setState({ vendas, confirmDelete: null, saleSelectionMode: false, selectedSaleIds: [] }); this.persist(LS_KEYS.vendas, vendas); }
    } else if (cd.type === 'bulk-delete-products') {
      const products = this.state.products.filter(p => !cd.ids.includes(p.id));
      this.setState({ products, confirmDelete: null, productSelectionMode: false, selectedProductIds: [] });
      this.persist(LS_KEYS.products, products);
    } else if (cd.type === 'bulk-delete-sections') {
      const homeSections = this.state.homeSections.filter(h => !cd.ids.includes(h.key));
      this.setState({ homeSections, confirmDelete: null, sectionSelectionMode: false, selectedSectionKeys: [] });
      this.persist(LS_KEYS.sections, homeSections);
    } else if (cd.type === 'bulk-delete-product-sections') {
      const productSections = this.state.productSections.filter(h => !cd.ids.includes(h.key));
      this.setState({ productSections, confirmDelete: null, productSectionSelectionMode: false, selectedProductSectionKeys: [] });
      this.persist(LS_KEYS.productSections, productSections);
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
      this.markLongPressSelectionActivated();
      this.setState(s => ({ productSelectionMode: true, selectedProductIds: s.selectedProductIds.includes(id) ? s.selectedProductIds : [...s.selectedProductIds, id] }));
    }, MULTI_SELECT_LONG_PRESS_MS);
  };
  endProductRowPress = () => clearTimeout(this._productPressTimer);
  startScopedProductRowPress = (id, scope) => {
    clearTimeout(this._productPressTimer);
    this._productPressTimer = setTimeout(() => {
      this.markLongPressSelectionActivated();
      this.setState(s => ({
        productSelectionMode: true,
        productSelectionScope: scope,
        selectedProductIds: s.productSelectionScope === scope && s.selectedProductIds.includes(id) ? s.selectedProductIds : [id],
      }));
    }, MULTI_SELECT_LONG_PRESS_MS);
  };
  toggleProductSelected = (id) => this.setState(s => {
    const has = s.selectedProductIds.includes(id);
    const selectedProductIds = has ? s.selectedProductIds.filter(x => x !== id) : [...s.selectedProductIds, id];
    return { selectedProductIds, productSelectionMode: selectedProductIds.length > 0, productSelectionScope: selectedProductIds.length ? s.productSelectionScope : '' };
  });
  onCancelProductSelection = () => this.setState({ productSelectionMode: false, selectedProductIds: [], productSelectionScope: '' });
  askBulkDeleteProducts = () => { const scope = this.state.productSelectionScope || (this.state.adminTab === 'products' ? 'site' : this.state.adminTab === 'myProducts' ? 'my' : 'local'); this.setState({ confirmDelete: { type: scope === 'site' ? 'bulk-delete-site-products' : scope === 'my' ? 'bulk-delete-my-products' : 'bulk-delete-products', ids: [...this.state.selectedProductIds], message: `Excluir ${this.state.selectedProductIds.length} produto(s) selecionado(s)? Esta ação não pode ser desfeita.` } }); };

  onNewProduct = () => this.setState({
    showProductForm: true, productFormMode: 'new',
    productForm: { id: null, nome: '', categoria: (this.state.productCategories.find(c => c.enabled) || {}).label || this.categoriasProduto[0] || 'Bovinos', unidade: this.unidades[0] || 'kg', preco: 0, imagem: '', tags: [] },
  });
  onEditProduct = (p) => this.setState({ showProductForm: true, productFormMode: 'edit', productForm: { id: p.id, nome: p.nome, categoria: p.categoria, unidade: p.unidade, preco: p.preco, imagem: p.imagem || '', tags: [...(p.tags || [])] } });
  onCancelProductForm = () => this.setState({ showProductForm: false, productForm: null });
  productFormField = (field) => (e) => this.setState(st => ({ productForm: { ...st.productForm, [field]: e.target.value } }));
  toggleProductFormTag = (key) => this.setState(s => {
    const cur = s.productForm.tags || [];
    const tags = cur.includes(key) ? cur.filter(t => t !== key) : [...cur, key];
    return { productForm: { ...s.productForm, tags } };
  });
  onRandomProductImage = () => this.setState(s => ({ productForm: { ...s.productForm, imagem: `https://picsum.photos/seed/p${Date.now()}/900/650` } }));
  onSaveProductForm = () => {
    const f = this.state.productForm;
    if (!f || !String(f.nome || '').trim()) return;
    const product = { id: f.id || ('p_' + Date.now()), nome: String(f.nome).trim(), categoria: f.categoria, unidade: f.unidade, preco: parseFloat(String(f.preco).replace(',', '.')) || 0, imagem: (f.imagem || '').trim(), tags: [...(f.tags || [])] };
    const products = f.id ? this.state.products.map(p => p.id === f.id ? product : p) : [...this.state.products, product];
    this.setState({ products, showProductForm: false, productForm: null });
    this.persist(LS_KEYS.products, products);
  };

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

  freshImportState = () => ({
    importStep: 'instructions', importFileName: '', importParseError: '',
    importParsedProducts: [], importParsedRecipes: [], importParsedCategories: [],
    importErrors: [], importWarnings: [], importNewProductCategories: [], importNewSections: [],
    importModes: { recipes: 'add', products: 'add', categories: 'add' },
    importSummary: null, importBusy: false, importResult: null,
    importFileInputKey: this.state.importFileInputKey + 1,
  });
  onOpenImportModal = () => {
    if (this.state.authRole !== 'admin') return;
    this.setState({ showImportModal: true, ...this.freshImportState() });
  };
  onCloseImportModal = () => this.setState({ showImportModal: false });
  onBackToInstructions = () => this.setState({ importStep: 'instructions', importParseError: '' });
  onNewImport = () => this.setState(this.freshImportState());
  onSetImportMode = (entity, mode) => this.setState({ importModes: { ...this.state.importModes, [entity]: mode } }, () => this.recomputeImportSummary());

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

  normalizeImportText = (value) => String(value || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  splitImportList = (value) => String(value || '').split(';').map(x => x.trim()).filter(Boolean);

  processImportWorkbook = (wb, fileName) => {
    if (this.state.authRole !== 'admin') return;
    const normKey = (txt) => this.normalizeImportText(txt).replace(/[^a-z0-9]+/g, '');
    const get = (row, names) => { const map = Object.fromEntries(Object.keys(row).map(k => [normKey(k), row[k]])); for (const name of names) if (Object.prototype.hasOwnProperty.call(map, normKey(name))) return map[normKey(name)]; return ''; };
    const rows = (sheet) => { const name = wb.SheetNames.find(n => this.normalizeImportText(n) === sheet); return name ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' }) : []; };
    const categoryRows = rows('categorias'), productRows = rows('produtos'), recipeRows = rows('receitas');
    const errors = [], warnings = [], parsedCategories = [], parsedProducts = [], parsedRecipes = [];
    const categoryKeys = new Set((this.state.siteCategories || []).filter(c => c.active !== false).map(c => `${c.type}:${this.normalizeImportText(c.name)}`));
    const seenCategories = new Set();
    categoryRows.forEach((row, i) => {
      const typeRaw = this.normalizeImportText(get(row, ['tipo', 'type']));
      const type = typeRaw === 'secao_produto' ? 'secao' : typeRaw;
      const name = String(get(row, ['nome', 'name', 'categoria']) || '').trim();
      const key = `${type}:${this.normalizeImportText(name)}`;
      if (!['proteina', 'receita', 'secao'].includes(type)) errors.push(`Categorias, linha ${i + 2}: tipo inválido "${typeRaw}".`);
      if (!name) errors.push(`Categorias, linha ${i + 2}: campo nome ausente.`);
      else if (seenCategories.has(key)) errors.push(`Categorias, linha ${i + 2} ("${name}"): categoria duplicada.`);
      else { seenCategories.add(key); categoryKeys.add(key); parsedCategories.push({ type, name }); }
    });

    const productNames = new Set((this.state.siteProducts || []).filter(p => p.active !== false).map(p => this.normalizeImportText(p.name)));
    const seenProducts = new Set();
    productRows.forEach((row, i) => {
      const name = String(get(row, ['nome', 'name', 'produto']) || '').trim();
      const category = String(get(row, ['categoria', 'category']) || '').trim();
      const unit = this.normalizeImportText(get(row, ['unidade', 'unit']));
      const price = Number(String(get(row, ['preco', 'preço', 'price'])).replace(',', '.'));
      const key = this.normalizeImportText(name);
      if (!name) errors.push(`Produtos, linha ${i + 2}: campo nome ausente.`);
      else if (seenProducts.has(key)) errors.push(`Produtos, linha ${i + 2} ("${name}"): produto duplicado.`);
      else seenProducts.add(key);
      if (!categoryKeys.has(`proteina:${this.normalizeImportText(category)}`)) errors.push(`Produtos, linha ${i + 2} ("${name || 'sem nome'}"): categoria não cadastrada nem declarada na aba Categorias: "${category}".`);
      if (!['kg', 'un', 'pacote', 'caixa', 'pote'].includes(unit)) errors.push(`Produtos, linha ${i + 2} ("${name || 'sem nome'}"): unidade inválida.`);
      if (!Number.isFinite(price) || price < 0) errors.push(`Produtos, linha ${i + 2} ("${name || 'sem nome'}"): preço inválido.`);
      parsedProducts.push({ name, category, unit, price: Number.isFinite(price) ? price : 0 });
      productNames.add(key);
    });

    const recipeCategoryNames = new Set([...categoryKeys].filter(k => k.startsWith('receita:')).map(k => k.slice(8)));
    const sectionKeys = new Set([...categoryKeys].filter(k => k.startsWith('secao:')).map(k => k.slice(6)));
    const seenRecipes = new Set();
    recipeRows.forEach((row, i) => {
      const line = i + 2, name = String(get(row, ['nome', 'name', 'receita']) || '').trim();
      const category = String(get(row, ['categoria', 'categoria da receita']) || '').trim();
      const prepTime = parseInt(get(row, ['tempo', 'tempo de preparo', 'prep_time']), 10);
      const servings = parseInt(get(row, ['porcoes', 'porções', 'servings']), 10);
      const difficulty = String(get(row, ['dificuldade', 'difficulty']) || '').trim() || 'Fácil';
      const ingredientsRaw = String(get(row, ['ingredientes', 'ingredients']) || '').trim();
      const instructionsRaw = String(get(row, ['modoPreparo', 'modo de preparo', 'instrucoes', 'instruções', 'instructions']) || '').trim();
      const tagsRaw = String(get(row, ['tags', 'secoes', 'seções']) || '').trim();
      const key = this.normalizeImportText(name);
      if (!name) errors.push(`Receitas, linha ${line}: campo nome ausente.`); else if (seenRecipes.has(key)) errors.push(`Receitas, linha ${line} ("${name}"): receita duplicada.`); else seenRecipes.add(key);
      if (!recipeCategoryNames.has(this.normalizeImportText(category))) errors.push(`Receitas, linha ${line} ("${name || 'sem nome'}"): categoria não cadastrada nem declarada na aba Categorias: "${category}".`);
      if (!Number.isFinite(prepTime) || prepTime < 0) errors.push(`Receitas, linha ${line} ("${name || 'sem nome'}"): tempo inválido.`);
      if (!Number.isFinite(servings) || servings < 0) errors.push(`Receitas, linha ${line} ("${name || 'sem nome'}"): porções inválidas.`);
      if (!DIFICULDADES.includes(difficulty)) errors.push(`Receitas, linha ${line} ("${name || 'sem nome'}"): dificuldade inválida.`);
      const ingredients = [];
      this.splitImportList(ingredientsRaw).forEach(part => { const sep = part.lastIndexOf(':'); const product = sep < 0 ? part : part.slice(0, sep).trim(); const quantity = sep < 0 ? NaN : parseFloat(part.slice(sep + 1).replace(',', '.')); if (!productNames.has(this.normalizeImportText(product))) errors.push(`Receitas, linha ${line} ("${name || 'sem nome'}"): produto não cadastrado nem declarado na aba Produtos: "${product}".`); if (!Number.isFinite(quantity) || quantity <= 0) errors.push(`Receitas, linha ${line} ("${name || 'sem nome'}"): quantidade inválida para "${product}".`); ingredients.push({ product, quantity }); });
      if (!ingredients.length) errors.push(`Receitas, linha ${line} ("${name || 'sem nome'}"): ingredientes ausentes.`);
      if (!instructionsRaw) errors.push(`Receitas, linha ${line} ("${name || 'sem nome'}"): modo de preparo ausente.`);
      const sections = tagsRaw.split(',').map(x => x.trim()).filter(x => x && this.normalizeImportText(x) !== 'destaque').filter(x => { const ok = sectionKeys.has(this.normalizeImportText(x)); if (!ok) warnings.push(`Receitas, linha ${line}: seção "${x}" não cadastrada; será ignorada.`); return ok; });
      parsedRecipes.push({ name, category, prep_time: prepTime || 0, servings: servings || 0, difficulty, image_url: String(get(row, ['imagem', 'image_url']) || '').trim(), featured: tagsRaw.split(',').some(x => this.normalizeImportText(x) === 'destaque'), ingredients, sections, extras: this.splitImportList(get(row, ['extras', 'descricao', 'descrição'])), instructions: this.splitImportList(instructionsRaw), tips: this.splitImportList(get(row, ['dicas', 'tips'])) });
    });
    if (!categoryRows.length && !productRows.length && !recipeRows.length) errors.push('Arquivo sem dados nas abas Categorias, Produtos ou Receitas.');
    this.setState({ importStep: 'result', importFileName: fileName, importParseError: '', importParsedCategories: parsedCategories, importParsedProducts: parsedProducts, importParsedRecipes: parsedRecipes, importErrors: errors, importWarnings: warnings, importResult: null }, () => this.recomputeImportSummary());
  };

  recomputeImportSummary = () => {
    const norm = x => this.normalizeImportText(x);
    const entities = [
      ['categories', this.state.importParsedCategories || [], this.state.siteCategories || []],
      ['products', this.state.importParsedProducts || [], this.state.siteProducts || []],
      ['recipes', this.state.importParsedRecipes || [], this.state.siteRecipes || []],
    ];
    const details = {};
    entities.forEach(([kind, imported, existing]) => { const existingKeys = new Set(existing.map(x => kind === 'categories' ? `${x.type}:${norm(x.name)}` : norm(x.name))); const importedKeys = new Set(imported.map(x => kind === 'categories' ? `${x.type}:${norm(x.name)}` : norm(x.name))); const equivalent = imported.filter(x => existingKeys.has(kind === 'categories' ? `${x.type}:${norm(x.name)}` : norm(x.name))).length; const mode = this.state.importModes[kind]; details[kind] = { total: imported.length, newCount: imported.length - equivalent, replaceCount: mode === 'add' ? 0 : equivalent, ignoredCount: mode === 'add' ? equivalent : 0, removedCount: mode === 'replace_all' ? existing.filter(x => !importedKeys.has(kind === 'categories' ? `${x.type}:${norm(x.name)}` : norm(x.name))).length : 0 }; });
    this.setState({ importSummary: { details, totalRows: entities.reduce((n, x) => n + x[1].length, 0), invalid: this.state.importErrors.length } });
  };

  onConfirmImport = async () => {
    const s = this.state;
    if (s.authRole !== 'admin' || s.importBusy || s.importErrors.length) return;
    if (Object.values(s.importModes).includes('replace_all') && !window.confirm('Substituir tudo desativará os itens públicos ausentes da planilha nas seções selecionadas. Receitas pessoais não serão alteradas. Deseja continuar?')) return;
    this.setState({ importBusy: true, importParseError: '', importResult: null });
    const { data, error } = await catalog.adminImportPublicCatalog(s.importModes, s.importParsedCategories, s.importParsedProducts, s.importParsedRecipes);
    this.setState({ importBusy: false });
    if (error) { this.setState({ importParseError: error.message || 'Falha ao importar. Nenhuma alteração foi aplicada.' }); return; }
    this.refreshAdminCatalog();
    const total = ['categories', 'products', 'recipes'].reduce((acc, kind) => { const item = data[kind] || {}; acc.added += item.added || 0; acc.replaced += item.replaced || 0; acc.ignored += item.ignored || 0; acc.removed += item.removed || 0; return acc; }, { added: 0, replaced: 0, ignored: 0, removed: 0 });
    const msg = `Importação concluída: ${total.added} adicionada(s), ${total.replaced} substituída(s), ${total.ignored} ignorada(s), ${total.removed} desativada(s).`;
    this.setState({ importResult: msg, adminFlash: msg }); setTimeout(() => this.setState({ adminFlash: '' }), 5000);
  };

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
    const showsRail = isWide && (screen === 'inicio' || screen === 'home' || screen === 'products' || screen === 'search' || screen === 'favorites' || screen === 'dados' || screen === 'profile');
    const stagePadLeft = showsRail ? (navRailSide === 'left' ? navRailWidth : 0) : 0;
    const stagePadRight = showsRail ? (navRailSide === 'right' ? navRailWidth : 0) : 0;
    const navRailSideStyle = navRailSide === 'right' ? 'right:0' : 'left:0';
    const navRailBorderColorVal = s.darkMode ? '#3A322DE6' : 'var(--tabbar-border)';
    const navRailBorderStyle = navRailSide === 'right' ? `border-left:1px solid ${navRailBorderColorVal}` : `border-right:1px solid ${navRailBorderColorVal}`;
    const scrollBottomPad = isCompact ? 150 : 32;
    const productOptions = s.products.map(p => ({ value: p.id, label: `${p.nome} (${this.formatBRL(p.preco)}/${p.unidade})` }));

    const visibleRecipes = s.recipes.filter(r => !s.hiddenRecipeIds.includes(r.id));
    const byTag = (tag) => visibleRecipes.filter(r => r.tags.includes(tag)).map((r, i) => this.makeRecipeCard(r, 'home', i));
    // Public section visibility is role-independent. Local preferences may
    // disable a known section, but an admin is never routed to a different
    // loader and a newly-created public section defaults to visible.
    const sectionOn = (key) => { const h = s.homeSections.find(x => x.key === key); return h ? h.enabled : this.publicSectionCategories().some(c => c.slug === key); };
    // Home sections are public catalog data, ordered by categories.sort_order.
    // Admins can drag section rows in the public catalog; every visitor then
    // sees this same order because fetchPublicCategories/fetchAdminCategories
    // both order by sort_order before the Home blocks are assembled here.
    const publicHomeSections = this.publicSectionCategories();
    const homeSectionSource = publicHomeSections.length
      ? publicHomeSections.map(c => ({ key: c.slug, label: c.name }))
      : SECTION_DEFS.map(d => ({ key: d.key, label: d.label }));
    // icon carried through per-section (set on custom sections at creation
    // time, see addHomeSection/addProductSection) — used by
    // resolveSectionIcon in template.js, falling back to the key-based
    // lookup when a section (default or public-catalog) has none.
    const sectionIconByKey = {}; s.homeSections.forEach(h => { if (h.icon) sectionIconByKey[h.key] = h.icon; });
    const homeSectionBlocks = homeSectionSource
      .filter(sec => sectionOn(sec.key))
      .map(sec => ({ key: sec.key, label: sec.label, items: byTag(sec.key) }))
      .filter(b => b.items.length > 0)
      .map(b => ({ ...b, icon: sectionIconByKey[b.key] }));
    // Produtos — exact mirror of homeSectionBlocks above: the public
    // catalog's type='secao_produto' categories (siteProductSectionCategories/
    // admin Categorias tab, replaceProductCategories on the site product
    // form) are the section vocabulary and order; s.productSections (Dados
    // screen, local-device-only) only ever supplies the on/off toggle, a
    // custom icon override, or — when the live catalog has no public
    // product sections at all (e.g. offline/demo fallback) — the fallback
    // default list, exactly like sectionOn/homeSectionSource do for recipes.
    const byProductTag = (tag) => s.products.filter(p => p.tags && p.tags.includes(tag)).map((p, i) => this.makeProductCard(p, i));
    const productSectionOn = (key) => { const h = s.productSections.find(x => x.key === key); return h ? h.enabled : this.publicProductSectionCategories().some(c => c.slug === key); };
    const publicProductHomeSections = this.publicProductSectionCategories();
    const productSectionSource = publicProductHomeSections.length
      ? publicProductHomeSections.map(c => ({ key: c.slug, label: c.name }))
      : PRODUCT_SECTION_DEFS.map(d => ({ key: d.key, label: d.label }));
    const productSectionIconByKey = {}; s.productSections.forEach(h => { if (h.icon) productSectionIconByKey[h.key] = h.icon; });
    const productHomeSectionBlocks = productSectionSource
      .filter(sec => productSectionOn(sec.key))
      .map(sec => ({ key: sec.key, label: sec.label, items: byProductTag(sec.key) }))
      .filter(b => b.items.length > 0)
      .map(b => ({ ...b, icon: productSectionIconByKey[b.key] }));
    const productCategoryChips = ['Todas', ...s.productCategories.filter(c => c.enabled).map(c => c.label)].map(cat => ({
      label: cat, onClick: () => this.setProductsCategoryFilter(cat),
      style: `padding:9px 18px;border-radius:var(--radius-full);font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;background:${s.productsCategoryFilter === cat ? 'var(--brand-700)' : 'var(--neutral-50)'};color:${s.productsCategoryFilter === cat ? 'var(--neutral-0)' : 'var(--neutral-800)'}`,
    }));
    // Produtos page: one carousel per enabled product category/badge
    // (Bovinos, Suínos, Aves...) instead of a single "Todos os Produtos"
    // catch-all — replaces every product's guaranteed visibility with
    // per-category visibility instead, respecting the category chip filter
    // exactly like the old catch-all did (each block naturally collapses to
    // empty/hidden when a specific chip other than its own is selected).
    const categoryBlocks = s.productCategories.filter(c => c.enabled).map(c => ({
      key: 'cat_' + c.key, label: c.label,
      items: s.products.filter(p => p.categoria === c.label && (s.productsCategoryFilter === 'Todas' || p.categoria === s.productsCategoryFilter)).map((p, i) => this.makeProductCard(p, i)),
    })).filter(b => b.items.length > 0);
    const productSectionBlocksFiltered = productHomeSectionBlocks.map(b => ({
      ...b, items: b.items.filter(it => s.productsCategoryFilter === 'Todas' || it.categoria === s.productsCategoryFilter),
    })).filter(b => b.items.length > 0);
    const productPageBlocks = [...productSectionBlocksFiltered, ...categoryBlocks];
    const inicioProductItems = s.products.slice(0, 12).map((p, i) => this.makeProductCard(p, i));
    const inicioProductBlock = { key: 'inicio_produtos', label: 'Produtos em Destaque', items: (byProductTag('recomendado').length ? byProductTag('recomendado') : inicioProductItems) };
    let selectedProduct = null;
    if (s.selectedProductId) {
      const p = s.products.find(x => x.id === s.selectedProductId);
      if (p) {
        const relatedRecipes = s.recipes.filter(r => r.ingredientes && r.ingredientes.some(i => i.produtoId === p.id)).map(r => ({
          id: r.id, nome: r.nome,
          onOpen: () => { this.closeProductDetail(); this.setState({ previousDetailScreen: 'products' }); this.selectRecipe(r.id); },
        }));
        selectedProduct = { id: p.id, nome: p.nome, categoria: p.categoria, unidade: p.unidade, precoLabel: this.formatBRL(p.preco), imagem: p.imagem || FALLBACK_IMG, relatedRecipes };
      }
    }
    // "Seções de Produtos" click-to-add-products picker (#1) — search
    // filters s.products by nome, case-insensitive.
    let productSectionPickerRows = [];
    let productSectionPickerLabel = '';
    if (s.productSectionPickerKey) {
      const sec = s.productSections.find(h => h.key === s.productSectionPickerKey);
      productSectionPickerLabel = sec ? sec.label : '';
      const q = (s.productSectionPickerQuery || '').trim().toLowerCase();
      productSectionPickerRows = s.products
        .filter(p => !q || p.nome.toLowerCase().includes(q))
        .map(p => ({
          id: p.id, nome: p.nome, imagem: p.imagem || FALLBACK_IMG, categoria: p.categoria,
          checked: !!(p.tags && p.tags.includes(s.productSectionPickerKey)),
          onToggle: () => this.toggleProductInSection(p.id, s.productSectionPickerKey),
        }));
    }

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
    const publicRecipeCategoryNames = this.publicRecipeCategories().map(c => c.name);
    const categoryChips = ['Todas', ...publicRecipeCategoryNames].map(cat => ({
      label: cat, onClick: () => this.setFilter(cat),
      style: `padding:9px 18px;border-radius:var(--radius-full);font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;background:${s.activeFilter === cat ? 'var(--brand-700)' : 'var(--neutral-50)'};color:${s.activeFilter === cat ? 'var(--neutral-0)' : 'var(--neutral-800)'}`,
    }));
    const filteredSearchResults = searchFiltered.map((r, i) => this.makeRecipeCard(r, 'search', i));

    const favoritesList = visibleRecipes.filter(r => s.favoriteIds.includes(r.id)).map((r, i) => this.makeRecipeCard(r, 'favorites', i));
    // Live Supabase type='receita' categories only — never the static
    // data.js CATEGORIAS_RECEITA constant (see publicRecipeCategories()).
    const homeCategoryChips = this.publicRecipeCategories().map(cat => ({ label: cat.name, onClick: () => this.goSearchWithFilter(cat.name) }));
    const homeCategoriesEmpty = s.publicCatalogSource === 'supabase' && homeCategoryChips.length === 0;

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
        onRowClick: () => { if (this.consumeSelectionClickSuppression()) return; if (this.state.selectionMode) this.toggleRecipeSelected(r.id); },
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
        key: h.key, label: h.label, isCustom: h.custom, onToggle: () => this.toggleSection(h.key), onRemove: () => this.removeHomeSection(h.key), draggable: true, onDragStart: () => this.onLocalHomeSectionDragStart(h.key), onDragOver: this.onLocalHomeSectionDragOver, onDrop: () => this.onLocalHomeSectionDrop(h.key),
        showCheckbox: s.sectionSelectionMode, showControls: !s.sectionSelectionMode,
        checkboxStyle: `width:22px;height:22px;border-radius:7px;border:2px solid var(--brand-700);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${selected ? 'var(--brand-700)' : 'transparent'};color:#F4F2F1;font-size:13px;font-weight:700`,
        checkMark: selected ? '✓' : '',
        rowStyle: `display:flex;align-items:center;justify-content:space-between;gap:14px;background:${selected ? 'rgba(178,64,25,0.08)' : 'var(--neutral-0)'};border:1px solid ${selected ? 'var(--brand-500)' : 'var(--neutral-100)'};border-radius:var(--radius-md);padding:14px 16px;margin-bottom:8px;cursor:${s.sectionSelectionMode ? 'pointer' : 'default'};user-select:none;transition:background 0.15s ease,border-color 0.15s ease`,
        onPressStart: () => this.startSectionRowPress(h.key), onPressEnd: this.endSectionRowPress,
        onRowClick: () => { if (this.consumeSelectionClickSuppression()) return; if (this.state.sectionSelectionMode) this.toggleSectionSelected(h.key); },
        trackStyle: `width:44px;height:26px;border-radius:var(--radius-full);cursor:pointer;position:relative;transition:background 0.15s ease;background:${checked ? 'var(--brand-700)' : 'var(--neutral-200)'}`,
        thumbStyle: `width:20px;height:20px;border-radius:50%;background:#fff;position:absolute;top:3px;left:${checked ? '21px' : '3px'};transition:left 0.15s ease;box-shadow:var(--shadow-sm)`,
      };
    });
    const recipeFormTagRows = s.homeSections.map(h => ({ key: h.key, label: h.label, checked: !!(s.recipeForm && s.recipeForm.tags && s.recipeForm.tags.includes(h.key)), onToggle: () => this.toggleFormTag(h.key) }));
    const productSectionToggleRows = s.productSections.map(h => {
      const checked = h.enabled;
      const selected = s.selectedProductSectionKeys.includes(h.key);
      return {
        key: h.key, label: h.label, isCustom: h.custom, onToggle: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.toggleProductSection(h.key); }, onRemove: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.removeProductSection(h.key); }, draggable: true, onDragStart: () => this.onLocalProductSectionDragStart(h.key), onDragOver: this.onLocalProductSectionDragOver, onDrop: () => this.onLocalProductSectionDrop(h.key),
        showCheckbox: s.productSectionSelectionMode, showControls: !s.productSectionSelectionMode,
        checkboxStyle: `width:22px;height:22px;border-radius:7px;border:2px solid var(--brand-700);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${selected ? 'var(--brand-700)' : 'transparent'};color:#F4F2F1;font-size:13px;font-weight:700`,
        checkMark: selected ? '✓' : '',
        rowStyle: `display:flex;align-items:center;justify-content:space-between;gap:14px;background:${selected ? 'rgba(178,64,25,0.08)' : 'var(--neutral-0)'};border:1px solid ${selected ? 'var(--brand-500)' : 'var(--neutral-100)'};border-radius:var(--radius-md);padding:14px 16px;margin-bottom:8px;cursor:pointer;user-select:none;transition:background 0.15s ease,border-color 0.15s ease`,
        onPressStart: () => this.startProductSectionRowPress(h.key), onPressEnd: this.endProductSectionRowPress,
        onRowClick: () => { if (this.consumeSelectionClickSuppression()) return; if (this.state.productSectionSelectionMode) { this.toggleProductSectionSelected(h.key); return; } this.openProductSectionPicker(h.key); },
        trackStyle: `width:44px;height:26px;border-radius:var(--radius-full);cursor:pointer;position:relative;transition:background 0.15s ease;background:${checked ? 'var(--brand-700)' : 'var(--neutral-200)'}`,
        thumbStyle: `width:20px;height:20px;border-radius:50%;background:#fff;position:absolute;top:3px;left:${checked ? '21px' : '3px'};transition:left 0.15s ease;box-shadow:var(--shadow-sm)`,
      };
    });
    const productFormTagRows = s.productSections.map(h => ({ key: h.key, label: h.label, checked: !!(s.productForm && s.productForm.tags && s.productForm.tags.includes(h.key)), onToggle: () => this.toggleProductFormTag(h.key) }));
    const proteinToggleRows = s.productCategories.map(c => {
      const checked = c.enabled;
      const selected = s.selectedProteinKeys.includes(c.key);
      return {
        key: c.key, label: c.label, isCustom: c.custom, onToggle: () => this.toggleProtein(c.key), onRemove: () => this.removeProductCategory(c.key),
        showCheckbox: s.proteinSelectionMode, showControls: !s.proteinSelectionMode,
        checkboxStyle: `width:22px;height:22px;border-radius:7px;border:2px solid var(--brand-700);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${selected ? 'var(--brand-700)' : 'transparent'};color:#F4F2F1;font-size:13px;font-weight:700`,
        checkMark: selected ? '✓' : '',
        rowStyle: `display:flex;align-items:center;justify-content:space-between;gap:14px;background:${selected ? 'rgba(178,64,25,0.08)' : 'var(--neutral-0)'};border:1px solid ${selected ? 'var(--brand-500)' : 'var(--neutral-100)'};border-radius:var(--radius-md);padding:14px 16px;margin-bottom:8px;cursor:${s.proteinSelectionMode ? 'pointer' : 'default'};user-select:none;transition:background 0.15s ease,border-color 0.15s ease`,
        onPressStart: () => this.startProteinRowPress(c.key), onPressEnd: this.endProteinRowPress,
        onRowClick: () => { if (this.consumeSelectionClickSuppression()) return; if (this.state.proteinSelectionMode) this.toggleProteinSelected(c.key); },
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
        onRowClick: () => { if (this.consumeSelectionClickSuppression()) return; if (this.state.productSelectionMode) this.toggleProductSelected(p.id); },
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

    // Shared search bar across every "Modo de Criação" admin tab (#2) — one
    // query field, reset on every tab switch (see onSetAdminTabX), matched
    // case-insensitively against whichever field(s) a given tab's rows show
    // as their primary label.
    const adminSearchNeedle = s.adminSearchQuery.trim().toLowerCase();
    const matchesSearch = (...texts) => !adminSearchNeedle || texts.some(t => String(t || '').toLowerCase().includes(adminSearchNeedle));

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
    const myRecipeRows = s.myRecipes.map(r => { const selected = s.recipeSelectionScope === 'my' && s.selectedRecipeIds.includes(r.id); return ({
      id: r.id, name: r.name, code: r.recipe_code, categoryName: (r.category && r.category.name) || '',
      source: 'personal', sourceLabel: 'Privada', sourceBadgeStyle: statusBadge('Privada', SOURCE_BADGE_COLORS.personal),
      showCheckbox: s.selectionMode && s.recipeSelectionScope === 'my', showActions: !(s.selectionMode && s.recipeSelectionScope === 'my'), checkMark: selected ? '✓' : '', checkboxStyle: `width:24px;height:24px;border-radius:8px;border:2px solid var(--brand-700);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${selected ? 'var(--brand-700)' : 'transparent'};color:#F4F2F1;font-size:13px;font-weight:700`, rowStyle: `display:flex;align-items:center;gap:14px;background:${selected ? 'rgba(178,64,25,0.08)' : 'var(--neutral-0)'};border:1px solid ${selected ? 'var(--brand-500)' : 'var(--neutral-100)'};border-radius:var(--radius-md);padding:12px 16px;margin-bottom:10px;cursor:${s.selectionMode && s.recipeSelectionScope === 'my' ? 'pointer' : 'default'};user-select:none`, onPressStart: () => this.startScopedRecipeRowPress(r.id, 'my'), onPressEnd: this.endRowPress, onRowClick: () => { if (this.consumeSelectionClickSuppression()) return; if (this.state.selectionMode && this.state.recipeSelectionScope === 'my') this.toggleRecipeSelected(r.id); },
      onOpen: () => this.onOpenMyRecipeDetail(r.id), onEdit: () => this.onEditMyRecipe(r), onDelete: () => this.askDeleteRecipeChecked(r.id),
    }); }).filter(row => matchesSearch(row.name));
    const myProductRows = s.myProducts.map(p => { const selected = s.productSelectionScope === 'my' && s.selectedProductIds.includes(p.id); return ({
      id: p.id, name: p.name, code: p.product_code, categoryName: (p.category && p.category.name) || '', unit: p.unit, priceLabel: this.formatBRL(p.price), imagem: p.image_url || FALLBACK_IMG,
      active: p.active, activeLabel: p.active ? 'Ativo' : 'Inativo', toggleActiveLabel: p.active ? 'Desativar' : 'Ativar',
      showCheckbox: s.productSelectionMode && s.productSelectionScope === 'my', showActions: !(s.productSelectionMode && s.productSelectionScope === 'my'), checkMark: selected ? '✓' : '', checkboxStyle: `width:24px;height:24px;border-radius:8px;border:2px solid var(--brand-700);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${selected ? 'var(--brand-700)' : 'transparent'};color:#F4F2F1;font-size:13px;font-weight:700`, rowStyle: `display:flex;align-items:center;gap:14px;background:${selected ? 'rgba(178,64,25,0.08)' : 'var(--neutral-0)'};border:1px solid ${selected ? 'var(--brand-500)' : 'var(--neutral-100)'};border-radius:var(--radius-md);padding:12px 16px;margin-bottom:10px;cursor:${s.productSelectionMode && s.productSelectionScope === 'my' ? 'pointer' : 'default'};user-select:none`, onPressStart: () => this.startScopedProductRowPress(p.id, 'my'), onPressEnd: this.endProductRowPress, onRowClick: () => { if (this.consumeSelectionClickSuppression()) return; if (this.state.productSelectionMode && this.state.productSelectionScope === 'my') this.toggleProductSelected(p.id); },
      onEdit: () => this.onEditMyProduct(p), onToggleActive: () => this.onToggleMyProductActive(p), onDelete: () => this.askDeleteMyProduct(p.id),
      onRequestPublish: () => this.onOpenPublishRequest('product', p.id, p.name),
    }); }).filter(row => matchesSearch(row.name));
    const myCategoryTypeLabel = (t) => t === 'receita' ? 'Receita' : t === 'secao' ? 'Seção' : t === 'secao_produto' ? 'Seção de Produto' : 'Proteína/Produto';
    const myCategoryRows = s.myCategories.map(c => ({
      id: c.id, name: c.name, code: c.category_code, typeLabel: myCategoryTypeLabel(c.type),
      active: c.active, activeLabel: c.active ? 'Ativa' : 'Inativa', toggleActiveLabel: c.active ? 'Desativar' : 'Ativar',
      onEdit: () => this.onEditMyCategory(c), onToggleActive: () => this.onToggleMyCategoryActive(c), onDelete: () => this.askDeleteMyCategory(c.id),
      onRequestPublish: () => this.onOpenPublishRequest('category', c.id, c.name),
    })).filter(row => matchesSearch(row.name));
    const sharedLibraryRows = s.sharedLibrary.map(r => ({
      id: r.id, name: r.name, code: r.recipe_code, categoryName: (r.category && r.category.name) || '',
      source: 'shared', sourceLabel: 'Compartilhada', sourceBadgeStyle: statusBadge('Compartilhada', SOURCE_BADGE_COLORS.shared),
      authorName: (s.sharedLibraryAuthorNames && s.sharedLibraryAuthorNames[r.id]) || '',
      // Highlighted immediately after a successful "Cadastrar Receita por
      // ID" redemption, so the newly-added recipe is easy to find in the
      // list without hunting for it — cleared automatically a little while
      // later (see onRedeemSubmit) or the next time this tab is opened.
      justRedeemed: s.justRedeemedRecipeId === r.id,
      onOpen: () => this.onOpenMyRecipeDetail(r.id),
    })).filter(row => matchesSearch(row.name));

    const myRecipeCategoryOptions = this.myRecipeCategories().map(c => ({ value: c.id, label: c.name }));
    const myProteinCategoryOptions = this.myProteinCategories().map(c => ({ value: c.id, label: c.name }));
    const myRecipeSectionRows = this.mySectionCategories().map(c => ({
      key: c.id, label: c.name,
      checked: !!(s.myRecipeForm && s.myRecipeForm.sectionCategoryIds.includes(c.id)),
      onToggle: () => this.toggleMyRecipeSection(c.id),
    }));
    const myProductOptionsForIngredients = this.pickerProducts().map(p => ({ value: p.id, label: `${p.name} (${this.formatBRL(p.price)}/${p.unit})` }));
    const myRecipeIngredientRows = s.myRecipeForm ? s.myRecipeForm.ingredients.map((row, idx) => {
      const rc = s.ingredientRemoveConfirm;
      const confirming = rc && rc.formKey === 'myRecipeForm' && rc.idx === idx && rc.productId === row.productId ? rc : null;
      return {
        idx, productId: row.productId, quantity: row.quantity,
        onProductSet: (v) => this.onMyRecipeIngredientChange(idx, 'productId', v),
        onQuantityChange: (e) => this.onMyRecipeIngredientChange(idx, 'quantity', e.target.value),
        onRemove: () => this.askRemoveIngredient('myRecipeForm', idx),
        confirming: !!confirming,
        confirmProductName: confirming ? confirming.productName : '',
        confirmDetailLabel: confirming ? `${this.formatQtd(confirming.quantity)} ${confirming.unit} · impacto no custo: ${confirming.costLabel}` : '',
        confirmUsageLabel: confirming
          ? (confirming.usageCount === null ? 'Verificando uso em outras receitas...' : confirming.usageCount > 0 ? `Este produto ainda é usado em ${confirming.usageCount} outra(s) receita(s).` : 'Este produto não é usado em nenhuma outra receita.')
          : '',
        onConfirmRemove: this.onConfirmRemoveIngredient, onCancelRemove: this.onCancelRemoveIngredient,
      };
    }) : [];
    const myIngredientTotalCostLabel = this.formatBRL((s.myRecipeForm ? s.myRecipeForm.ingredients : []).reduce((sum, row) => {
      const p = this.pickerProducts().find(pp => pp.id === row.productId);
      const q = parseFloat(String(row.quantity).replace(',', '.')) || 0;
      return sum + (p ? p.price * q : 0);
    }, 0));

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
      const selected = s.recipeSelectionScope === 'site' && s.selectedRecipeIds.includes(r.id);
      return {
        id: r.id, name: r.name, code: r.recipe_code, categoryName: (r.category && r.category.name) || '', featured: !!r.featured,
        source: 'admin_site', sourceLabel: 'Pública', sourceBadgeStyle: statusBadge('Pública', SOURCE_BADGE_COLORS.public),
        statusLabel,
        statusBadgeStyle: statusBadge(statusLabel, isPublished ? SOURCE_BADGE_COLORS.public : r.status === 'draft' ? SOURCE_BADGE_COLORS.draft : SOURCE_BADGE_COLORS.archived),
        toggleStatusLabel: isPublished ? 'Despublicar' : 'Publicar',
        updatedAtLabel: this.formatDateTime(r.updated_at),
        showCheckbox: s.selectionMode && s.recipeSelectionScope === 'site', showActions: !(s.selectionMode && s.recipeSelectionScope === 'site'), checkMark: selected ? '✓' : '', checkboxStyle: `width:24px;height:24px;border-radius:8px;border:2px solid var(--brand-700);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${selected ? 'var(--brand-700)' : 'transparent'};color:#F4F2F1;font-size:13px;font-weight:700`, rowStyle: `display:flex;align-items:center;gap:14px;background:${selected ? 'rgba(178,64,25,0.08)' : 'var(--neutral-0)'};border:1px solid ${selected ? 'var(--brand-500)' : 'var(--neutral-100)'};border-radius:var(--radius-md);padding:12px 16px;margin-bottom:10px;cursor:${s.selectionMode && s.recipeSelectionScope === 'site' ? 'pointer' : 'default'};user-select:none`, onPressStart: () => this.startScopedRecipeRowPress(r.id, 'site'), onPressEnd: this.endRowPress, onRowClick: () => { if (this.consumeSelectionClickSuppression()) return; if (this.state.selectionMode && this.state.recipeSelectionScope === 'site') this.toggleRecipeSelected(r.id); },
        onToggleStatus: () => this.onToggleSiteRecipeStatus(r), onEdit: () => this.onEditSiteRecipe(r),
        onDelete: () => this.askDeleteRecipeChecked(r.id),
      };
    }).filter(row => matchesSearch(row.name));
    const siteProductRows = s.siteProducts.map(p => { const selected = s.productSelectionScope === 'site' && s.selectedProductIds.includes(p.id); return ({
      id: p.id, name: p.name, code: p.product_code, categoryName: (p.category && p.category.name) || '', unit: p.unit, priceLabel: this.formatBRL(p.price), imagem: p.image_url || FALLBACK_IMG,
      source: 'admin_site', sourceLabel: 'Pública', sourceBadgeStyle: statusBadge('Pública', SOURCE_BADGE_COLORS.public),
      statusLabel: p.active ? 'Ativo' : 'Inativo', statusBadgeStyle: statusBadge('', p.active ? '#34B23E' : '#8A8580'),
      toggleActiveLabel: p.active ? 'Desativar' : 'Ativar',
      updatedAtLabel: this.formatDateTime(p.updated_at),
      showCheckbox: s.productSelectionMode && s.productSelectionScope === 'site', showActions: !(s.productSelectionMode && s.productSelectionScope === 'site'), checkMark: selected ? '✓' : '', checkboxStyle: `width:24px;height:24px;border-radius:8px;border:2px solid var(--brand-700);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${selected ? 'var(--brand-700)' : 'transparent'};color:#F4F2F1;font-size:13px;font-weight:700`, rowStyle: `display:flex;align-items:center;gap:14px;background:${selected ? 'rgba(178,64,25,0.08)' : 'var(--neutral-0)'};border:1px solid ${selected ? 'var(--brand-500)' : 'var(--neutral-100)'};border-radius:var(--radius-md);padding:12px 16px;margin-bottom:10px;cursor:${s.productSelectionMode && s.productSelectionScope === 'site' ? 'pointer' : 'default'};user-select:none`, onPressStart: () => this.startScopedProductRowPress(p.id, 'site'), onPressEnd: this.endProductRowPress, onRowClick: () => { if (this.consumeSelectionClickSuppression()) return; if (this.state.productSelectionMode && this.state.productSelectionScope === 'site') this.toggleProductSelected(p.id); },
      onToggleActive: () => this.onToggleSiteProductActive(p), onEdit: () => this.onEditSiteProduct(p),
      onDelete: () => this.askDeleteSiteProduct(p.id),
    }); }).filter(row => matchesSearch(row.name));
    const siteCategoryRows = s.siteCategories.map(c => ({
      id: c.id, name: c.name, code: c.category_code, typeLabel: myCategoryTypeLabel(c.type),
      source: 'admin_site', sourceLabel: 'Pública', sourceBadgeStyle: statusBadge('Pública', SOURCE_BADGE_COLORS.public),
      statusLabel: c.active ? 'Ativa' : 'Inativa', statusBadgeStyle: statusBadge('', c.active ? '#34B23E' : '#8A8580'),
      toggleActiveLabel: c.active ? 'Desativar' : 'Ativar',
      updatedAtLabel: this.formatDateTime(c.updated_at),
      onToggleActive: () => this.onToggleSiteCategoryActive(c), onEdit: () => this.onEditSiteCategory(c),
      onDelete: () => this.askDeleteSiteCategory(c.id), draggable: c.type === 'secao' || c.type === 'secao_produto', isDragging: s.homeSectionDragKey === c.id, onDragStart: () => this.onHomeSectionDragStart(c.id), onDragOver: this.onHomeSectionDragOver, onDrop: () => this.onHomeSectionDrop(c.id),
    })).filter(row => matchesSearch(row.name));
    const siteRecipeCategoryOptions = this.siteRecipeCategories().map(c => ({ value: c.id, label: c.name }));
    const siteProteinCategoryOptions = this.siteProteinCategories().map(c => ({ value: c.id, label: c.name }));
    const siteRecipeSectionRows = this.siteSectionCategories().map(c => ({
      key: c.id, label: c.name,
      checked: !!(s.siteRecipeForm && s.siteRecipeForm.sectionCategoryIds.includes(c.id)),
      onToggle: () => this.toggleSiteRecipeSection(c.id),
    }));
    const siteProductSectionRows = this.siteProductSectionCategories().map(c => ({
      key: c.id, label: c.name,
      checked: !!(s.siteProductForm && (s.siteProductForm.sectionCategoryIds || []).includes(c.id)),
      onToggle: () => this.toggleSiteProductSection(c.id),
    }));
    const siteProductOptionsForIngredients = s.siteProducts.map(p => ({ value: p.id, label: `${p.name} (${this.formatBRL(p.price)}/${p.unit})` }));
    const siteRecipeIngredientRows = s.siteRecipeForm ? s.siteRecipeForm.ingredients.map((row, idx) => {
      const rc = s.ingredientRemoveConfirm;
      const confirming = rc && rc.formKey === 'siteRecipeForm' && rc.idx === idx && rc.productId === row.productId ? rc : null;
      return {
        idx, productId: row.productId, quantity: row.quantity,
        onProductSet: (val) => this.onSiteRecipeIngredientChange(idx, 'productId', val),
        onQuantityChange: (e) => this.onSiteRecipeIngredientChange(idx, 'quantity', e.target.value),
        onRemove: () => this.askRemoveIngredient('siteRecipeForm', idx),
        confirming: !!confirming,
        confirmProductName: confirming ? confirming.productName : '',
        confirmDetailLabel: confirming ? `${this.formatQtd(confirming.quantity)} ${confirming.unit} · impacto no custo: ${confirming.costLabel}` : '',
        confirmUsageLabel: confirming
          ? (confirming.usageCount === null ? 'Verificando uso em outras receitas...' : confirming.usageCount > 0 ? `Este produto ainda é usado em ${confirming.usageCount} outra(s) receita(s).` : 'Este produto não é usado em nenhuma outra receita.')
          : '',
        onConfirmRemove: this.onConfirmRemoveIngredient, onCancelRemove: this.onCancelRemoveIngredient,
      };
    }) : [];
    const siteIngredientTotalCostLabel = this.formatBRL((s.siteRecipeForm ? s.siteRecipeForm.ingredients : []).reduce((sum, row) => {
      const p = s.siteProducts.find(pp => pp.id === row.productId);
      const q = parseFloat(String(row.quantity).replace(',', '.')) || 0;
      return sum + (p ? p.price * q : 0);
    }, 0));

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
    })).filter(row => matchesSearch(row.code, row.itemCode));

    const allRequestRows = filterRequests(s.allRequests).map(r => ({
      id: r.id, code: r.request_code, requesterName: r.requester_display_name_snapshot,
      entityLabel: requestEntityLabel(r.entity_type), actionLabel: requestActionLabel(r.action_type),
      itemCode: r.source_code || r.target_code || '', dateLabel: fmtDate(r.created_at),
      statusLabel: requestStatusLabel(r.status), statusBadgeStyle: statusBadge('', requestStatusColor(r.status)),
      revision: r.current_revision, canReview: ['submitted', 'resubmitted'].includes(r.status),
      onOpenDetail: () => this.onOpenRequestDetail(r.id),
    })).filter(row => matchesSearch(row.requesterName, row.code, row.itemCode));
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
        // "Abrir receita publicada": only offered when the target is an
        // actually-published (visible-on-Home/Search) recipe — an approval
        // made as "Aprovar como rascunho" gets a target_id/target_code too,
        // but that recipe never appears in `s.recipes` (loadPublicCatalog
        // only ever loads scope='site' status='published' rows), so this
        // never renders a dead link for a draft-only approval.
        canOpenTargetRecipe: selectedRequestRow.entity_type === 'recipe' && !!selectedRequestRow.target_id && s.recipes.some(r => r.id === selectedRequestRow.target_id),
        onOpenTargetRecipe: () => this.selectRecipe(selectedRequestRow.target_id),
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
          onRowClick: () => { if (this.consumeSelectionClickSuppression()) return; if (this.state.saleSelectionMode) this.toggleSaleSelected(v.id); },
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
      isHome: s.dataLoaded && screen === 'home', isInicio: s.dataLoaded && screen === 'inicio', isProducts: s.dataLoaded && screen === 'products', isSearch: s.dataLoaded && screen === 'search', isFavorites: s.dataLoaded && screen === 'favorites', isDados: s.dataLoaded && screen === 'dados', isProfile: s.dataLoaded && screen === 'profile', isDetail: s.dataLoaded && screen === 'detail', isAdmin: s.dataLoaded && screen === 'admin', isSalesHistory: s.dataLoaded && screen === 'salesHistory',
      hasSelectedRecipe: !!selectedRecipe,
      deviceMode, isCompact, isWide, navRailWidth, frameMaxWidth, frameMaxHeight, stagePadLeft, stagePadRight, scrollBottomPad, navRailSideStyle, navRailBorderStyle,
      detailPadX: isWide ? 92 : 40, detailTitleInset: isWide ? 92 : 32,
      showBottomTabBar: (screen === 'inicio' || screen === 'home' || screen === 'products' || screen === 'search' || screen === 'favorites' || screen === 'dados' || screen === 'profile') && isCompact,
      showSideNavRail: (screen === 'inicio' || screen === 'home' || screen === 'products' || screen === 'search' || screen === 'favorites' || screen === 'dados' || screen === 'profile') && isWide,
      goInicio: this.goInicio, goHome: this.goHome, goProducts: this.goProducts, goSearch: this.goSearch, goFavorites: this.goFavorites, goDados: this.goDados, goProfile: this.goProfile,
      navInicioColor: screen === 'inicio' ? 'var(--brand-700)' : 'var(--neutral-400)',
      navHomeColor: screen === 'home' ? 'var(--brand-700)' : 'var(--neutral-400)',
      navProductsColor: screen === 'products' ? 'var(--brand-700)' : 'var(--neutral-400)',
      navSearchColor: screen === 'search' ? 'var(--brand-700)' : 'var(--neutral-400)',
      navFavColor: screen === 'favorites' ? 'var(--brand-700)' : 'var(--neutral-400)',
      navDadosColor: screen === 'dados' ? 'var(--brand-700)' : 'var(--neutral-400)',
      navProfileColor: screen === 'profile' ? 'var(--brand-700)' : 'var(--neutral-400)',
      showSplash: s.showSplash, onSplashContinue: this.onSplashContinue, splashButtonLabel: s.profile ? 'Bem-vindo de volta' : 'Criar meu perfil',
      userGreetingName, profileInitial,
      heroRecipes, heroDots, heroHasMultiple, onHeroPrev, onHeroNext, onHeroScroll: this.onHeroScroll,
      homeSectionBlocks, homeCategoryChips, homeCategoriesEmpty,
      searchQuery: s.searchQuery, onSearchChange: this.onSearchChange, categoryChips, filteredSearchResults, searchResultsEmpty: filteredSearchResults.length === 0,
      onInicioSearchSubmit: this.onInicioSearchSubmit,
      favoritesList, favoritesEmpty: favoritesList.length === 0,
      // Produtos page + Início aggregator
      productHomeSectionBlocks, productCategoryChips, productPageBlocks, inicioProductBlock,
      productsEmpty: s.products.length === 0,
      showProductDetailModal: !!s.selectedProductId && !!selectedProduct, productDetailData: selectedProduct || { nome: '', categoria: '', unidade: '', precoLabel: '', imagem: FALLBACK_IMG, relatedRecipes: [] },
      onOpenProductDetail: (id) => this.openProductDetail(id), onCloseProductDetail: this.closeProductDetail,
      // "Seções de Produtos" click-to-add-products picker (#1).
      showProductSectionPicker: !!s.productSectionPickerKey, productSectionPickerLabel, productSectionPickerRows,
      productSectionPickerQuery: s.productSectionPickerQuery, onProductSectionPickerSearchChange: this.onProductSectionPickerSearchChange,
      onCloseProductSectionPicker: this.closeProductSectionPicker,
      // Admin search bar shared across the 9 "Modo de Criação" tabs (#2).
      adminSearchQuery: s.adminSearchQuery, onAdminSearchChange: this.onAdminSearchChange,
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
      onSetAdminTabSharedRecipes: this.setAdminTabSharedRecipes, onSetAdminTabMyRequests: this.setAdminTabMyRequests, onSetAdminTabRequestsInbox: this.setAdminTabRequestsInbox,
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
      hasSiteRecipeRows: siteRecipeRows.length > 0, hasSiteProductRows: siteProductRows.length > 0, hasSiteCategoryRows: siteCategoryRows.length > 0, homeSectionOrderBusy: s.homeSectionOrderBusy,
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
      siteRecipeCategoryOptions, siteRecipeSectionRows, siteRecipeIngredientRows, siteProductOptionsForIngredients, siteIngredientTotalCostLabel,
      onAddSiteRecipeIngredient: this.addSiteRecipeIngredient, onCancelSiteRecipeForm: this.onCancelSiteRecipeForm, onSaveSiteRecipeForm: this.onSaveSiteRecipeForm,
      showSiteProductForm: s.showSiteProductForm, siteProductFormTitle: s.siteProductFormMode === 'new' ? 'Novo Produto do Catálogo' : 'Editar Produto do Catálogo', siteProductForm: s.siteProductForm || {},
      siteProductFormOnName: this.siteProductFormField('name'), siteProductFormOnCategorySet: this.setFormField('siteProductForm', 'categoryId'),
      siteProductFormOnUnitSet: this.setFormField('siteProductForm', 'unit'), siteProductFormOnPrice: this.siteProductFormField('price'), siteProductFormOnActive: this.toggleSiteProductFormActive,
      siteProductFormOnImageUrl: this.siteProductFormField('imageUrl'),
      siteProteinCategoryOptions, siteProductSectionRows, unidadeOptionsSite: this.unidades,
      onCancelSiteProductForm: this.onCancelSiteProductForm, onSaveSiteProductForm: this.onSaveSiteProductForm,
      showSiteCategoryForm: s.showSiteCategoryForm, siteCategoryFormTitle: s.siteCategoryFormMode === 'new' ? 'Nova Categoria do Catálogo' : 'Editar Categoria do Catálogo', siteCategoryForm: s.siteCategoryForm || {},
      siteCategoryFormOnName: this.siteCategoryFormField('name'), siteCategoryFormOnTypeSet: this.setFormField('siteCategoryForm', 'type'), siteCategoryFormOnActive: this.toggleSiteCategoryFormActive,
      siteCategoryTypeOptions: [{ value: 'receita', label: 'Receita' }, { value: 'secao', label: 'Seção' }, { value: 'secao_produto', label: 'Seção de Produto' }, { value: 'proteina', label: 'Proteína/Produto' }],
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
      sharedLibraryLoading: s.sharedLibraryLoading, hasSharedLibraryError: !!s.sharedLibraryError, sharedLibraryError: s.sharedLibraryError,
      onRetrySharedLibrary: this.onRetrySharedLibrary,
      onNewMyRecipe: this.onNewMyRecipe, onNewMyProduct: this.onNewMyProduct, onNewMyCategory: this.onNewMyCategory,
      // Minha receita: form modal
      showMyRecipeForm: s.showMyRecipeForm, myRecipeFormTitle: s.myRecipeFormMode === 'new' ? 'Nova Receita' : 'Editar Receita', myRecipeForm: s.myRecipeForm || {},
      hasMyFormError: !!s.myFormError, myFormError: s.myFormError,
      myRecipeFormOnName: this.myRecipeFormField('name'), myRecipeFormOnCategorySet: this.setFormField('myRecipeForm', 'categoryId'),
      myRecipeFormOnDifficultySet: this.setFormField('myRecipeForm', 'difficulty'), myRecipeFormOnPrepTime: this.myRecipeFormField('prepTime'),
      myRecipeFormOnServings: this.myRecipeFormField('servings'), myRecipeFormOnImageUrl: this.myRecipeFormField('imageUrl'),
      myRecipeFormOnExtras: this.myRecipeFormField('extrasText'), myRecipeFormOnInstructions: this.myRecipeFormField('instructionsText'), myRecipeFormOnTips: this.myRecipeFormField('tipsText'),
      myRecipeCategoryOptions, myRecipeSectionRows, myRecipeIngredientRows, myProductOptionsForIngredients, myIngredientTotalCostLabel,
      onAddMyRecipeIngredient: this.addMyRecipeIngredient, onCancelMyRecipeForm: this.onCancelMyRecipeForm, onSaveMyRecipeForm: this.onSaveMyRecipeForm,
      dificuldadeOptionsMy: this.dificuldades,
      // Meu produto: form modal
      showMyProductForm: s.showMyProductForm, myProductFormTitle: s.myProductFormMode === 'new' ? 'Novo Produto' : 'Editar Produto', myProductForm: s.myProductForm || {},
      myProductFormOnName: this.myProductFormField('name'), myProductFormOnCategorySet: this.setFormField('myProductForm', 'categoryId'),
      myProductFormOnUnitSet: this.setFormField('myProductForm', 'unit'), myProductFormOnPrice: this.myProductFormField('price'),
      myProductFormOnImageUrl: this.myProductFormField('imageUrl'),
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
      shareCopyConfirmed: s.shareCopyConfirmed, shareRevokeConfirming: s.shareRevokeConfirming,
      onActivateSharing: this.onActivateSharing, onRegenerateShareCode: this.onRegenerateShareCode, onDeactivateSharing: this.onDeactivateSharing,
      onRevokeAllAccess: this.onRevokeAllAccess, onCopyShareCode: this.onCopyShareCode,
      onAskRevokeAllAccess: this.onAskRevokeAllAccess, onCancelRevokeAllAccess: this.onCancelRevokeAllAccess,
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
      newSectionIcon: s.newSectionIcon, onPickSectionIcon: this.onPickSectionIcon,
      productSectionToggleRows, newProductSectionLabel: s.newProductSectionLabel, onNewProductSectionLabelChange: this.onNewProductSectionLabelChange, onAddProductSection: this.addProductSection,
      newProductSectionIcon: s.newProductSectionIcon, onPickProductSectionIcon: this.onPickProductSectionIcon,
      productSectionSelectionMode: s.productSectionSelectionMode, selectedProductSectionCountLabel: `${s.selectedProductSectionKeys.length} selecionada(s)`, onBulkDeleteProductSectionsAsk: this.askBulkDeleteProductSections, onCancelProductSectionSelection: this.onCancelProductSectionSelection,
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
      referencesModalOpen: !!s.deleteImpact && s.deleteImpactKind === 'recipe',
      referencesModal: (s.deleteImpact && s.deleteImpactKind === 'recipe') ? {
        recipeName: s.deleteImpact.name, recipeCode: s.deleteImpact.recipe_code,
        recommendArchive: !!s.deleteImpact.recommend_archive,
        // Only a scope='site' recipe ever gets the explicit Arquivar/
        // Excluir permanentemente choice — a personal recipe has no
        // archived status to choose (see askDeleteRecipeChecked).
        showActionChoice: s.deleteImpact.scope === 'site',
        recipeAction: s.deleteResolutions.recipeAction || 'archive',
        onSetRecipeAction: this.onSetRecipeDeleteAction,
        rows: [
          s.deleteImpact.active_share ? {
            key: 'share', type: 'Compartilhamento ativo', quantity: 1,
            consequence: 'O código YSH continuará existindo e concedendo acesso somente leitura enquanto não for revogado.',
            action: 'Revogar todos os compartilhamentos e acessos concedidos antes de excluir.',
            resolved: s.deleteResolutions.revokeShares, onToggleResolve: this.onToggleResolveRevokeShares,
          } : null,
          s.deleteImpact.active_grant_count > 0 ? {
            key: 'grants', type: 'Acessos concedidos', quantity: s.deleteImpact.active_grant_count,
            consequence: `${s.deleteImpact.active_grant_count} pessoa(s) com acesso somente leitura perderão o acesso a esta receita.`,
            action: 'Incluído ao revogar os compartilhamentos acima.',
            resolved: s.deleteResolutions.revokeShares, onToggleResolve: null,
          } : null,
          s.deleteImpact.pending_request_count > 0 ? {
            key: 'requests', type: 'Solicitações de publicação pendentes', quantity: s.deleteImpact.pending_request_count,
            consequence: `${s.deleteImpact.pending_request_count} solicitação(ões) pendente(s) (${(s.deleteImpact.pending_request_codes || []).join(', ')}) ficariam sem a receita de origem.`,
            action: 'Cancelar as solicitações pendentes antes de excluir.',
            resolved: s.deleteResolutions.cancelPendingRequests, onToggleResolve: this.onToggleResolveCancelRequests,
          } : null,
        ].filter(Boolean),
        onConfirm: this.onConfirmDeleteFromReferences, onCancel: this.onCloseReferencesModal, busy: s.deleteBusy,
        canConfirm: (!s.deleteImpact.active_share || s.deleteResolutions.revokeShares) && (!(s.deleteImpact.pending_request_count > 0) || s.deleteResolutions.cancelPendingRequests),
      } : null,
      deleteImpactKind: s.deleteImpactKind,
      // "Referências a resolver" for a product — every live recipe_ingredients
      // row the caller can see (own personal recipes, or any site recipe if
      // admin) needs an explicit "Substituir"/"Remover" choice before the
      // confirm button enables. Rows the caller can't see at all (another
      // user's personal recipe using a shared site product) are called out
      // separately via foreignNote, never listed — there's nothing to pick
      // for them here.
      productReferencesModal: (s.deleteImpactKind === 'product' && s.deleteImpact) ? (() => {
        const impact = s.deleteImpact;
        const replacementOptions = (impact.scope === 'site' ? s.siteProducts : [...s.myProducts, ...s.pickerPublicProducts])
          .filter(p => p.id !== impact.product_id).map(p => ({ value: p.id, label: `${p.name} (${p.product_code})` }));
        const rows = (s.deleteRows || []).map(row => {
          const res = s.productResolutions[row.id] || { action: '', replacementProductId: '' };
          return {
            key: row.id,
            recipeName: row.recipe ? `${row.recipe.name} (${row.recipe.recipe_code})` : 'Receita',
            quantity: row.quantity,
            action: res.action, replacementProductId: res.replacementProductId, replacementOptions,
            onSetAction: (action) => this.onSetProductResolutionAction(row.id, action),
            onSetReplacement: (id) => this.onSetProductResolutionReplacement(row.id, id),
          };
        });
        const canConfirm = rows.every(r => r.action === 'remove' || (r.action === 'replace' && r.replacementProductId));
        return {
          name: impact.name, code: impact.product_code, rows,
          pendingRequestCount: impact.pending_request_count, pendingRequestCodes: impact.pending_request_codes || [],
          foreignNote: impact.foreign_personal_recipe_count > 0
            ? `${impact.foreign_personal_recipe_count} receita(s) pessoal(is) de outro(s) usuário(s) também usam este produto. Elas não podem ser resolvidas por aqui — a exclusão ficará bloqueada até que o próprio dono deixe de usá-lo.`
            : '',
          onConfirm: this.onConfirmProductDeleteFromReferences, onCancel: this.onCloseReferencesModal, busy: s.deleteBusy, canConfirm,
        };
      })() : null,
      // "Referências a resolver" for a category — products.category_id and
      // recipes.category_id are NOT NULL, so every row needs a replacement
      // category of the same type (never just "remove"); recipe_categories
      // rows (section tags) may instead be removed outright.
      categoryReferencesModal: (s.deleteImpactKind === 'category' && s.deleteImpact) ? (() => {
        const impact = s.deleteImpact;
        const isSite = impact.scope === 'site';
        const byType = (t) => (isSite ? s.siteCategories : s.creationCategories)
          .filter(c => c.type === t && c.id !== impact.category_id).map(c => ({ value: c.id, label: c.name }));
        const productOptions = byType('proteina'), recipeOptions = byType('receita'), sectionOptions = byType('secao'), productSectionOptions = byType('secao_produto');
        const productRows = (s.deleteCategoryRows.products || []).map(p => ({
          key: p.id, label: `${p.name} (${p.product_code})`,
          replacementCategoryId: s.categoryResolutions.products[p.id] || '', options: productOptions,
          onSetReplacement: (id) => this.onSetCategoryProductReplacement(p.id, id),
        }));
        const recipeRows = (s.deleteCategoryRows.recipes || []).map(r => ({
          key: r.id, label: `${r.name} (${r.recipe_code})`,
          replacementCategoryId: s.categoryResolutions.recipes[r.id] || '', options: recipeOptions,
          onSetReplacement: (id) => this.onSetCategoryRecipeReplacement(r.id, id),
        }));
        const sectionRows = (s.deleteCategoryRows.sections || []).map(sec => {
          const res = s.categoryResolutions.sections[sec.recipe_id] || { action: '', replacementCategoryId: '' };
          return {
            key: sec.recipe_id, label: `${sec.recipe.name} (${sec.recipe.recipe_code})`,
            action: res.action, replacementCategoryId: res.replacementCategoryId, options: sectionOptions,
            onSetAction: (action) => this.onSetCategorySectionAction(sec.recipe_id, action),
            onSetReplacement: (id) => this.onSetCategorySectionReplacement(sec.recipe_id, id),
          };
        });
        const productSectionRows = (s.deleteCategoryRows.productSections || []).map(sec => {
          const res = s.categoryResolutions.productSections[sec.product_id] || { action: '', replacementCategoryId: '' };
          return {
            key: sec.product_id, label: `${sec.product.name} (${sec.product.product_code})`,
            action: res.action, replacementCategoryId: res.replacementCategoryId, options: productSectionOptions,
            onSetAction: (action) => this.onSetCategoryProductSectionAction(sec.product_id, action),
            onSetReplacement: (id) => this.onSetCategoryProductSectionReplacement(sec.product_id, id),
          };
        });
        const canConfirm = productRows.every(r => r.replacementCategoryId) && recipeRows.every(r => r.replacementCategoryId)
          && sectionRows.every(r => r.action === 'remove' || (r.action === 'replace' && r.replacementCategoryId))
          && productSectionRows.every(r => r.action === 'remove' || (r.action === 'replace' && r.replacementCategoryId));
        return {
          name: impact.name, code: impact.category_code, productRows, recipeRows, sectionRows, productSectionRows,
          pendingRequestCount: impact.pending_request_count, pendingRequestCodes: impact.pending_request_codes || [],
          foreignNote: impact.foreign_personal_ref_count > 0
            ? `${impact.foreign_personal_ref_count} item(ns) pessoal(is) de outro(s) usuário(s) também usam esta categoria. Eles não podem ser resolvidos por aqui — a exclusão ficará bloqueada até que o próprio dono deixe de usá-la.`
            : '',
          onConfirm: this.onConfirmCategoryDeleteFromReferences, onCancel: this.onCloseReferencesModal, busy: s.deleteBusy, canConfirm,
        };
      })() : null,
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
      productFormOnImagem: this.productFormField('imagem'), onRandomProductImage: this.onRandomProductImage, productFormTagRows,
      categoriaProdutoOptions: s.productCategories.filter(c => c.enabled).map(c => c.label), unidadeOptions: this.unidades,
      onCancelProductForm: this.onCancelProductForm, onSaveProductForm: this.onSaveProductForm,
      showImportModal: s.showImportModal, onOpenImportModal: this.onOpenImportModal, onCloseImportModal: this.onCloseImportModal, onBackToInstructions: this.onBackToInstructions, onNewImport: this.onNewImport,
      importStepInstructions: s.importStep === 'instructions', importStepResult: s.importStep === 'result',
      onDownloadTemplate: this.onDownloadTemplate, onImportFileChange: this.onImportFileChange, importSummary: s.importSummary, importBusy: s.importBusy, importResult: s.importResult, importFileInputKey: s.importFileInputKey,
      importParseError: s.importParseError, hasImportParseError: !!s.importParseError,
      importFileName: s.importFileName, importCategoriesCount: s.importParsedCategories.length, importProductsCount: s.importParsedProducts.length, importRecipesCount: s.importParsedRecipes.length,
      importErrors: s.importErrors, hasImportErrors: s.importErrors.length > 0,
      importWarnings: s.importWarnings, hasImportWarnings: s.importWarnings.length > 0,
      importCanProceed: s.importStep === 'result' && s.importErrors.length === 0 && (s.importParsedCategories.length + s.importParsedProducts.length + s.importParsedRecipes.length) > 0,
      importModes: s.importModes,
      onSetImportMode: this.onSetImportMode,
      categoriasProdutoList: s.productCategories.filter(c => c.enabled).map(c => c.label).join(', '), categoriasReceitaList: CATEGORIAS_RECEITA.join(', '),
      adminFlash: s.adminFlash, hasAdminFlash: !!s.adminFlash,
    };
  }

  render(props, state) {
    return renderApp(this);
  }
}

// Template is defined in template.js to keep this file focused on state/logic.
import { renderApp } from './template.js?v=20260810-1';

const mountEl = document.getElementById('app');
render(html`<${App} />`, mountEl);
