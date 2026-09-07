"use client";

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import { useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { Select } from "@/components/ui/select";
import Link from "next/link";
import {
  ListChecks, Check, Clock, Search, X, Sparkles, ChevronDown, ArrowUp, ArrowDown,
  MoreHorizontal, User, Loader2, Plus, Trash2, Video,
  LayoutList, LayoutGrid, AlertCircle, Calendar as CalendarIcon, Wand2, Building2,
  MessageSquare, Paperclip, Send, Download, Users, UploadCloud, GitBranch, SlidersHorizontal,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useIsMobile } from "@/lib/use-is-mobile";
import { useQuizPending } from "@/hooks/use-quiz-pending";
import { QuizzesPanel } from "../quizzes/quizzes-panel";
import { FieldCell } from "../database/components/FieldCell";
import { FieldEditor, type FieldDraft } from "../database/components/FieldEditor";
import { EDITABLE_CUSTOM_TYPES, customTaskFields, chipsForRow, filterableCustomFields, matchesCustomFilters } from "./custom-fields";
import type { FieldT, OrgMember } from "../database/lib/types";
import css from "./page.module.css";

/* ─── Types ─────────────────────────────────────────────── */
interface TaskAssignee { id: string; name: string | null; image: string | null; }
interface TaskMeeting { id: string; title: string; scheduledAt: string | null; }
interface Subtask {
  id: string; title: string; status: string; priority: string;
  dueDate: string | null; assigneeName: string | null; assignee: TaskAssignee | null;
  clickupManaged?: boolean; clickupUrl?: string | null;
  linearManaged?: boolean; linearUrl?: string | null;
}
interface Task {
  id: string; title: string; description?: string | null;
  priority: string; status: string; dueDate: string | null;
  assigneeName: string | null; meetingId: string; source?: string;
  assignee: TaskAssignee | null; meeting?: TaskMeeting;
  assigneeId?: string | null; completedAt?: string | null;
  departmentId?: string | null;
  // External two-way sync: when managed, this task is a read-only mirror (edits in ClickUp/Linear).
  clickupManaged?: boolean; clickupUrl?: string | null;
  linearManaged?: boolean; linearUrl?: string | null;
  department?: { id: string; name: string; color: string | null } | null;
  parentId?: string | null;
  collaborators?: { userId: string }[];
  assignees?: { user: TaskAssignee }[];
  subtasks?: Subtask[];
  /** Custom-field cell bag (P3.3), keyed by Field id — secrets already stripped server-side. */
  cells?: Record<string, unknown>;
  _count?: { subtasks: number; comments: number; attachments: number };
}
interface UserItem { id: string; name: string; email: string; image: string | null; }
interface MeetingOption { id: string; title: string; scheduledAt: string | null; }

/* ─── Due date helper ───────────────────────────────────── */
type DueInfo =
  | { kind: "today"; overdue: false; soon: true }
  | { kind: "tomorrow"; overdue: false; soon: true }
  | { kind: "overdue"; days: number; overdue: true; soon: false }
  | { kind: "weekday"; date: string; overdue: false; soon: boolean }
  | { kind: "date"; date: string; overdue: false; soon: false };

function dueInfo(d: string | null): DueInfo | null {
  if (!d) return null;
  const due = new Date(d); due.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return { kind: "today", overdue: false, soon: true };
  if (diff === 1) return { kind: "tomorrow", overdue: false, soon: true };
  if (diff < 0) return { kind: "overdue", days: -diff, overdue: true, soon: false };
  if (diff < 7) return { kind: "weekday", date: d, overdue: false, soon: diff < 3 };
  return { kind: "date", date: d, overdue: false, soon: false };
}

/** Resolve a localized due-date label. `tr`/`locale` come from the calling component. */
function dueText(due: DueInfo, tr: ReturnType<typeof useTranslations>, locale: string): string {
  switch (due.kind) {
    case "today": return tr("common.today");
    case "tomorrow": return tr("common.tomorrow");
    case "overdue": return tr("tasks.overdueDays", { count: due.days });
    case "weekday": return new Date(due.date).toLocaleDateString(locale, { weekday: "long" });
    case "date": return new Date(due.date).toLocaleDateString(locale, { day: "numeric", month: "short" });
  }
}

/* ─── Highlight search matches ──────────────────────────── */
function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  try {
    const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return <>{parts.map((p, i) =>
      p.toLowerCase() === q.toLowerCase()
        ? <mark key={i} className={css.mark}>{p}</mark>
        : p
    )}</>;
  } catch { return <>{text}</>; }
}

/* ─── Status checkbox ───────────────────────────────────── */
/** Small "Managed in ClickUp/Linear" chip + link, shown on read-only (externally owned) tasks. */
function ManagedChip({ label, url }: { label: string; url?: string | null }) {
  const inner = (
    <span className={css.managedChip}>
      {label}{url ? " ↗" : ""}
    </span>
  );
  return url
    ? <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={`Managed in ${label}`} className={css.noUnderline}>{inner}</a>
    : inner;
}
/** A task is externally owned (read-only mirror) if managed by ClickUp OR Linear. */
function managedOf(t: { clickupManaged?: boolean; clickupUrl?: string | null; linearManaged?: boolean; linearUrl?: string | null }): { managed: boolean; label: string; url: string | null } {
  if (t.linearManaged) return { managed: true, label: "Linear", url: t.linearUrl ?? null };
  if (t.clickupManaged) return { managed: true, label: "ClickUp", url: t.clickupUrl ?? null };
  return { managed: false, label: "", url: null };
}

function StatusCheckbox({ status, onClick }: { status: string; onClick: (e: React.MouseEvent) => void }) {
  const bg = status === "done" ? "var(--green)" : "transparent";
  const border = status === "done" ? "var(--green)" : status === "in_progress" ? "var(--amber)" : "var(--border)";
  return (
    <button onClick={onClick} title={status} className={css.statusBox} style={{
      background: bg, border: `1.5px solid ${border}`,
      color: "#fff",
    }}>
      {status === "done" && <Check size={13} strokeWidth={3} />}
      {status === "in_progress" && <span className={css.progDot} />}
    </button>
  );
}

/* ─── Priority indicators ───────────────────────────────── */
function PriorityDot({ p, size = 7 }: { p: string; size?: number }) {
  const c = p === "high" ? "var(--red)" : p === "medium" ? "var(--amber)" : "var(--muted)";
  return <span className={css.prioDot} style={{ width: size, height: size, background: c }} />;
}
function PriorityTag({ p }: { p: string }) {
  const tr = useTranslations();
  const map: Record<string, { c: string; l: string }> = {
    high: { c: "var(--red)", l: tr("tasks.priorityShortHigh") },
    medium: { c: "var(--amber)", l: tr("tasks.priorityShortMedium") },
    low: { c: "var(--muted)", l: tr("tasks.priorityShortLow") },
  };
  const v = map[p] || map.medium;
  return (
    <span className={css.prioTag} style={{ background: `color-mix(in oklab, ${v.c} 14%, transparent)`, color: v.c }}>
      <span className={css.dot5} style={{ background: v.c }} />{v.l}
    </span>
  );
}

/* ─── Filter Pills ──────────────────────────────────────── */
function DeptChip({ dept }: { dept?: { id: string; name: string; color: string | null } | null }) {
  if (!dept) return null;
  return (
    <span className={css.deptChip}>
      <span className={css.deptDot} style={{ background: dept.color || "var(--accent)" }} />
      {dept.name}
    </span>
  );
}

function CountBadges({ c }: { c?: { subtasks: number; comments: number; attachments: number } }) {
  if (!c) return null;
  const items = [
    c.comments > 0 ? { icon: MessageSquare, n: c.comments } : null,
    c.attachments > 0 ? { icon: Paperclip, n: c.attachments } : null,
  ].filter(Boolean) as { icon: React.ComponentType<{ size?: number }>; n: number }[];
  if (items.length === 0) return null;
  return (
    <span className={css.countBadges}>
      {items.map((it, i) => {
        const Icon = it.icon;
        return (
          <span key={i} className={css.countItem}>
            <Icon size={11} /> {it.n}
          </span>
        );
      })}
    </span>
  );
}

