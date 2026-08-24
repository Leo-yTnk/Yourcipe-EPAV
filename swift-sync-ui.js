// Browser-facing translation for transport failures from supabase-js.
export function normalizeSwiftSyncError(error) {
  const message = String(error?.message || error || 'erro desconhecido');
  if (/failed to send a request to the edge function/i.test(message) || /fetch failed/i.test(message)) {
    return { ...error, message: 'Serviço de preços indisponível. Verifique se a função swift-price-sync está implantada e tente novamente.' };
  }
  return error instanceof Error ? error : { ...error, message };
}
