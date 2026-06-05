import { cellText } from "../database/lib/cell-format";
import type { FieldT, OrgMember } from "../database/lib/types";

/**
 * Pure helpers for CUSTOM task fields on the board (P3.3). No JSX / no I/O, so
 * the security-relevant rules (never surface a totp/password value on the board)
 * are unit-testable in plain node.
 */

/* Custom task-field types rendered + edited inline via the engine FieldCell.
   file / totp / password / link are deferred (their cells need base-scoped
   upload/reveal/relation endpoints), so they stay read-only for now — and are
   NEVER chipped onto the board. */
export const EDITABLE_CUSTOM_TYPES = new Set<string>([
  "text", "longText", "number", "currency", "percent", "rating",
  "singleSelect", "multiSelect", "date", "person", "checkbox", "url", "email", "phone",
]);

/* The 6 built-in task fields, by their pinned canonical (English) names from
   system-tasks.fields.json. The board renders these with its own controls, so
   they're filtered out of the engine-rendered CUSTOM-field list. */
export const SYSTEM_FIELD_NAMES = new Set<string>([
  "Title", "Description", "Status", "Priority", "Due date", "Assignee",
]);

/** Engine fields minus the 6 built-in system fields = the user's custom fields. */
export function customTaskFields(fields: FieldT[]): FieldT[] {
  return fields.filter((f) => !SYSTEM_FIELD_NAMES.has(f.name));
}

/**
 * The non-empty CUSTOM-field values to chip on a board row/card. Only
 * editable-typed fields are shown — NEVER totp/password/file/link — so a live
 * TOTP code (or any secret) can't surface on the board. Capped at `max`.
 */
export function chipsForRow(
  fields: FieldT[],
  cells: Record<string, unknown> | undefined,
  members: OrgMember[],
  max = 3,
): { name: string; text: string }[] {
  if (!fields.length || !cells) return [];
  const out: { name: string; text: string }[] = [];
  for (const f of fields) {
    if (out.length >= max) break;
    if (!EDITABLE_CUSTOM_TYPES.has(f.type)) continue;
    const text = cellText(f, cells[f.id], members);
    if (text && text.trim()) out.push({ name: f.name, text });
  }
  return out;
}
