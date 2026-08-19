export function toggleSelected(ids, id) {
  return ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];
}

export function parseBRLPrice(value) {
  const normalized = String(value ?? '').trim().replace(/\s/g, '').replace(/^R\$/i, '').replace(/\./g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return { error: 'Informe um preço válido com até duas casas decimais.' };
  const price = Number(normalized);
  if (!Number.isFinite(price) || price < 0 || price > 99999999.99) return { error: 'Informe um preço válido.' };
  return { value: Math.round(price * 100) / 100 };
}

export function priceEditPolicy(product) {
  if (product?.swift_product_url || product?.price_source === 'SWIFT') {
    return { editable: false, reason: 'Preço sincronizado pela Swift; atualize-o pela integração.' };
  }
  return { editable: true, reason: '' };
}

export function summarizeBulkResults(results, noun) {
  const failed = results.filter(result => result?.error);
  const succeeded = results.length - failed.length;
  if (!failed.length) return { ok: true, message: `${succeeded} ${noun}(s) atualizado(s) com sucesso.` };
  if (!succeeded) return { ok: false, message: `Nenhum ${noun} pôde ser atualizado.` };
  return { ok: false, partial: true, message: `${succeeded} ${noun}(s) atualizado(s); ${failed.length} falharam.` };
}
