export function moveById(rows, sourceId, targetId) {
  const from = rows.findIndex(row => row.id === sourceId);
  const to = rows.findIndex(row => row.id === targetId);
  if (from < 0 || to < 0 || from === to) return rows;
  const next = rows.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
