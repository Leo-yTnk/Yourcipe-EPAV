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
};

function inferCode(message, status, providerCode) {
  if (providerCode === 'service_misconfigured' || status === 503) return 'service_misconfigured';
  if (providerCode === 'forbidden' || status === 403) return 'forbidden';
  if (providerCode === 'unauthorized' || status === 401) return 'unauthorized';
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
    return { status, providerCode: payload?.code || payload?.error, providerMessage: payload?.message };
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
    retryable: code === 'network_error' || code === 'swift_unavailable' || (status >= 500 && status !== 503),
    technical: {
      message: technicalMessage,
      providerCode: diagnostic.providerCode,
      providerMessage: diagnostic.providerMessage,
      original: error,
    },
  };
}