function FilterPills({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { id: string; label: string; count: number }[];
}) {
  return (
    <div className={css.row6}>
      {options.map(o => {
        const active = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} className="btn btn-sm" style={{
            background: active ? "color-mix(in oklab, var(--accent) 18%, transparent)" : "var(--surface)",
            border: "1px solid " + (active ? "color-mix(in oklab, var(--accent) 40%, transparent)" : "var(--border)"),
            color: active ? "#bfdbfe" : "var(--text-2)", fontWeight: active ? 600 : 500,
          }}>
            {o.label}
            <span className={css.pillCount}>{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Select chip ───────────────────────────────────────── */
function SelectChip({ value, onChange, options, icon: IconComp }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  icon: React.ElementType;
}) {
  const isActive = value !== "all";
  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      icon={<IconComp size={13} style={{ color: isActive ? "#bfdbfe" : "var(--muted)", flexShrink: 0 }} />}
      style={{
        height: 34,
        width: "auto",
        fontSize: 13,
        borderRadius: 8,
        background: "var(--surface)",
        border: "1px solid " + (isActive ? "color-mix(in oklab, var(--accent) 35%, transparent)" : "var(--border)"),
        color: isActive ? "#bfdbfe" : "var(--text-2)",
      }}
    />
  );
}

/* Compact read-only chips for non-empty CUSTOM fields, shown on board rows/cards
   so values are visible without opening the drawer. Only editable-typed fields
   are chipped (never totp/password — a live code must not surface on the board). */
function CustomFieldChips({ fields, cells, members, max = 3 }: {
  fields: FieldT[]; cells?: Record<string, unknown>; members: OrgMember[]; max?: number;
}) {
  const shown = chipsForRow(fields, cells, members, max);
  if (!shown.length) return null;
  return (
    <>
      {shown.map(c => (
        <span key={c.name} title={`${c.name}: ${c.text}`} className={css.cfChip}>
          <span className={css.mutedText}>{c.name}:</span> {c.text}
        </span>
      ))}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   TASK ROW (List view)
   ═══════════════════════════════════════════════════════════ */
function TaskRow({ t, onEdit, onStatusChange, q, last, mobile, expanded, onToggleExpand, customFields = [], members = [] }: {
  t: Task; onEdit: () => void; onStatusChange: (status: string) => void;
  q: string; last: boolean; mobile?: boolean;
  expanded?: boolean; onToggleExpand?: () => void;
  customFields?: FieldT[]; members?: OrgMember[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const due = dueInfo(t.dueDate);
  const isOverdue = due?.overdue && t.status !== "done";
  const subTotal = t.subtasks?.length ?? t._count?.subtasks ?? 0;
  const subDone = t.subtasks?.filter(s => s.status === "done").length ?? 0;

  const cycleStatus = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = t.status === "open" ? "in_progress" : t.status === "in_progress" ? "done" : "open";
    onStatusChange(next);
  };

  // Disclosure caret — always present (so any task can get a first subtask
  // inline), brighter when subtasks exist. Rotates ▸→▾ when open.
  const caret = (
    <button onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
      aria-label={expanded ? tr("tasks.hide") : tr("tasks.show")}
      className={css.iconBtn2s}>
      <ChevronDown size={15} className={css.caretIcon} style={{ transform: expanded ? "none" : "rotate(-90deg)", opacity: subTotal > 0 ? 0.95 : 0.4 }} />
    </button>
  );

  // Mobile: a stacked card — title on top, then a wrapping meta row. Far more
  // legible on a phone than the desktop single-line row.
  if (mobile) {
    const dueChip = due && (
      <span className={css.dueChip} style={{
        background: isOverdue ? "color-mix(in oklab, var(--red) 18%, transparent)" :
                    due.soon ? "color-mix(in oklab, var(--amber) 14%, transparent)" : "var(--surface-2)",
        color: isOverdue ? "#fca5a5" : due.soon ? "#fcd34d" : "var(--text-2)",
        fontWeight: isOverdue ? 600 : 500,
      }}>
        <Clock size={11} /> {dueText(due, tr, locale)}
      </span>
    );
    return (
      <div onClick={onEdit} className={css.rowMobile} style={{
        borderBottom: last ? "none" : "1px solid var(--border)",
        borderLeft: isOverdue ? "3px solid var(--red)" : "3px solid transparent",
        paddingLeft: isOverdue ? 13 : 16,
      }}>
        <div className={css.rowCheckMobile}>
          {caret}
          <StatusCheckbox status={t.status} onClick={cycleStatus} />
        </div>
        <div className={css.flex1min0}>
          <div className={css.titleRowMobile}>
            {t.source === "ai" && <Sparkles size={12} className={css.aiIconMobile} />}
            <div className={css.titleMobile} style={{
              color: t.status === "done" ? "var(--muted)" : "var(--text)",
              textDecoration: t.status === "done" ? "line-through" : "none",
            }}>
              <Hl text={t.title} q={q} />
            </div>
          </div>
          <div className={css.metaRowMobile}>
            <PriorityTag p={t.priority} />
            {dueChip}
            <DeptChip dept={t.department} />
            <SubProgress done={subDone} total={subTotal} />
            <CountBadges c={t._count} />
            <CustomFieldChips fields={customFields} cells={t.cells} members={members} max={2} />
            {t.assignee ? (
              <span className={css.asgMobile}>
                <Avatar name={t.assignee.name || "?"} image={t.assignee.image} size="sm" />
                {(t.assignee.name || "").split(" ")[0]}
              </span>
            ) : t.assigneeName ? (
              <span className={css.asgNameMobile}>{t.assigneeName}</span>
            ) : null}
          </div>
          {t.meeting && t.meetingId && (
            <Link href={`/meetings/${t.meetingId}/report`} onClick={e => e.stopPropagation()} className={css.meetLinkMobile}>
              <Video size={11} /> {t.meeting.title}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={css.rowDesk} style={{
      borderBottom: last ? "none" : "1px solid var(--border)",
      borderLeft: isOverdue ? "3px solid var(--red)" : "3px solid transparent",
      paddingLeft: isOverdue ? 13 : 16,
    }}
      onClick={onEdit}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <div className={css.rowCheckDesk}>
        {caret}
        <StatusCheckbox status={t.status} onClick={cycleStatus} />
      </div>
      <div className={css.flex1min0}>
        <div className={css.titleRowDesk}>
          {t.source === "ai" && <Sparkles size={12} className={css.aiIcon} />}
          <div className={css.titleDesk} style={{
            color: t.status === "done" ? "var(--muted)" : "var(--text)",
            textDecoration: t.status === "done" ? "line-through" : "none",
          }}>
            <Hl text={t.title} q={q} />
          </div>
        </div>
        <div className={css.metaRowDesk}>
          {t.meeting && t.meetingId ? (
            <Link href={`/meetings/${t.meetingId}/report`} onClick={e => e.stopPropagation()} className={css.meetLinkDesk}>
              <Video size={11} /> {t.meeting.title}
            </Link>
          ) : !t.meetingId ? (
            <span className={css.standalone}>
              <ListChecks size={11} /> {tr("tasks.standaloneTask")}
            </span>
          ) : null}
          <DeptChip dept={t.department} />
          <SubProgress done={subDone} total={subTotal} />
          <CountBadges c={t._count} />
          <CustomFieldChips fields={customFields} cells={t.cells} members={members} max={3} />
        </div>
      </div>
      <PriorityTag p={t.priority} />
      {t.assignee ? (
        <div title={t.assignee.name || ""} className={css.asgDesk}>
          <Avatar name={t.assignee.name || "?"} image={t.assignee.image} size="sm" />
          <span className={css.asgName}>{t.assignee.name}</span>
        </div>
      ) : t.assigneeName ? (
        <span title={t.assigneeName} className={css.asgNameOnly}>{t.assigneeName}</span>
      ) : null}
      <div className={css.dueCol}>
        {due && (
          <span className={css.dueChip} style={{
            background: isOverdue ? "color-mix(in oklab, var(--red) 18%, transparent)" :
                        due.soon ? "color-mix(in oklab, var(--amber) 14%, transparent)" : "var(--surface-2)",
            color: isOverdue ? "#fca5a5" : due.soon ? "#fcd34d" : "var(--text-2)",
            fontWeight: isOverdue ? 600 : 500,
          }}>
            <Clock size={11} /> {dueText(due, tr, locale)}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Subtask progress meter (parent row) ──────────────────── */
function SubProgress({ done, total }: { done: number; total: number }) {
  if (total <= 0) return null;
  const pct = Math.round((done / total) * 100);
  const complete = done === total;
  return (
    <span title={`${done}/${total}`} className={css.subProg}>
      <span className={css.subTrack} style={{ background: "var(--surface-2, #2a2a32)" }}>
        <span className={css.subFill} style={{ width: `${pct}%`, background: complete ? "var(--green)" : "var(--accent)" }} />
      </span>
      <span className={css.subLabel} style={{ color: complete ? "var(--green)" : "var(--muted)" }}>{done}/{total}</span>
    </span>
  );
}

/* ─── Inline subtask list (expanded under a parent row) ─────── */
function SubtaskList({ parent, mobile, onOpen, onChange }: {
  parent: Task; mobile?: boolean; onOpen: (id: string) => void; onChange: (next: Subtask[]) => void;
}) {
  const tr = useTranslations();
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const subs = parent.subtasks || [];

  const toggle = async (s: Subtask, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = s.status === "done" ? "open" : "done";
    const prev = subs;
    onChange(subs.map(x => x.id === s.id ? { ...x, status: next } : x));
    try {
      const res = await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: s.id, status: next }) });
      if (!res.ok) onChange(prev); // revert on failure instead of silently diverging
    } catch { onChange(prev); }
  };
  const del = async (s: Subtask, e: React.MouseEvent) => {
    e.stopPropagation();
    // Mirrored subtasks delete their ClickUp copies too — one stray click on a trash
    // icon should not do that silently.
    if (s.clickupManaged && !window.confirm(tr("tasks.confirmDeleteMirrored"))) return;
    const prev = subs;
    onChange(subs.filter(x => x.id !== s.id));
    try {
      // Was fire-and-forget: a rejected delete (not admin/assignee, or some ClickUp
      // copies survived) still vanished from the list and reappeared on refresh.
      const res = await fetch("/api/tasks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: s.id }) });
      if (!res.ok) onChange(prev);
    } catch { onChange(prev); }
  };
  const add = async () => {
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true); setNewTitle("");
    try {
      const r = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, parentId: parent.id }) });
      if (r.ok) {
        const c = await r.json();
        onChange([...subs, { id: c.id, title: c.title, status: c.status, priority: c.priority, dueDate: c.dueDate, assigneeName: c.assigneeName ?? null, assignee: c.assignee ?? null }]);
      }
    } finally { setAdding(false); }
  };

  return (
    <div className={css.subList} style={{
      paddingLeft: mobile ? 34 : 48, paddingRight: mobile ? 14 : 16,
      animation: "subIn .16s ease",
    }}>
      {subs.map(s => {
        const done = s.status === "done";
        return (
          <div key={s.id} onClick={() => onOpen(s.id)} className={css.subRow}
            onMouseEnter={e => (e.currentTarget.style.background = "color-mix(in oklab, var(--accent) 8%, transparent)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
            <StatusCheckbox status={s.status} onClick={(e) => toggle(s, e)} />
            <span className={css.subTitle} style={{ color: done ? "var(--muted)" : "var(--text-2)", textDecoration: done ? "line-through" : "none" }}>{s.title}</span>
            {s.assignee ? <Avatar name={s.assignee.name || "?"} image={s.assignee.image} size="sm" />
              : s.assigneeName ? <span className={css.muted11}>{s.assigneeName.split(" ")[0]}</span> : null}
            <button onClick={(e) => del(s, e)} title={tr("common.delete")} className={css.iconBtn2s}><Trash2 size={13} /></button>
          </div>
        );
      })}
      <div className={css.subAddRow} style={{ marginTop: subs.length ? 4 : 0 }}>
        <Plus size={14} className={css.mutedShrink} />
        <input value={newTitle} onChange={e => setNewTitle(e.target.value)} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Enter") add(); }}
          placeholder={tr("tasks.subtaskPlaceholder")}
          className={css.subInput} />
        {adding && <Loader2 size={13} className={`spin ${css.mutedText}`} />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   LIST VIEW  (desktop = dense sortable table · mobile = stacked cards)
   ═══════════════════════════════════════════════════════════ */
type SortKey = "title" | "priority" | "assignee" | "due" | "progress" | "dept" | "state";
const PRIO_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const STATE_RANK: Record<string, number> = { open: 0, in_progress: 1, done: 2 };
function dueRank(d: string | null): number {
  if (!d) return Number.POSITIVE_INFINITY; // tasks with no due date sort last
  const t = new Date(d); t.setHours(0, 0, 0, 0); return t.getTime();
}
function progPct(t: Task): number {
  const total = t.subtasks?.length ?? t._count?.subtasks ?? 0;
  if (total <= 0) return -1; // "no subtasks" sorts below 0%
  return (t.subtasks?.filter(s => s.status === "done").length ?? 0) / total;
}
function cmpTasks(a: Task, b: Task, key: SortKey): number {
  switch (key) {
    case "title": return a.title.localeCompare(b.title);
    case "priority": return (PRIO_RANK[a.priority] ?? 1) - (PRIO_RANK[b.priority] ?? 1);
    case "assignee": return (a.assignee?.name || a.assigneeName || "￿").localeCompare(b.assignee?.name || b.assigneeName || "￿");
    case "due": return dueRank(a.dueDate) - dueRank(b.dueDate);
    case "progress": return progPct(b) - progPct(a); // base order: most complete first
    case "dept": return (a.department?.name || "￿").localeCompare(b.department?.name || "￿");
    case "state": return (STATE_RANK[a.status] ?? 0) - (STATE_RANK[b.status] ?? 0);
  }
}

/* Small status pill (used in the Status column of the by-department table). */
function StateChip({ status }: { status: string }) {
  const tr = useTranslations();
  const map: Record<string, { c: string; l: string }> = {
    open: { c: "var(--accent)", l: tr("tasks.statusOpen") },
    in_progress: { c: "var(--amber)", l: tr("tasks.statusInProgress") },
    done: { c: "var(--green)", l: tr("tasks.statusDone") },
  };
  const v = map[status] || map.open;
  return (
    <span className={css.stateChip} style={{ background: `color-mix(in oklab, ${v.c} 14%, transparent)`, color: v.c }}>
      <span className={css.dot5} style={{ background: v.c }} />{v.l}
    </span>
  );
}

const Dash = () => <span className={css.dash} style={{ color: "var(--border-2, #3f3f46)" }}>—</span>;

/* One desktop table row — aligns to the shared `cols` grid template. */
function TaskTableRow({ t, cols, onEdit, onStatusChange, q, expanded, onToggleExpand, customFields, members, showDept, showState }: {
  t: Task; cols: string; onEdit: () => void; onStatusChange: (s: string) => void;
  q: string; expanded: boolean; onToggleExpand: () => void;
  customFields: FieldT[]; members: OrgMember[]; showDept: boolean; showState: boolean;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const due = dueInfo(t.dueDate);
  const isOverdue = due?.overdue && t.status !== "done";
  const isDone = t.status === "done";
  const subTotal = t.subtasks?.length ?? t._count?.subtasks ?? 0;
  const subDone = t.subtasks?.filter(s => s.status === "done").length ?? 0;
  const cycle = (e: React.MouseEvent) => { e.stopPropagation(); onStatusChange(t.status === "open" ? "in_progress" : t.status === "in_progress" ? "done" : "open"); };
  const showSubtitle = !!(t.meeting && t.meetingId) || (!t.meetingId) || (!!t.cells && customFields.length > 0);
  return (
    <div role="row" onClick={onEdit}
      className={css.tRow}
      style={{
        gridTemplateColumns: cols,
        borderLeft: isOverdue ? "2px solid var(--red)" : "2px solid transparent",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {/* disclosure + status */}
      <div className={css.tCheck}>
        <button onClick={(e) => { e.stopPropagation(); onToggleExpand(); }} aria-label={expanded ? tr("tasks.hide") : tr("tasks.show")}
          className={css.iconBtn}>
          <ChevronDown size={14} className={css.caretIcon} style={{ transform: expanded ? "none" : "rotate(-90deg)", opacity: subTotal > 0 ? 0.9 : 0.3 }} />
        </button>
        <StatusCheckbox status={t.status} onClick={cycle} />
      </div>
      {/* title (+ subtitle: meeting source / custom chips) */}
      <div className={css.tTitleCell}>
        <div className={css.tTitleRow}>
          {t.source === "ai" && <Sparkles size={12} className={css.aiIcon} />}
          <span className={css.tTitle} style={{ color: isDone ? "var(--muted)" : "var(--text)",
            textDecoration: isDone ? "line-through" : "none" }}>
            <Hl text={t.title} q={q} />
          </span>
          {(t.clickupManaged || t.linearManaged) && <ManagedChip label={t.linearManaged ? "Linear" : "ClickUp"} url={t.linearManaged ? t.linearUrl : t.clickupUrl} />}
        </div>
        {showSubtitle && (
          <div className={css.tSub}>
            {t.meeting && t.meetingId ? (
              <Link href={`/meetings/${t.meetingId}/report`} onClick={e => e.stopPropagation()} className={css.tMeetLink}>
                <Video size={10} className={css.shrink0} /> <span className={css.ellip}>{t.meeting.title}</span>
              </Link>
            ) : !t.meetingId ? (
              <span className={css.tStandalone}><ListChecks size={10} /> {tr("tasks.standaloneTask")}</span>
            ) : null}
            <CustomFieldChips fields={customFields} cells={t.cells} members={members} max={2} />
          </div>
        )}
      </div>
      {/* priority */}
      <div className={css.min0}><PriorityTag p={t.priority} /></div>
      {/* assignee */}
      <div className={css.min0}>
        {t.assignee ? (
          <span title={t.assignee.name || ""} className={css.tAsg}>
            <Avatar name={t.assignee.name || "?"} image={t.assignee.image} size="sm" />
            <span className={css.asgName}>{t.assignee.name}</span>
          </span>
        ) : t.assigneeName ? (
          <span title={t.assigneeName} className={css.tAsgName}>{t.assigneeName}</span>
        ) : <Dash />}
      </div>
      {/* due */}
      <div className={css.min0}>
        {due ? (
          <span className={css.dueChipTable} style={{
            background: isOverdue ? "color-mix(in oklab, var(--red) 18%, transparent)" : due.soon ? "color-mix(in oklab, var(--amber) 14%, transparent)" : "var(--surface-2)",
            color: isOverdue ? "#fca5a5" : due.soon ? "#fcd34d" : "var(--text-2)", fontWeight: isOverdue ? 600 : 500 }}>
            <Clock size={11} /> {dueText(due, tr, locale)}
          </span>
        ) : <Dash />}
      </div>
      {/* progress */}
      <div className={css.min0}>{subTotal > 0 ? <SubProgress done={subDone} total={subTotal} /> : <Dash />}</div>
      {/* dept (status grouping) */}
      {showDept && <div className={css.min0}>{t.department ? <DeptChip dept={t.department} /> : <Dash />}</div>}
      {/* status (department grouping) */}
      {showState && <div className={css.min0}><StateChip status={t.status} /></div>}
    </div>
  );
}

/* Inline quick-add at the foot of a group. */
function QuickAddRow({ cols, placeholder, onCreate }: { cols: string; placeholder: string; onCreate: (title: string) => Promise<void> | void }) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const v = val.trim(); if (!v || busy) return;
    setBusy(true); try { await onCreate(v); setVal(""); } finally { setBusy(false); }
  };
  return (
    <div className={css.qRow} style={{ gridTemplateColumns: cols }}>
      <div className={css.qIcon}>
        {busy ? <Loader2 size={14} className="spin" /> : <Plus size={15} />}
      </div>
      <input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }} placeholder={placeholder}
        className={css.qInput} />
    </div>
  );
}

function TaskListView({ tasks, onEdit, onStatusChange, q, mobile, groupBy = "status", departments = [], onOpenById, onSubtaskChange, onQuickCreate, customFields = [], members = [] }: {
  tasks: Task[]; onEdit: (t: Task) => void; onStatusChange: (id: string, s: string) => void; q: string; mobile?: boolean;
  groupBy?: "status" | "department"; departments?: { id: string; name: string; color: string | null }[];
  onOpenById?: (id: string) => void; onSubtaskChange?: (parentId: string, next: Subtask[]) => void;
  onQuickCreate?: (opts: { title: string; status?: string; departmentId?: string | null }) => void | Promise<void>;
  customFields?: FieldT[]; members?: OrgMember[];
}) {
  const tr = useTranslations();
  const [collapsedDone, setCollapsedDone] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const toggleExpand = (id: string) => setExpanded(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleSort = (key: SortKey) => setSort(prev => prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });

  const { order, groups, meta } = useMemo(() => {
    if (groupBy === "department") {
      const order = [...departments.map(d => d.id), "__none__"];
      const groups: Record<string, Task[]> = {};
      const meta: Record<string, { label: string; color: string }> = {};
      for (const d of departments) { groups[d.id] = []; meta[d.id] = { label: d.name, color: d.color || "var(--accent)" }; }
      groups.__none__ = []; meta.__none__ = { label: tr("departments.none"), color: "var(--muted)" };
      for (const t of tasks) {
        const key = t.departmentId && groups[t.departmentId] ? t.departmentId : "__none__";
        groups[key].push(t);
      }
      return { order, groups, meta };
    }
    return {
      order: ["open", "in_progress", "done"],
      groups: {
        open: tasks.filter(t => t.status === "open"),
        in_progress: tasks.filter(t => t.status === "in_progress"),
        done: tasks.filter(t => t.status === "done"),
      } as Record<string, Task[]>,
      meta: {
        open: { label: tr("tasks.statusOpen"), color: "var(--accent)" },
        in_progress: { label: tr("tasks.statusInProgress"), color: "var(--amber)" },
        done: { label: tr("tasks.statusDone"), color: "var(--green)" },
      } as Record<string, { label: string; color: string }>,
    };
  }, [tasks, groupBy, departments, tr]);

  const itemsFor = (key: string) => {
    const base = groups[key] || [];
    if (!sort) return base;
    const sorted = [...base].sort((a, b) => cmpTasks(a, b, sort.key));
    return sort.dir === "asc" ? sorted : sorted.reverse();
  };

  /* ── Mobile: stacked cards (unchanged) ─────────────────────────── */
  if (mobile) {
    return (
      <div className={css.mobScroll}>
        <div className={css.mobGroups}>
          {order.map(key => {
            const items = itemsFor(key);
            if (!items.length) return null;
            const m = meta[key];
            const collapsible = groupBy === "status" && key === "done";
            const collapsed = collapsible && collapsedDone;
            const square = groupBy === "department";
            return (
              <section key={key}>
                <button onClick={() => { if (collapsible) setCollapsedDone(c => !c); }} disabled={!collapsible}
                  className={css.mobGroupBtn} style={{ cursor: collapsible ? "pointer" : "default" }}>
                  <span className={css.shrink0} style={{ width: square ? 9 : 6, height: square ? 9 : 6, borderRadius: square ? 3 : "50%", background: m.color }} />
                  <span className={css.mobGroupLabel}>{m.label}</span>
                  <span className={css.groupCount}>{items.length}</span>
                  <div className={css.groupRule} />
                  {collapsible && (
                    <span className={css.groupToggle}>
                      {collapsed ? tr("tasks.show") : tr("tasks.hide")}
                      <ChevronDown size={13} className={css.caretIcon} style={{ transform: collapsed ? "rotate(-90deg)" : "none" }} />
                    </span>
                  )}
                </button>
                {!collapsed && (
                  <div className={css.card14}>
                    {items.map((t, i) => (
                      <Fragment key={t.id}>
                        <TaskRow t={t} onEdit={() => onEdit(t)} onStatusChange={(s) => onStatusChange(t.id, s)} q={q} last={i === items.length - 1} mobile
                          expanded={expanded.has(t.id)} onToggleExpand={() => toggleExpand(t.id)} customFields={customFields} members={members} />
                        {expanded.has(t.id) && (
                          <SubtaskList parent={t} mobile onOpen={(id) => onOpenById?.(id)} onChange={(next) => onSubtaskChange?.(t.id, next)} />
                        )}
                      </Fragment>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── Desktop: dense, sortable table ────────────────────────────── */
  const showDept = groupBy === "status" && departments.length > 0;
  const showState = groupBy === "department";
  const colDefs: { key: SortKey | "_check"; label: string; width: string; sortable: boolean }[] = [
    { key: "_check", label: "", width: "44px", sortable: false },
    { key: "title", label: tr("tasks.colTitle"), width: "minmax(0,1fr)", sortable: true },
    { key: "priority", label: tr("tasks.colPriority"), width: "120px", sortable: true },
    { key: "assignee", label: tr("tasks.colAssignee"), width: "156px", sortable: true },
    { key: "due", label: tr("tasks.colDue"), width: "126px", sortable: true },
    { key: "progress", label: tr("tasks.colProgress"), width: "92px", sortable: true },
    ...(showDept ? [{ key: "dept" as const, label: tr("tasks.colDept"), width: "138px", sortable: true }] : []),
    ...(showState ? [{ key: "state" as const, label: tr("tasks.colStatus"), width: "132px", sortable: true }] : []),
  ];
  const cols = colDefs.map(c => c.width).join(" ");

  return (
    <div className={css.deskScroll}>
      <div className={css.deskWrap}>
        <div className={css.card14}>
          {/* column header */}
          <div role="row" className={css.tHead} style={{ gridTemplateColumns: cols, background: "var(--bg, #0f1117)" }}>
            {colDefs.map(c => {
              const active = sort?.key === c.key;
              if (!c.sortable) return <div key={c.key} />;
              return (
                <div key={c.key} className={css.min0}>
                  <button onClick={() => toggleSort(c.key as SortKey)} className={css.sortBtn} style={{ color: active ? "var(--text)" : "var(--muted)" }}>
                    {c.label}
                    {active && (sort!.dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </button>
                </div>
              );
            })}
          </div>

          {order.map(key => {
            const items = itemsFor(key);
            if (!items.length) return null;
            const m = meta[key];
            const collapsible = groupBy === "status" && key === "done";
            const collapsed = collapsible && collapsedDone;
            const square = groupBy === "department";
            const create = onQuickCreate && (groupBy === "status"
              ? (title: string) => onQuickCreate({ title, status: key })
              : (title: string) => onQuickCreate({ title, departmentId: key === "__none__" ? null : key }));
            return (
              <Fragment key={key}>
                {/* group separator band */}
                <button onClick={() => { if (collapsible) setCollapsedDone(c => !c); }} disabled={!collapsible}
                  className={css.groupBand} style={{ background: "var(--bg, #0f1117)", cursor: collapsible ? "pointer" : "default" }}>
                  <span className={css.shrink0} style={{ width: square ? 9 : 6, height: square ? 9 : 6, borderRadius: square ? 3 : "50%", background: m.color }} />
                  <span className={css.groupLabel}>{m.label}</span>
                  <span className={css.groupCountSm}>{items.length}</span>
                  {collapsible && (
                    <span className={css.groupToggleAuto}>
                      {collapsed ? tr("tasks.show") : tr("tasks.hide")}
                      <ChevronDown size={13} className={css.caretIcon} style={{ transform: collapsed ? "rotate(-90deg)" : "none" }} />
                    </span>
                  )}
                </button>
                {!collapsed && items.map(t => (
                  <Fragment key={t.id}>
                    <TaskTableRow t={t} cols={cols} onEdit={() => onEdit(t)} onStatusChange={(s) => onStatusChange(t.id, s)} q={q}
                      expanded={expanded.has(t.id)} onToggleExpand={() => toggleExpand(t.id)} customFields={customFields} members={members}
                      showDept={showDept} showState={showState} />
                    {expanded.has(t.id) && (
                      <SubtaskList parent={t} onOpen={(id) => onOpenById?.(id)} onChange={(next) => onSubtaskChange?.(t.id, next)} />
                    )}
                  </Fragment>
                ))}
                {!collapsed && create && !sort && (
                  <QuickAddRow cols={cols} placeholder={tr("tasks.quickAddPlaceholder")} onCreate={create} />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   KANBAN VIEW
   ═══════════════════════════════════════════════════════════ */
function KanbanCard({ t, onEdit, onDragStart, dragging, customFields = [], members = [] }: {
  t: Task; onEdit: () => void; onDragStart: () => void; dragging: boolean;
  customFields?: FieldT[]; members?: OrgMember[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const due = dueInfo(t.dueDate);
  const isOverdue = due?.overdue && t.status !== "done";
  const isDone = t.status === "done";

  return (
    <div draggable={!(t.clickupManaged || t.linearManaged)} onDragStart={onDragStart} onClick={onEdit}
      className={css.kCard}
      style={{
        borderLeft: isOverdue ? "3px solid var(--red)" : "1px solid var(--border)",
        opacity: dragging ? 0.4 : isDone ? 0.7 : 1,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-2, #3f3f46)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "none"; }}
    >
      <div className={css.kTitleRow}>
        <PriorityDot p={t.priority} size={8} />
        {t.source === "ai" && <Sparkles size={11} className={css.kAiIcon} />}
        <div className={css.kTitle} style={{
          color: isDone ? "var(--muted)" : "var(--text)",
          textDecoration: isDone ? "line-through" : "none",
        }}>{t.title}</div>
        {(t.clickupManaged || t.linearManaged) && <ManagedChip label={t.linearManaged ? "Linear" : "ClickUp"} url={t.linearManaged ? t.linearUrl : t.clickupUrl} />}
      </div>
      {t.meeting && t.meetingId ? (
        <div className={css.kMeta}>
          <Video size={11} /> <span className={css.ellip}>{t.meeting.title}</span>
        </div>
      ) : !t.meetingId ? (
        <div className={css.kMetaPlain}>
          <ListChecks size={11} /> {tr("tasks.standaloneTask")}
        </div>
      ) : null}
      {customFields.length > 0 && (
        <div className={css.kChips}>
          <CustomFieldChips fields={customFields} cells={t.cells} members={members} max={3} />
        </div>
      )}
      <div className={css.kFoot}>
        {t.assignee ? <Avatar name={t.assignee.name || "?"} image={t.assignee.image} size="sm" /> : <span />}
        {due && (
          <span className={css.dueChipCard} style={{
            background: isOverdue ? "color-mix(in oklab, var(--red) 18%, transparent)" :
                        due.soon ? "color-mix(in oklab, var(--amber) 14%, transparent)" : "transparent",
            color: isOverdue ? "#fca5a5" : due.soon ? "#fcd34d" : "var(--muted)",
            fontWeight: isOverdue ? 600 : 500,
          }}>
            <Clock size={10} /> {dueText(due, tr, locale)}
          </span>
        )}
      </div>
    </div>
  );
}

function KanbanView({ tasks, onEdit, onStatusChange, customFields = [], members = [] }: {
  tasks: Task[]; onEdit: (t: Task) => void; onStatusChange: (id: string, s: string) => void;
  customFields?: FieldT[]; members?: OrgMember[];
}) {
  const tr = useTranslations();
  const cols = [
    { id: "open", label: tr("tasks.statusOpen"), color: "var(--accent)" },
    { id: "in_progress", label: tr("tasks.statusInProgress"), color: "var(--amber)" },
    { id: "done", label: tr("tasks.statusDone"), color: "var(--green)" },
  ];
  const grouped = useMemo(() => Object.fromEntries(cols.map(c => [c.id, tasks.filter(t => t.status === c.id)])), [tasks]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);

  const onDrop = (colId: string) => {
    if (!dragId) return;
    const t = tasks.find(x => x.id === dragId);
    if (t && t.status !== colId) onStatusChange(t.id, colId);
    setDragId(null); setHoverCol(null);
  };

  return (
    <div className={css.kScroll}>
      <div className={css.kGrid}>
        {cols.map(col => (
          <div key={col.id} className={css.kCol} style={{
            background: "var(--bg, #0f1117)", border: "1px solid " + (hoverCol === col.id ? "color-mix(in oklab, var(--accent) 45%, var(--border))" : "var(--border)"),
          }}
            onDragOver={e => { e.preventDefault(); setHoverCol(col.id); }}
            onDragLeave={() => setHoverCol(c => c === col.id ? null : c)}
            onDrop={() => onDrop(col.id)}
          >
            <div className={css.kColHead}>
              <span className={css.dot6} style={{ background: col.color }} />
              <span className={css.kColLabel}>{col.label}</span>
              <span className={css.groupCount}>
                {(grouped[col.id] || []).length}
              </span>
            </div>
            <div className={css.kColBody}>
              {(grouped[col.id] || []).length === 0 ? (
                <div className={css.kDrop}>
                  {tr("tasks.dropTaskHere")}
                </div>
              ) : (grouped[col.id] || []).map(t => (
                <KanbanCard key={t.id} t={t} onEdit={() => onEdit(t)}
                  onDragStart={() => setDragId(t.id)} dragging={dragId === t.id}
                  customFields={customFields} members={members} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   EMPTY STATE
   ═══════════════════════════════════════════════════════════ */
function EmptyState({ scope, q, onCreate }: { scope: string; q: string; onCreate: () => void }) {
  const tr = useTranslations();
  return (
    <div className={css.empty}>
      <div className={css.emptyInner}>
        <div className={css.emptyIcon}>
          <ListChecks size={36} className={css.mutedText} />
        </div>
        <div className={css.emptyTitle}>
          {q ? tr("tasks.emptyNoResultsTitle") : scope === "mine" ? tr("tasks.emptyMineTitle") : tr("tasks.emptyAllTitle")}
        </div>
        <div className={css.emptyDesc}>
          {q ? tr("tasks.emptyNoResultsDesc", { query: q })
            : tr("tasks.emptyAllDesc")}
        </div>
        {!q && <button className="btn btn-primary" onClick={onCreate}><Plus size={14} /> {tr("tasks.createTask")}</button>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CREATE/EDIT TASK MODAL
   ═══════════════════════════════════════════════════════════ */
/* ─── Task collaboration (subtasks · comments · files · collaborators) ─────── */
interface CollabUser { id: string; name: string | null; image: string | null; }
interface SubTask { id: string; title: string; status: string; assignee: CollabUser | null; dueDate: string | null; }
interface TaskCommentT { id: string; body: string; createdAt: string; userId: string | null; authorName: string | null; user: CollabUser | null; }
interface AttachmentT { id: string; fileName: string; fileSize: number | null; mimeType: string | null; createdAt: string; uploadedById: string | null; uploadedBy: { id: string; name: string | null } | null; }
interface CollaboratorT { id: string; userId: string; user: CollabUser; }
interface TaskDetail {
  id: string; assignee: CollabUser | null; assigneeId: string | null;
  subtasks: SubTask[]; comments: TaskCommentT[]; attachments: AttachmentT[]; collaborators: CollaboratorT[]; assignees: CollaboratorT[];
}

function fmtSize(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function TaskCollab({ taskId, users, currentUserId, isAdmin, onChanged, onOpenTask }: {
  taskId: string; users: UserItem[]; currentUserId?: string; isAdmin: boolean; onChanged: () => void; onOpenTask?: (id: string) => void;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [subTab, setSubTab] = useState<"subtasks" | "comments" | "files">("subtasks");
  const [newSub, setNewSub] = useState("");
  const [newComment, setNewComment] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addAsgOpen, setAddAsgOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const r = await fetch(`/api/tasks/${taskId}`);
    if (r.ok) setDetail(await r.json());
  }, [taskId]);
  useEffect(() => { reload(); }, [reload]);

  const after = async () => { await reload(); onChanged(); };

  const addSubtask = async () => {
    const title = newSub.trim();
    if (!title) return;
    setNewSub("");
    await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, parentId: taskId }) });
    await after();
  };
  const toggleSub = async (s: SubTask) => {
    await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: s.id, status: s.status === "done" ? "open" : "done" }) });
    await after();
  };
  const delSub = async (s: SubTask) => {
    await fetch("/api/tasks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: s.id }) });
    await after();
  };
  const addComment = async () => {
    const body = newComment.trim();
    if (!body) return;
    setNewComment("");
    await fetch(`/api/tasks/${taskId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    await after();
  };
  const delComment = async (id: string) => {
    await fetch(`/api/tasks/${taskId}/comments?commentId=${id}`, { method: "DELETE" });
    await after();
  };
  const upload = async (file: File) => {
    setUploadErr("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: fd });
      if (!r.ok) { setUploadErr(r.status === 413 ? tr("tasks.fileTooLarge") : tr("tasks.uploadFailed")); return; }
      await after();
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const delAttachment = async (id: string) => {
    await fetch(`/api/tasks/${taskId}/attachments/${id}`, { method: "DELETE" });
    await after();
  };
  const addCollaborator = async (uid: string) => {
    setAddOpen(false);
    await fetch(`/api/tasks/${taskId}/collaborators`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: uid }) });
    await after();
  };
  const removeCollaborator = async (uid: string) => {
    await fetch(`/api/tasks/${taskId}/collaborators?userId=${uid}`, { method: "DELETE" });
    await after();
  };
  const addAssignee = async (uid: string) => {
    setAddAsgOpen(false);
    await fetch(`/api/tasks/${taskId}/assignees`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: uid }) });
    await after();
  };
  const removeAssignee = async (uid: string) => {
    await fetch(`/api/tasks/${taskId}/assignees?userId=${uid}`, { method: "DELETE" });
    await after();
  };

  if (!detail) return (
    <div className={css.collabLoading}>
      <Loader2 size={16} className={`spin ${css.mutedText}`} />
    </div>
  );

  // A person is either an assignee or a collaborator — keep the two pickers disjoint.
  const taken = new Set<string>([...detail.assignees.map(a => a.userId), ...detail.collaborators.map(c => c.userId)]);
  const candidates = users.filter(u => !taken.has(u.id));
  const fmtTime = (s: string) => new Date(s).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const canDel = (ownerId: string | null) => isAdmin || (ownerId != null && ownerId === currentUserId);

  return (
    <div className={css.collab}>
      {/* Assignees (виконавці) — multiple, the people responsible for the task */}
      <div>
        <div className={css.collabLabel}><Users size={13} /> {tr("tasks.assignees")}</div>
        <div className={css.chipRow}>
          {detail.assignees.map(a => (
            <span key={a.id} className={css.personChip}>
              <Avatar name={a.user.name || "?"} image={a.user.image} size="sm" />
              <span className={css.f12}>{(a.user.name || "").split(" ")[0] || "?"}</span>
              <button onClick={() => removeAssignee(a.userId)} title={tr("common.delete")} className={css.iconBtn}><X size={12} /></button>
            </span>
          ))}
          <div className={css.rel}>
            <button onClick={() => setAddAsgOpen(o => !o)} className={`btn btn-sm ${css.addChipBtn}`} disabled={candidates.length === 0}>
              <Plus size={13} /> {tr("tasks.addAssignee")}
            </button>
            {addAsgOpen && candidates.length > 0 && (
              <div className={css.pickerPanel} style={{ background: "var(--card, #181a20)" }}>
                {candidates.map(u => (
                  <button key={u.id} onClick={() => addAssignee(u.id)} className={css.pickerItem}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <Avatar name={u.name} image={u.image} size="sm" />
                    <span className={css.f13}>{u.name || u.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Collaborators */}
      <div>
        <div className={css.collabLabel}><Users size={13} /> {tr("tasks.collaborators")}</div>
        <div className={css.chipRow}>
          {detail.collaborators.map(c => (
            <span key={c.id} className={css.personChip}>
              <Avatar name={c.user.name || "?"} image={c.user.image} size="sm" />
              <span className={css.f12}>{(c.user.name || "").split(" ")[0] || "?"}</span>
              <button onClick={() => removeCollaborator(c.userId)} title={tr("common.delete")} className={css.iconBtn}><X size={12} /></button>
            </span>
          ))}
          <div className={css.rel}>
            <button onClick={() => setAddOpen(o => !o)} className={`btn btn-sm ${css.addChipBtn}`} disabled={candidates.length === 0}>
              <Plus size={13} /> {tr("tasks.addCollaborator")}
            </button>
            {addOpen && candidates.length > 0 && (
              <div className={css.pickerPanel} style={{ background: "var(--card, #181a20)" }}>
                {candidates.map(u => (
                  <button key={u.id} onClick={() => addCollaborator(u.id)} className={css.pickerItem}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <Avatar name={u.name} image={u.image} size="sm" />
                    <span className={css.f13}>{u.name || u.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub-tab strip */}
      <div className={css.subTabs}>
        {([
          { id: "subtasks" as const, icon: GitBranch, label: tr("tasks.subtasks"), n: detail.subtasks.length },
          { id: "comments" as const, icon: MessageSquare, label: tr("tasks.comments"), n: detail.comments.length },
          { id: "files" as const, icon: Paperclip, label: tr("tasks.attachments"), n: detail.attachments.length },
        ]).map(t => {
          const active = subTab === t.id;
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setSubTab(t.id)} className={`btn btn-sm ${css.subTabBtn}`} style={{
              background: active ? "var(--surface-2, #2a2a32)" : "transparent", fontWeight: active ? 600 : 500,
              color: active ? "var(--text)" : "var(--muted)",
            }}>
              <Icon size={13} /> {t.label}{t.n > 0 ? ` (${t.n})` : ""}
            </button>
          );
        })}
      </div>

      {/* Panels */}
      {subTab === "subtasks" && (
        <div className={css.colStack8}>
          {detail.subtasks.map(s => (
            <div key={s.id} className={css.collabItem}>
              <StatusCheckbox status={s.status} onClick={(e) => { e.stopPropagation(); toggleSub(s); }} />
              <span onClick={onOpenTask ? () => onOpenTask(s.id) : undefined}
                title={onOpenTask ? tr("tasks.openSubtask") : undefined}
                className={css.collabSubTitle} style={{ color: s.status === "done" ? "var(--muted)" : "var(--text)", textDecoration: s.status === "done" ? "line-through" : "none", cursor: onOpenTask ? "pointer" : "default" }}>{s.title}</span>
              {s.assignee && <Avatar name={s.assignee.name || "?"} image={s.assignee.image} size="sm" />}
              <button onClick={() => delSub(s)} title={tr("common.delete")} className={css.iconBtn2}><Trash2 size={13} /></button>
            </div>
          ))}
          {detail.subtasks.length === 0 && <div className={css.emptyNote}>{tr("tasks.noSubtasks")}</div>}
          <div className={css.row8}>
            <input value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addSubtask(); }}
              placeholder={tr("tasks.subtaskPlaceholder")}
              className={css.collabInput} />
            <button className="btn btn-sm" onClick={addSubtask} disabled={!newSub.trim()} style={{ opacity: newSub.trim() ? 1 : 0.5 }}><Plus size={14} /></button>
          </div>
        </div>
      )}

      {subTab === "comments" && (
        <div className={css.colStack12}>
          {detail.comments.map(c => (
            <div key={c.id} className={css.commentRow}>
              <Avatar name={c.user?.name || c.authorName || "?"} image={c.user?.image || null} size="sm" />
              <div className={css.flex1min0}>
                <div className={css.row8c}>
                  <span className={css.commentAuthor}>{c.user?.name || c.authorName || "?"}</span>
                  <span className={css.muted11}>{fmtTime(c.createdAt)}</span>
                  {canDel(c.userId) && (
                    <button onClick={() => delComment(c.id)} title={tr("common.delete")} className={css.iconBtnAuto}><X size={12} /></button>
                  )}
                </div>
                <div className={css.commentBody}>{c.body}</div>
              </div>
            </div>
          ))}
          {detail.comments.length === 0 && <div className={css.emptyNoteFlat}>{tr("tasks.noComments")}</div>}
          <div className={css.commentComposer}>
            <textarea value={newComment} onChange={e => setNewComment(e.target.value)} rows={2}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addComment(); }}
              placeholder={tr("tasks.commentPlaceholder")}
              className={css.commentInput} />
            <button className={`btn btn-primary btn-sm ${css.sendBtn}`} onClick={addComment} disabled={!newComment.trim()} style={{ opacity: newComment.trim() ? 1 : 0.5 }}>
              <Send size={14} /> {tr("tasks.sendComment")}
            </button>
          </div>
        </div>
      )}

      {subTab === "files" && (
        <div className={css.colStack8}>
          {detail.attachments.map(a => (
            <div key={a.id} className={css.collabItem}>
              <Paperclip size={14} className={css.mutedShrink} />
              <div className={css.flex1min0}>
                <div className={css.fileName}>{a.fileName}</div>
                <div className={css.muted11}>{fmtSize(a.fileSize)}{a.uploadedBy?.name ? ` · ${a.uploadedBy.name}` : ""}</div>
              </div>
              <a href={`/api/tasks/${taskId}/attachments/${a.id}`} title={tr("tasks.download")} download
                className={css.dlLink}><Download size={15} /></a>
              {canDel(a.uploadedById) && (
                <button onClick={() => delAttachment(a.id)} title={tr("common.delete")} className={css.iconBtn2}><Trash2 size={13} /></button>
              )}
            </div>
          ))}
          {detail.attachments.length === 0 && <div className={css.emptyNote}>{tr("tasks.noAttachments")}</div>}
          {uploadErr && <div className={css.errNote}>{uploadErr}</div>}
          <input ref={fileRef} type="file" className={css.hidden} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
          <button className={`btn btn-sm ${css.selfStart}`} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 size={14} className="spin" /> : <UploadCloud size={14} />} {uploading ? tr("tasks.uploading") : tr("tasks.uploadFile")}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Custom task fields (P3.3) ─────────────────────────────
   Renders the system Tasks table's CUSTOM engine fields inside the task
   drawer: editable types via the shared FieldCell (writes hit PATCH
   /api/tasks {cells}), the rest read-only. Admins can add/edit/delete the
   field schema via the engine FieldEditor → /api/tasks/fields. */
function TaskCustomFields({ taskId, fields, initialCells, members, isAdmin, onChanged, onFieldsChanged }: {
  taskId: string; fields: FieldT[]; initialCells: Record<string, unknown>;
  members: OrgMember[]; isAdmin: boolean; onChanged: () => void; onFieldsChanged: () => void;
}) {
  const tr = useTranslations();
  const [cells, setCells] = useState<Record<string, unknown>>(initialCells);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldT | null>(null);
  useEffect(() => { setCells(initialCells); /* reseed on task switch */ }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitCell = (fieldId: string, value: unknown) => {
    setCells(c => ({ ...c, [fieldId]: value })); // optimistic; the board refresh reconciles
    fetch("/api/tasks", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, cells: { [fieldId]: value } }),
    }).then(() => onChanged()).catch(() => {});
  };

  const saveField = async (draft: FieldDraft) => {
    const editing = editingField;
    await fetch(editing ? `/api/tasks/fields/${editing.id}` : "/api/tasks/fields", {
      method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    }).catch(() => {});
    setEditingField(null);
    onFieldsChanged();
  };

  const deleteField = async (f: FieldT) => {
    if (typeof window !== "undefined" && !window.confirm(tr("tasks.deleteFieldConfirm", { name: f.name }))) return;
    await fetch(`/api/tasks/fields/${f.id}`, { method: "DELETE" }).catch(() => {});
    onFieldsChanged();
  };

  if (!fields.length && !isAdmin) return null;

  return (
    <div>
      <div className={css.cfHead}>
        <label className={css.cfLabel}>{tr("tasks.customFields")}</label>
        {isAdmin && (
          <button className={`btn btn-sm ${css.addFieldBtn}`}
            onClick={() => { setEditingField(null); setEditorOpen(true); }}>
            <Plus size={12} /> {tr("database.addField")}
          </button>
        )}
      </div>
      {fields.length === 0 ? (
        <div className={css.emptyNoteFlat}>{tr("tasks.noCustomFields")}</div>
      ) : (
        <div className={css.colStack}>
          {fields.map(f => {
            const editable = EDITABLE_CUSTOM_TYPES.has(f.type);
            return (
              <div key={f.id}>
                <div className={css.cfRowHead}>
                  <span className={css.cfName}>{f.name}</span>
                  {isAdmin && (
                    <span className={css.cfActions}>
                      <button className={`btn btn-sm ${css.cfMiniBtn}`} title={tr("database.editField")} onClick={() => { setEditingField(f); setEditorOpen(true); }}><MoreHorizontal size={12} /></button>
                      <button className={`btn btn-sm ${css.cfMiniBtn} ${css.cfMiniDanger}`} title={tr("common.delete")} onClick={() => deleteField(f)}><Trash2 size={12} /></button>
                    </span>
                  )}
                </div>
                {editable ? (
                  <div className={css.cellBox}>
                    <FieldCell field={f} value={cells[f.id]} members={members} onCommit={(v) => commitCell(f.id, v)} />
                  </div>
                ) : (
                  <div className={css.readOnlyNote}>{tr("tasks.fieldReadOnly")}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <FieldEditor open={editorOpen} initial={editingField} onClose={() => setEditorOpen(false)} onSave={saveField} />
    </div>
  );
}

function TaskModal({ open, task, meetings, users, currentUserId, isAdmin, customFields, members, onFieldsChanged, onClose, onSaved, onChanged, onOpenById }: {
  open: boolean; task: Task | null; meetings: MeetingOption[]; users: UserItem[];
  currentUserId?: string; isAdmin: boolean;
  customFields: FieldT[]; members: OrgMember[]; onFieldsChanged: () => void;
  onClose: () => void; onSaved: () => void; onChanged: () => void; onOpenById?: (id: string) => void;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const isNew = !task;
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [meetingId, setMeetingId] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("open");
  const [newCells, setNewCells] = useState<Record<string, unknown>>({}); // custom-field values for a NEW task (no row yet)
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingQ, setMeetingQ] = useState("");
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/departments").then((r) => (r.ok ? r.json() : [])).then((d) => setDepartments(Array.isArray(d) ? d.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })) : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title); setDesc(task.description || "");
      setMeetingId(task.meetingId);
      // Prefer the full multi-assignee set; fall back to the single lead.
      const ids = task.assignees?.length
        ? task.assignees.map(a => a.user.id)
        : (task.assigneeId || task.assignee?.id ? [task.assigneeId || task.assignee!.id] : []);
      setAssigneeIds(ids.filter((v): v is string => !!v));
      setPriority(task.priority); setDueDate(task.dueDate ? task.dueDate.slice(0, 10) : "");
      setStatus(task.status); setDepartmentId(task.departmentId || "");
    } else {
      setTitle(""); setDesc(""); setMeetingId("");
      setAssigneeIds([]); setPriority("medium"); setDueDate(""); setStatus("open"); setDepartmentId(""); setNewCells({});
    }
    setMeetingOpen(false); setAssigneeOpen(false); setMeetingQ(""); setSaveErr(null);
  }, [open, task?.id]);

  if (!open) return null;

  const valid = title.trim().length >= 3;
  const meeting = meetings.find(m => m.id === meetingId);
  const assigneeCandidates = users.filter(u => !assigneeIds.includes(u.id));
  const meetingMatches = meetings.filter(m => !meetingQ || m.title.toLowerCase().includes(meetingQ.toLowerCase()));

  const generateDesc = async () => {
    if (aiLoading || title.trim().length < 3) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/tasks/ai-describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), currentDescription: desc.trim() || null }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.description) setDesc(data.description);
      }
    } catch (e) { console.error("AI generate failed:", e); }
    finally { setAiLoading(false); }
  };

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true); setSaveErr(null);
    try {
      const res = isNew
        ? await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, description: desc || null, meetingId: meetingId || null, assigneeId: assigneeIds[0] || null, assigneeIds, priority, dueDate: dueDate || null, departmentId: departmentId || null, cells: newCells }),
          })
        : await fetch("/api/tasks", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: task!.id, title, description: desc || null, meetingId: meetingId || null, assigneeIds, priority, dueDate: dueDate || null, status, departmentId: departmentId || null }),
          });
      // Was: fire-and-forget → onSaved() closed the drawer and refetched even on a
      // rejected save, so the edit silently reverted. Keep the drawer open on failure.
      if (!res.ok) { setSaveErr(tr('common.saveFailed')); return; }
      onSaved();
    } catch { setSaveErr(tr('common.saveFailed')); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!task) return;
    setSaving(true); setSaveErr(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id }),
      });
      if (!res.ok) { setSaveErr(tr('common.saveFailed')); return; }
      onSaved();
    } catch { setSaveErr(tr('common.saveFailed')); }
    finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} className={css.backdrop} style={{
      background: "rgba(8,10,14,.5)",
      animation: "bgIn .18s ease",
    }}>
      <div onClick={e => e.stopPropagation()} className={css.drawer} style={{
        background: "var(--card, #181a20)",
        animation: "drawerIn .24s cubic-bezier(.32,.72,0,1)",
      }}>
        {/* Header */}
        <div className={css.drawerHead}>
          <div className={css.drawerIcon}>
            <ListChecks size={15} />
          </div>
          <div className={css.drawerTitle}>{isNew ? tr("tasks.newTask") : tr("tasks.editTask")}</div>
          {!isNew && task?.source === "ai" && (
            <span className={css.aiChip} style={{ color: "#bfdbfe" }}>
              <Sparkles size={10} /> AI
            </span>
          )}
          <button className={`btn btn-sm ${css.closeBtn}`} onClick={onClose}><X size={15} /></button>
        </div>

        {/* Body */}
        <div className={css.drawerBody}>
          <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
            placeholder={tr("tasks.titlePlaceholder")}
            className={css.titleInput} />

          <div className={css.rel}>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
              placeholder={tr("tasks.descriptionPlaceholder")}
              className={css.descInput} />
            <button
              onClick={generateDesc}
              disabled={aiLoading || title.trim().length < 3}
              title={desc.trim() ? tr("tasks.aiRegenerateDescription") : tr("tasks.aiGenerateDescription")}
              className={css.aiBtn}
              style={{
                cursor: aiLoading || title.trim().length < 3 ? "not-allowed" : "pointer",
                background: aiLoading ? "color-mix(in oklab, var(--accent) 25%, transparent)" : "color-mix(in oklab, var(--accent) 12%, transparent)",
                color: title.trim().length < 3 ? "var(--muted)" : "var(--accent)",
                opacity: title.trim().length < 3 ? 0.4 : 1,
              }}
              onMouseEnter={e => { if (!aiLoading && title.trim().length >= 3) e.currentTarget.style.background = "color-mix(in oklab, var(--accent) 30%, transparent)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = aiLoading ? "color-mix(in oklab, var(--accent) 25%, transparent)" : "color-mix(in oklab, var(--accent) 12%, transparent)"; }}
            >
              {aiLoading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Wand2 size={14} />}
            </button>
          </div>

          {/* Meeting picker */}
          <div>
            <label className={css.fieldLabel}>{tr("tasks.meeting")}</label>
            <button onClick={() => setMeetingOpen(o => !o)} className={`btn ${css.pickerBtn}`}>
              <span className={css.pickerBtnInner}>
                {meetingId ? <Video size={13} className={css.mutedText} /> : <ListChecks size={13} className={css.mutedText} />}
                <span className={css.pickerBtnLabel}>
                  {meeting?.title || (meetingId ? tr("tasks.selectMeeting") : tr("tasks.noMeeting"))}
                </span>
              </span>
              <ChevronDown size={14} className={css.chevMuted} style={{ transform: meetingOpen ? "rotate(180deg)" : "none" }} />
            </button>
            {meetingOpen && (
              <div className={css.meetingPanel} style={{ background: "var(--card, #181a20)" }}>
                <div className={css.rel}>
                  <Search size={13} className={css.searchIcon} />
                  <input autoFocus placeholder={tr("tasks.searchMeeting")} value={meetingQ} onChange={e => setMeetingQ(e.target.value)}
                    className={css.meetingSearch} />
                </div>
                <div className={css.meetingList}>
                  <button onClick={() => { setMeetingId(""); setMeetingOpen(false); setMeetingQ(""); }}
                    className={css.meetingOptFirst} style={{ background: !meetingId ? "var(--surface)" : "transparent" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
                    onMouseLeave={e => (e.currentTarget.style.background = !meetingId ? "var(--surface)" : "transparent")}
                  >
                    <span className={css.meetingNone}>
                      <ListChecks size={12} /> {tr("tasks.noMeeting")}
                    </span>
                    {!meetingId && <Check size={13} className={css.accentIcon} />}
                  </button>
                  {meetingMatches.map(m => (
                    <button key={m.id} onClick={() => { setMeetingId(m.id); setMeetingOpen(false); setMeetingQ(""); }}
                      className={css.meetingOpt} style={{ background: m.id === meetingId ? "var(--surface)" : "transparent" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
                      onMouseLeave={e => (e.currentTarget.style.background = m.id === meetingId ? "var(--surface)" : "transparent")}
                    >
                      <span className={css.meetingTitle}>{m.title}</span>
                      {m.scheduledAt && <span className={css.meetingDate}>
                        {new Date(m.scheduledAt).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                      </span>}
                    </button>
                  ))}
                  {meetingMatches.length === 0 && <div className={css.meetingEmpty}>{tr("tasks.nothingFound")}</div>}
                </div>
              </div>
            )}
          </div>

          {departments.length > 0 && (
            <div>
              <label className={css.fieldLabel}>{tr("departments.label")}</label>
              <Select
                value={departmentId}
                onChange={setDepartmentId}
                placeholder={tr("departments.none")}
                options={[{ value: "", label: tr("departments.none") }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
                style={{ width: "100%" }}
              />
            </div>
          )}

          {/* Assignees (multiple — the first is the lead) */}
          <div>
            <label className={css.fieldLabel}>{tr("tasks.assignees")}</label>
            <div className={css.chipRow}>
              {assigneeIds.map(id => {
                const u = users.find(x => x.id === id);
                const label = u ? (u.name || u.email) : id;
                return (
                  <span key={id} className={css.personChip}>
                    {u ? <Avatar name={u.name} image={u.image} size="sm" /> : <User size={13} className={css.userIcon} />}
                    <span className={css.f12}>{(label || "").split(" ")[0] || label}</span>
                    <button onClick={() => setAssigneeIds(ids => ids.filter(x => x !== id))} title={tr("common.delete")} className={css.iconBtn}><X size={12} /></button>
                  </span>
                );
              })}
              <div className={css.rel}>
                <button onClick={() => setAssigneeOpen(o => !o)} className={`btn btn-sm ${css.addChipBtn}`} disabled={assigneeCandidates.length === 0}>
                  <Plus size={13} /> {assigneeIds.length === 0 ? tr("tasks.assignee") : tr("tasks.addAssignee")}
                </button>
                {assigneeOpen && assigneeCandidates.length > 0 && (
                  <div className={css.pickerPanelWide} style={{ background: "var(--card, #181a20)" }}>
                    {assigneeCandidates.map(u => (
                      <button key={u.id} onClick={() => { setAssigneeIds(ids => [...ids, u.id]); setAssigneeOpen(false); }}
                        className={css.pickerItem}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <Avatar name={u.name} image={u.image} size="sm" />
                        <span className={css.f13}>{u.name || u.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Due date */}
          <div>
            <label className={css.fieldLabel}>{tr("tasks.dueDate")}</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className={css.dateInput} />
          </div>

          {/* Priority */}
          <div>
            <label className={css.fieldLabel}>{tr("tasks.priority")}</label>
            <div className={css.row6}>
              {[
                { id: "high", label: tr("tasks.priorityHigh"), c: "var(--red)" },
                { id: "medium", label: tr("tasks.priorityMedium"), c: "var(--amber)" },
                { id: "low", label: tr("tasks.priorityLow"), c: "var(--muted)" },
              ].map(p => {
                const active = priority === p.id;
                return (
                  <button key={p.id} onClick={() => setPriority(p.id)} className={`btn btn-sm ${css.segBtn}`} style={{
                    background: active ? `color-mix(in oklab, ${p.c} 18%, transparent)` : "var(--surface)",
                    border: "1px solid " + (active ? `color-mix(in oklab, ${p.c} 50%, transparent)` : "var(--border)"),
                    color: active ? p.c : "var(--text-2)", fontWeight: active ? 600 : 500,
                  }}>
                    <span className={css.dot6} style={{ background: p.c }} /> {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom fields (new task) — edited in local state, sent with create */}
          {isNew && customFields.some(f => EDITABLE_CUSTOM_TYPES.has(f.type)) && (
            <div>
              <label className={css.fieldLabel8}>{tr("tasks.customFields")}</label>
              <div className={css.colStack}>
                {customFields.filter(f => EDITABLE_CUSTOM_TYPES.has(f.type)).map(f => (
                  <div key={f.id}>
                    <span className={css.cfNameBlock}>{f.name}</span>
                    <div className={css.cellBox}>
                      <FieldCell field={f} value={newCells[f.id]} members={members} onCommit={(v) => setNewCells(c => ({ ...c, [f.id]: v }))} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status (edit only) */}
          {!isNew && (
            <div>
              <label className={css.fieldLabel}>{tr("tasks.status")}</label>
              <div className={css.row6}>
                {[
                  { id: "open", label: tr("tasks.statusOpenSingular"), c: "var(--accent)" },
                  { id: "in_progress", label: tr("tasks.statusInProgress"), c: "var(--amber)" },
                  { id: "done", label: tr("tasks.statusDone"), c: "var(--green)" },
                ].map(s => {
                  const active = status === s.id;
                  return (
                    <button key={s.id} onClick={() => setStatus(s.id)} className={`btn btn-sm ${css.segBtn}`} style={{
                      background: active ? `color-mix(in oklab, ${s.c} 18%, transparent)` : "var(--surface)",
                      border: "1px solid " + (active ? `color-mix(in oklab, ${s.c} 50%, transparent)` : "var(--border)"),
                      color: active ? s.c : "var(--text-2)", fontWeight: active ? 600 : 500,
                    }}>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!isNew && task && (customFields.length > 0 || isAdmin) && (
            <TaskCustomFields taskId={task.id} fields={customFields} initialCells={task.cells ?? {}}
              members={members} isAdmin={isAdmin} onChanged={onChanged} onFieldsChanged={onFieldsChanged} />
          )}

          {!isNew && task && (
            <TaskCollab taskId={task.id} users={users} currentUserId={currentUserId} isAdmin={isAdmin} onChanged={onChanged} onOpenTask={onOpenById} />
          )}
        </div>

        {(task?.clickupManaged || task?.linearManaged) && (
          <div className={css.managedNotice}>
            <span>{task?.linearManaged ? tr("tasks.linearManagedNotice") : tr("tasks.clickupManagedNotice")}</span>
            {(task?.linearManaged ? task.linearUrl : task.clickupUrl) && <a href={(task?.linearManaged ? task.linearUrl : task.clickupUrl) || "#"} target="_blank" rel="noopener noreferrer" className={css.managedLink}>{task?.linearManaged ? "Linear ↗" : "ClickUp ↗"}</a>}
          </div>
        )}

        {saveErr && (
          <div role="alert" className={css.saveErr}>
            {saveErr}
          </div>
        )}
        {/* Footer */}
        <div className={css.drawerFoot}>
          {/* Deletable unless Linear owns it — Linear has no delete path, so removing
              the Garely row there would orphan the issue. A ClickUp-mirrored task IS
              deletable now, but it also destroys the ClickUp copies (one per assignee),
              so it asks first; a plain local task keeps the old one-click behaviour. */}
          {!isNew && !task?.linearManaged && (
            <button
              className={`btn btn-sm ${css.delBtn}`}
              disabled={saving}
              onClick={() => {
                if (task?.clickupManaged && !window.confirm(tr("tasks.confirmDeleteMirrored"))) return;
                void handleDelete();
              }}>
              <Trash2 size={13} /> {tr("common.delete")}
            </button>
          )}
          <div className={css.rowAuto8}>
            <button className="btn" onClick={onClose}>{(task?.clickupManaged || task?.linearManaged) ? tr("common.close") : tr("common.cancel")}</button>
            {!(task?.clickupManaged || task?.linearManaged) && (
              <button className={`btn btn-primary ${css.bold}`} disabled={!valid || saving} onClick={save}
                style={{ opacity: valid && !saving ? 1 : 0.5 }}>
                {saving ? <Loader2 size={14} className="spin" /> : null}
                {isNew ? tr("tasks.createTask") : tr("common.save")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */
function TabBtn({ active, onClick, label, badge }: { active: boolean; onClick: () => void; label: string; badge?: number }) {
  return (
    <button onClick={onClick} className={css.tabBtn} style={{
      color: active ? "var(--text)" : "var(--muted)",
      borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
    }}>
      {label}
      {badge && badge > 0 ? (
        <span className={css.tabBadge} style={{ color: "#fff" }}>{badge > 9 ? "9+" : badge}</span>
      ) : null}
    </button>
  );
}

export default function TasksPage() {
  const tr = useTranslations();
  const { data: session } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [fields, setFields] = useState<FieldT[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [meetings, setMeetings] = useState<MeetingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [view, setView] = useState<"list" | "kanban" | "dept">("list");
  const [scope, setScope] = useState("mine");
  const [filterMeeting, setFilterMeeting] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterDept, setFilterDept] = useState("all");
  const [customFilters, setCustomFilters] = useState<Record<string, string>>({}); // custom singleSelect fieldId → choiceId | "all"
  const [departments, setDepartments] = useState<{ id: string; name: string; color: string | null; members: { userId: string }[] }[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Task | null | "new">(null);
  const [tab, setTab] = useState<"tasks" | "quizzes">("tasks");

  const isAdmin = session?.user?.role === "admin";
  const userId = session?.user?.id;
  const isMobile = useIsMobile();
  const pendingQuiz = useQuizPending();

  const fetchTasks = useCallback(async () => {
    setError(false);
    try {
      // P3.3: ?withFields=1 returns { tasks, fields } so the board can render
      // CUSTOM task fields. Still tolerate a bare array (defensive).
      const res = await fetch("/api/tasks?scope=all&withFields=1");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setTasks(data);
        else { setTasks(Array.isArray(data.tasks) ? data.tasks : []); setFields(Array.isArray(data.fields) ? data.fields : []); }
      } else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Custom-field schema refresh (after an admin add/edit/delete in the drawer).
  const refreshFields = useCallback(async () => {
    try {
      const r = await fetch("/api/tasks/fields");
      if (r.ok) { const d = await r.json(); setFields(Array.isArray(d) ? d : []); }
    } catch { /* keep the current schema on a transient failure */ }
  }, []);

  // FieldCell wants the org members (person picker, avatars) in OrgMember shape.
  const members = useMemo<OrgMember[]>(
    () => users.map(u => ({ id: u.id, name: u.name, image: u.image, email: u.email })),
    [users],
  );
  const customFields = useMemo(() => customTaskFields(fields), [fields]);
  // Custom select-style fields are offered as board filter chips (client-side, by cell value).
  const filterableFields = useMemo(() => filterableCustomFields(customFields), [customFields]);

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "quizzes") setTab("quizzes");
    // fetchTasks owns `loading` (it sets it false in its finally) — don't clear
    // it synchronously here, or the spinner never reflects the real fetch.
    fetchTasks();
    fetch("/api/users").then(r => r.json()).then(d => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/meetings").then(r => r.json()).then((data: any[]) => {
      setMeetings(data.map(m => ({ id: m.id, title: m.title, scheduledAt: m.scheduledAt })));
    }).catch(() => {});
    fetch("/api/departments").then(r => (r.ok ? r.json() : [])).then((d: any[]) => {
      if (Array.isArray(d)) setDepartments(d.map(x => ({ id: x.id, name: x.name, color: x.color ?? null, members: Array.isArray(x.members) ? x.members.map((m: any) => ({ userId: m.userId })) : [] })));
    }).catch(() => {});
  }, []);

  // Open a task's modal by id (fetches full detail) — shared by the deep-link
  // and by clicking a subtask inline in the list.
  const openById = useCallback((id: string) => {
    fetch(`/api/tasks/${id}`).then(r => (r.ok ? r.json() : null)).then(d => {
      if (d && d.id) setEditing(d as Task);
    }).catch(() => {});
  }, []);

  // Deep-link: /tasks?task=ID opens that task's modal (notification links use it).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const tid = new URLSearchParams(window.location.search).get("task");
    if (!tid) return;
    openById(tid);
    window.history.replaceState(null, "", "/tasks");
  }, [openById]);

  // Inline subtask edits patch the parent's nested subtasks in board state
  // (no full refetch — preserves expansion/scroll). Keeps _count in sync.
  const patchTaskSubtasks = useCallback((parentId: string, next: Subtask[]) => {
    setTasks(prev => prev.map(t => t.id === parentId
      ? { ...t, subtasks: next, _count: { subtasks: next.length, comments: t._count?.comments ?? 0, attachments: t._count?.attachments ?? 0 } }
      : t));
  }, []);

  // Effective department of a task = its explicit department, else the
  // assignee's department — so moving a user into a department attributes their
  // tasks to it automatically. A user in several departments → their first.
  const userDept = useMemo(() => {
    const m: Record<string, { id: string; name: string; color: string | null }> = {};
    for (const d of departments) for (const mem of d.members) if (!m[mem.userId]) m[mem.userId] = { id: d.id, name: d.name, color: d.color };
    return m;
  }, [departments]);

  const filtered = useMemo(() => tasks
    .map(t => {
      const aid = t.assigneeId || t.assignee?.id || "";
      const eff = t.department ?? (aid ? userDept[aid] : undefined) ?? null;
      return { ...t, department: eff, departmentId: eff?.id ?? null };
    })
    .filter(t => {
      if (scope === "mine" && t.assignee?.id !== userId && t.assigneeId !== userId) return false;
      if (filterMeeting !== "all" && t.meetingId !== filterMeeting) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterAssignee !== "all" && t.assignee?.id !== filterAssignee && t.assigneeId !== filterAssignee) return false;
      if (filterDept !== "all" && t.departmentId !== filterDept) return false;
      if (!matchesCustomFilters(filterableFields, customFilters, t.cells as Record<string, unknown> | undefined)) return false;
      if (q) {
        const low = q.toLowerCase();
        if (!t.title.toLowerCase().includes(low) && !(t.description || "").toLowerCase().includes(low)) return false;
      }
      return true;
    }), [tasks, scope, filterMeeting, filterPriority, filterAssignee, filterDept, customFilters, filterableFields, q, userId, userDept]);

  const meetingOptions = useMemo(() => {
    const ids = [...new Set(tasks.map(t => t.meetingId))];
    return ids.map(id => meetings.find(m => m.id === id)).filter(Boolean) as MeetingOption[];
  }, [tasks, meetings]);

  const counts = useMemo(() => ({
    mine: tasks.filter(t => t.assignee?.id === userId || t.assigneeId === userId).length,
    all: tasks.length,
  }), [tasks, userId]);

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    { const ext = tasks.find(t => t.id === taskId); if (ext?.clickupManaged || ext?.linearManaged) return; } // read-only mirror — manage status in ClickUp/Linear
    const prevTasks = tasks;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, status: newStatus }),
      });
      if (!res.ok) setTasks(prevTasks); // server rejected → revert the optimistic change
    } catch (e) {
      console.error(e);
      setTasks(prevTasks);
    }
  };

  // Inline quick-add from a list group. Create defaults to status "open"; for a
  // non-open status group or a department group, follow up with a PATCH/the
  // departmentId so the new task lands in the group the user typed into.
  const handleQuickCreate = useCallback(async (opts: { title: string; status?: string; departmentId?: string | null }) => {
    const body: Record<string, unknown> = { title: opts.title };
    if (opts.departmentId) body.departmentId = opts.departmentId;
    try {
      const res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok && opts.status && opts.status !== "open") {
        const created = await res.json().catch(() => null);
        if (created?.id) await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: created.id, status: opts.status }) });
      }
    } finally {
      fetchTasks();
    }
  }, [fetchTasks]);

  const handleSaved = () => {
    setEditing(null);
    fetchTasks();
  };

  const switchTab = (t: "tasks" | "quizzes") => {
    setTab(t);
    if (typeof window !== "undefined") window.history.replaceState(null, "", t === "quizzes" ? "/tasks?tab=quizzes" : "/tasks");
  };

  if (loading) return (
    <div className={css.pageLoading}>
      <Loader2 size={24} className={`spin ${css.mutedText}`} />
    </div>
  );

  return (
    <div className={css.page}>
      {/* Page tabs: Tasks | Quizzes */}
      <div className={css.pageTabs}>
        <TabBtn active={tab === "tasks"} onClick={() => switchTab("tasks")} label={tr("tasks.pageTitle")} />
        <TabBtn active={tab === "quizzes"} onClick={() => switchTab("quizzes")} label={tr("quiz.navTitle")} badge={pendingQuiz} />
      </div>

      {tab === "quizzes" ? (
        <QuizzesPanel />
      ) : (
      <>
      {/* Header */}
      <div className={css.header}>
        <div className={css.headerRow}>
          <div className={css.flex1min0} />
          <div className={css.headerActions}>
            <div className={css.viewToggle}>
              <button onClick={() => setView("list")} className={`btn btn-sm ${css.viewBtn}`} style={{
                background: view === "list" ? "var(--surface-2, #2a2a32)" : "transparent",
                fontWeight: view === "list" ? 600 : 500,
              }}><LayoutList size={14} /> {tr("tasks.viewList")}</button>
              <button onClick={() => setView("kanban")} className={`btn btn-sm ${css.viewBtn}`} style={{
                background: view === "kanban" ? "var(--surface-2, #2a2a32)" : "transparent",
                fontWeight: view === "kanban" ? 600 : 500,
              }}><LayoutGrid size={14} /> {tr("tasks.viewKanban")}</button>
              {departments.length > 0 && (
                <button onClick={() => setView("dept")} className={`btn btn-sm ${css.viewBtn}`} style={{
                  background: view === "dept" ? "var(--surface-2, #2a2a32)" : "transparent",
                  fontWeight: view === "dept" ? 600 : 500,
                }}><Building2 size={14} /> {tr("departments.byDept")}</button>
              )}
            </div>
            <button className={`btn btn-primary ${css.bold}`} onClick={() => setEditing("new")}>
              <Plus size={15} /> {tr("tasks.newTask")}
            </button>
          </div>
        </div>
        {/* Filter row */}
        <div className={`tasks-filter-bar ${css.filterBar}`}>
          <FilterPills value={scope} onChange={setScope} options={[
            { id: "mine", label: tr("tasks.scopeMine"), count: counts.mine },
            { id: "all", label: tr("tasks.scopeAll"), count: counts.all },
          ]} />
          <div className={`tasks-filter-sep ${css.filterSep}`} />
          <SelectChip icon={CalendarIcon} value={filterMeeting} onChange={setFilterMeeting}
            options={[{ value: "all", label: tr("tasks.filterAllMeetings") }, ...meetingOptions.map(m => ({ value: m.id, label: m.title }))]} />
          <SelectChip icon={AlertCircle} value={filterPriority} onChange={setFilterPriority}
            options={[
              { value: "all", label: tr("tasks.filterAnyPriority") },
              { value: "high", label: tr("tasks.priorityHigh") },
              { value: "medium", label: tr("tasks.priorityMedium") },
              { value: "low", label: tr("tasks.priorityLow") },
            ]} />
          {departments.length > 0 && (
            <SelectChip icon={Building2} value={filterDept} onChange={setFilterDept}
              options={[{ value: "all", label: tr("departments.filterAll") }, ...departments.map(d => ({ value: d.id, label: d.name }))]} />
          )}
          {isAdmin && (
            <SelectChip icon={User} value={filterAssignee} onChange={(v) => { setFilterAssignee(v); if (v !== "all") setScope("all"); }}
              options={[{ value: "all", label: tr("tasks.filterAllAssignees") }, ...users.map(u => ({ value: u.id, label: u.name || u.email }))]} />
          )}
          {filterableFields.map(f => (
            <SelectChip key={f.id} icon={SlidersHorizontal} value={customFilters[f.id] ?? "all"}
              onChange={(v) => setCustomFilters(p => ({ ...p, [f.id]: v }))}
              options={[{ value: "all", label: f.name }, ...(f.options?.choices ?? []).map(c => ({ value: c.id, label: c.name }))]} />
          ))}
          <div className={`tasks-search ${css.rel}`}>
            <Search size={14} className={css.searchIcon2} />
            <input placeholder={tr("tasks.searchPlaceholder")} value={q} onChange={e => setQ(e.target.value)}
              className={css.searchInput} />
            {q && <button onClick={() => setQ("")} className={`btn btn-sm ${css.searchClear}`}><X size={12} /></button>}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className={css.body}>
        {error ? (
          <div className={css.errBox}>
            <AlertCircle size={28} style={{ color: "var(--danger, #e5484d)" }} />
            <div className={css.errText}>{tr("tasks.loadError")}</div>
            <button className="btn btn-sm" onClick={() => { setLoading(true); fetchTasks(); }}>{tr("tasks.retry")}</button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState scope={scope} q={q} onCreate={() => setEditing("new")} />
        ) : view === "list" ? (
          <TaskListView tasks={filtered} onEdit={t => setEditing(t)} onStatusChange={handleStatusChange} q={q} mobile={isMobile} departments={departments} onOpenById={openById} onSubtaskChange={patchTaskSubtasks} onQuickCreate={handleQuickCreate} customFields={customFields} members={members} />
        ) : view === "dept" ? (
          <TaskListView tasks={filtered} onEdit={t => setEditing(t)} onStatusChange={handleStatusChange} q={q} mobile={isMobile} groupBy="department" departments={departments} onOpenById={openById} onSubtaskChange={patchTaskSubtasks} onQuickCreate={handleQuickCreate} customFields={customFields} members={members} />
        ) : (
          <KanbanView tasks={filtered} onEdit={t => setEditing(t)} onStatusChange={handleStatusChange} customFields={customFields} members={members} />
        )}
      </div>

      <TaskModal open={!!editing} task={editing === "new" ? null : editing as Task}
        meetings={meetings} users={users} currentUserId={userId} isAdmin={isAdmin}
        customFields={customFields} members={members} onFieldsChanged={refreshFields}
        onClose={() => setEditing(null)} onSaved={handleSaved} onChanged={fetchTasks} onOpenById={openById} />
      </>
      )}
    </div>
  );
}
