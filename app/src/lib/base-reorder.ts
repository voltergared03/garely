/**
 * Base engine — drag-to-reorder helper (rows & fields).
 *
 * Both `Field` and `Row` carry an integer `position`. Reordering permutes a
 * SUBSET of items (the ones the client sent, in their new order) WITHIN the
 * position-slots that subset already occupies — every item NOT in the list keeps
 * its position untouched. This makes reorder:
 *   • pagination-safe — reordering a loaded page never disturbs unloaded rows;
 *   • collision-free  — the new positions are drawn only from the listed items,
 *     so they can't clash with anything outside the subset;
 *   • filter-safe     — reordering the visible (filtered) subset only shuffles
 *     those rows among the slots they held.
 *
 * Returns only the items whose position actually changed (minimal writes).
 */
export type Positioned = { id: string; position: number };

export function computeReorder(current: Positioned[], order: string[]): Positioned[] {
  const byId = new Map(current.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const desired: Positioned[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (item && !seen.has(id)) {
      seen.add(id);
      desired.push(item);
    }
  }
  if (desired.length < 2) return []; // 0 or 1 known item → no meaningful reorder
  const slots = desired.map((d) => d.position).sort((a, b) => a - b);
  const updates: Positioned[] = [];
  desired.forEach((item, i) => {
    if (item.position !== slots[i]) updates.push({ id: item.id, position: slots[i] });
  });
  return updates;
}
