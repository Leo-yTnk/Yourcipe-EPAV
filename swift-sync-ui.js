// Converts supabase-js Edge Function failures into actionable UI errors while
// retaining the original diagnostic (including the HTTP response) for logs.
const FRIENDLY_BY_CODE = {
  function_not_found: 'O sincronizador de preços não está implantado neste projeto.',
  network_error: 'Não foi possível conectar ao serviço de preços. Verifique a rede ou o bloqueio CORS.',
  session_expired: 'Sua sessão expirou. Entre novamente para atualizar preços.',
  unauthorized: 'Sua sessão não é válida. Entre novamente.',
  forbidden: 'Somente administradores podem atualizar preços.',
  service_misconfigured: 'O serviço de preços está sem uma configuração obrigatória. Contate o administrador.',
  swift_unavailable: 'A Swift está temporariamente indisponível. Tente novamente mais tarde.',
  invalid_swift_page: 'A página cadastrada na Swift é inválida ou não corresponde ao produto.',
  price_not_found: 'Não foi possível encontrar um preço válido na página da Swift.',
  sync_internal_error: 'O sincronizador encontrou um erro interno.',
  product_not_found: 'O produto foi removido ou está inativo.',
  sync_already_running: 'Já existe uma sincronização em andamento.',
  sync_batch_in_progress: 'Outro lote de preços está realmente em andamento.',
  sync_request_in_progress: 'Esta mesma solicitação ainda está sendo processada.',
  sync_request_already_completed: 'Esta solicitação já foi processada e não será executada novamente.',
};

function inferCode(message, status, providerCode) {
  if (providerCode === 'service_misconfigured' || status === 503) return 'service_misconfigured';
  if (providerCode === 'forbidden' || status === 403) return 'forbidden';
  if (providerCode === 'unauthorized' || status === 401) return 'unauthorized';
  if (providerCode === 'product_not_found') return 'product_not_found';
  if (['sync_batch_in_progress', 'sync_request_in_progress', 'sync_request_already_completed'].includes(providerCode)) return providerCode;
  if (providerCode === 'sync_already_running' || status === 409) return 'sync_already_running';
  if (status === 404) return 'function_not_found';
  if (/failed to send a request|fetch failed|networkerror|cors/i.test(message)) return 'network_error';
  if (/swift_(?:unavailable|http_429|http_5\d\d)|abort/i.test(providerCode || message)) return 'swift_unavailable';
  if (/price_not_found|invalid_price/i.test(providerCode || message)) return 'price_not_found';
  if (/invalid|mismatch|redirect|swift_http_4/i.test(providerCode || message)) return 'invalid_swift_page';
  return 'sync_internal_error';
}

async function readHttpDiagnostic(error) {
  const response = error?.context;
  if (!response || typeof response.clone !== 'function') return {};
  const status = response.status;
  try {
    const payload = await response.clone().json();
    return { status, providerCode: payload?.code || payload?.error, providerMessage: payload?.message,
      runId: payload?.run_id, correlationId: payload?.correlation_id, payload };
  } catch {
    return { status };
  }
}

export async function normalizeSwiftSyncError(error) {
  const technicalMessage = String(error?.message || error || 'erro desconhecido');
  const diagnostic = await readHttpDiagnostic(error);
  const status = diagnostic.status || error?.status;
  const code = error?.code === 'session_expired'
    ? 'session_expired'
    : inferCode(technicalMessage, status, diagnostic.providerCode);
  return {
    name: 'SwiftSyncError',
    code,
    status,
    message: FRIENDLY_BY_CODE[code],
    retryable: !status && code === 'network_error',
    runId: diagnostic.runId, correlationId: diagnostic.correlationId,
    metrics: diagnostic.payload && {
      products_synced: diagnostic.payload.products_synced,
      products_updated: diagnostic.payload.products_updated,
      products_unchanged: diagnostic.payload.products_unchanged,
      products_failed: diagnostic.payload.products_failed,
      products_stale: diagnostic.payload.products_stale,
      duration_ms: diagnostic.payload.duration_ms,
    },
    failures: Array.isArray(diagnostic.payload?.failures) ? diagnostic.payload.failures : [],
    technical: {
      message: technicalMessage,
      providerCode: diagnostic.providerCode,
      providerMessage: diagnostic.providerMessage,
      original: error,
    },
  };
}

const count = (value) => Number.isFinite(value) ? value : 0;

// Creates a stable, user-facing audit trail for the expandable sync result.
// It intentionally describes stages that did not run as well as successful
// ones, so "Ver detalhes" never hides where execution stopped.
export function buildSwiftSyncReport(result, { catalogReloaded = true } = {}) {
  const error = result?.error || null;
  const data = result?.data || error?.metrics || {};
  const failures = result?.data?.failures || error?.failures || [];
  const reachedService = !['session_expired', 'network_error', 'function_not_found'].includes(error?.code);
  const runStarted = !!(data.run_id || error?.runId);
  const synced = count(data.products_synced);
  const failed = count(data.products_failed);
  const updated = count(data.products_updated);
  const unchanged = count(data.products_unchanged);
  const steps = [
    { label: 'Validar sessão de administrador', status: error?.code === 'session_expired' ? 'error' : 'success', detail: error?.code === 'session_expired' ? error.message : 'Sessão válida para iniciar a atualização.' },
    { label: 'Conectar ao serviço de preços', status: reachedService ? 'success' : 'error', detail: reachedService ? 'O serviço recebeu e processou a solicitação.' : (error?.message || 'Não foi possível acessar o serviço.') },
    { label: 'Iniciar execução da sincronização', status: runStarted ? 'success' : (reachedService ? 'error' : 'skipped'), detail: runStarted ? `Execução ${data.run_id || error.runId} iniciada${(data.correlation_id || error?.correlationId) ? ` · referência ${data.correlation_id || error.correlationId}` : ''}.` : (reachedService ? 'A execução não chegou a ser iniciada.' : 'Etapa não executada porque a conexão falhou.') },
    { label: 'Consultar páginas de produtos na Swift', status: runStarted ? (failed && !synced ? 'error' : (failed ? 'warning' : 'success')) : 'skipped', detail: runStarted ? `${synced} produto(s) consultado(s); ${failed} falha(s).` : 'Etapa não executada.' },
    { label: 'Validar e gravar os preços', status: runStarted ? (failed ? (updated || unchanged ? 'warning' : 'error') : 'success') : 'skipped', detail: runStarted ? `${updated} preço(s) alterado(s), ${unchanged} confirmado(s) sem alteração e ${failed} não atualizado(s).` : 'Etapa não executada.' },
    { label: 'Recarregar o catálogo', status: catalogReloaded ? 'success' : 'error', detail: catalogReloaded ? 'O catálogo foi recarregado com os resultados disponíveis.' : 'Não foi possível recarregar o catálogo após a sincronização.' },
  ];
  return {
    title: error ? (error.code === 'partial_sync' ? 'Atualização concluída com falhas' : 'Não foi possível atualizar os preços') : 'Preços atualizados com sucesso',
    summary: error?.message || `${synced} produto(s) consultado(s), sem falhas.`,
    kind: error ? 'error' : 'success',
    steps,
    failures: failures.map(item => ({
      product: item.product_name || item.product_id || 'Produto não identificado',
      code: item.code || 'erro desconhecido',
    })),
  };
}
