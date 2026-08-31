const LINK_CONTRACT = Object.freeze({
  receita: Object.freeze({ spreadsheetKey: 'receita', serverKey: 'recipe' }),
  produto: Object.freeze({ spreadsheetKey: 'produto', serverKey: 'product' }),
});

// This is the only translation boundary between the Portuguese workbook and
// the English JSON contract consumed by admin_import_public_catalog.
export function parseCatalogSectionLinkRow(row, kind, { get, normalizeText }, sourceLine) {
  const contract = LINK_CONTRACT[kind];
  if (!contract) throw new TypeError(`Unsupported catalog section link kind: ${kind}`);

  return {
    page: normalizeText(get(row, ['pagina'])),
    section: String(get(row, ['secao', 'seção'])).trim(),
    [contract.serverKey]: String(get(row, [contract.spreadsheetKey])).trim(),
    sort_order: Number(get(row, ['ordem'])),
    source_line: sourceLine,
  };
}

