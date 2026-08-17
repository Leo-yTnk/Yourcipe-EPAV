const HTTP_URL_PATTERN = /^https?:\/\/[^\s]+$/i;

export const INPUT_LIMITS = Object.freeze({
  name: 120,
  imageUrl: 2048,
});

export function validateName(value, label = 'nome') {
  const normalized = String(value || '').trim();
  if (!normalized) return `Informe o ${label}.`;
  if (normalized.length > INPUT_LIMITS.name) return `O ${label} deve ter no máximo ${INPUT_LIMITS.name} caracteres.`;
  return '';
}

export function validateOptionalHttpUrl(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (normalized.length > INPUT_LIMITS.imageUrl || !HTTP_URL_PATTERN.test(normalized)) {
    return 'Informe uma URL de imagem HTTP ou HTTPS válida.';
  }
  return '';
}

export function parseNonNegativePrice(value) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!normalized) return { error: 'Informe um preço válido.' };
  const price = Number(normalized);
  if (!Number.isFinite(price) || price < 0) return { error: 'Informe um preço válido.' };
  return { value: price };
}
