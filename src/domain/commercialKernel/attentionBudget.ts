/** Session-only review choices. This does not schedule work or change ranking. */
export function allocateAttention<T extends {id: string}>(ranked: readonly T[], capacity: number, selectedIds: readonly string[]) {
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 20) throw new Error('Choose between 0 and 20 items.');
  const unique = [...new Map(ranked.map(item => [item.id, item])).values()];
  const selected = new Set(selectedIds);
  const chosen = unique.filter(item => selected.has(item.id));
  const remaining = unique.filter(item => !selected.has(item.id));
  const available = Math.max(0, capacity - chosen.length);
  return {capacity, chosen, suggested: remaining.slice(0, available), outside: remaining.slice(available),
    overCapacity: Math.max(0, chosen.length - capacity),
    unavailableIds: [...selected].filter(id => !unique.some(item => item.id === id))};
}
