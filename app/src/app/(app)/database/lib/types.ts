// Client-side types for the Database (base engine) UI — mirror the API shapes.

export type FieldType =
  | 'text'
  | 'longText'
  | 'number'
  | 'currency'
  | 'percent'
  | 'rating'
  | 'singleSelect'
  | 'multiSelect'
  | 'date'
  | 'person'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone'
  | 'file'
  | 'totp'
  | 'link';

export interface FileRef {
  id: string;
  name: string;
  path: string;
  mime?: string | null;
  size?: number | null;
}

/** Client-safe view of a `totp` cell — the live code + countdown, never the secret. */
export interface TotpView {
  set: boolean;
  code?: string;
  period?: number;
  remainingSec?: number;
}

/** A resolved link in a `link` cell: target row id + its display-field label. */
export interface LinkRef {
  id: string;
  label: string;
}

/** A table in the org (for the link-field target picker). */
export interface OrgTable {
  id: string;
  name: string;
  baseId: string;
  baseName: string;
}

export interface SelectChoice {
  id: string;
  name: string;
  color?: string;
}

export interface FieldT {
  id: string;
  tableId: string;
  name: string;
  type: FieldType;
  options: {
    choices?: SelectChoice[];
    precision?: number;
    includeTime?: boolean;
    multiple?: boolean;
    symbol?: string;
    max?: number;
    targetTableId?: string;
    displayFieldId?: string;
  } | null;
  position: number;
  width?: number | null;
}

export interface FilterCond {
  fieldId: string;
  op: string;
  value?: unknown;
}
export interface SortCond {
  fieldId: string;
  dir?: 'asc' | 'desc';
}
export interface ViewConfig {
  visibleFieldIds?: string[];
  fieldOrder?: string[];
  filters?: FilterCond[];
  sorts?: SortCond[];
  groupByFieldId?: string;
  kanbanStackFieldId?: string;
  calendarDateFieldId?: string;
  rowHeight?: number;
}
export interface ViewT {
  id: string;
  tableId: string;
  name: string;
  type: 'grid' | 'kanban' | 'calendar';
  config: ViewConfig;
  position: number;
}

export interface RowT {
  id: string;
  tableId: string;
  data: Record<string, unknown>;
  position: number;
}

export interface TableTab {
  id: string;
  name: string;
  icon?: string | null;
  position: number;
  primaryFieldId?: string | null;
}

export interface TableT {
  id: string;
  baseId: string;
  name: string;
  icon?: string | null;
  primaryFieldId?: string | null;
  fields: FieldT[];
  views: ViewT[];
}

export interface BaseSummary {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  visibility?: string;
  mine?: boolean;
  tableCount: number;
  tables?: string[];
}

export interface BaseDetail {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  visibility?: string;
  createdById?: string | null;
  tables: TableTab[];
}

export interface OrgMember {
  id: string;
  name: string | null;
  image: string | null;
  email: string | null;
}

export type BaseRole = 'viewer' | 'editor' | 'admin';
export interface BaseMemberT extends OrgMember {
  role: BaseRole;
  hiddenFields: string[];
}
export interface BaseFieldRef {
  id: string;
  name: string;
  tableName: string;
}

// A small palette for new select choices (cycled through as choices are added).
export const CHOICE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];
