"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { Select } from "@/components/ui/select";
import Link from "next/link";
import {
  ListChecks, Check, Clock, Search, X, Sparkles, ChevronDown,
  MoreHorizontal, User, Loader2, Plus, Trash2, Video,
  LayoutList, LayoutGrid, AlertCircle, Calendar as CalendarIcon, Wand2,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useIsMobile } from "@/lib/use-is-mobile";

/* ─── Types ─────────────────────────────────────────────── */
interface TaskAssignee { id: string; name: string | null; image: string | null; }
interface TaskMeeting { id: string; title: string; scheduledAt: string | null; }
interface Task {
  id: string; title: string; description?: string | null;
  priority: string; status: string; dueDate: string | null;
  assigneeName: string | null; meetingId: string; source?: string;
  assignee: TaskAssignee | null; meeting?: TaskMeeting;
  assigneeId?: string | null; completedAt?: string | null;
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
        ? <mark key={i} style={{ background: "color-mix(in oklab, var(--accent) 35%, transparent)", color: "var(--text)", padding: "0 2px", borderRadius: 3 }}>{p}</mark>
        : p
    )}</>;
  } catch { return <>{text}</>; }
}

/* ─── Status checkbox ───────────────────────────────────── */
function StatusCheckbox({ status, onClick }: { status: string; onClick: (e: React.MouseEvent) => void }) {
  const bg = status === "done" ? "var(--green)" : "transparent";
  const border = status === "done" ? "var(--green)" : status === "in_progress" ? "var(--amber)" : "var(--border)";
  return (
    <button onClick={onClick} title={status} style={{
      width: 20, height: 20, borderRadius: 6, flexShrink: 0, cursor: "pointer",
      background: bg, border: `1.5px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", transition: "all .15s", padding: 0,
    }}>
      {status === "done" && <Check size={13} strokeWidth={3} />}
      {status === "in_progress" && <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--amber)" }} />}
    </button>
  );
}

/* ─── Priority indicators ───────────────────────────────── */
function PriorityDot({ p, size = 7 }: { p: string; size?: number }) {
  const c = p === "high" ? "var(--red)" : p === "medium" ? "var(--amber)" : "var(--muted)";
  return <span style={{ width: size, height: size, borderRadius: "50%", background: c, flexShrink: 0, display: "inline-block" }} />;
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, padding: "2px 7px",
      borderRadius: 5, background: `color-mix(in oklab, ${v.c} 14%, transparent)`, color: v.c, fontWeight: 600 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: v.c }} />{v.l}
    </span>
  );
}

/* ─── Filter Pills ──────────────────────────────────────── */
function FilterPills({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { id: string; label: string; count: number }[];
}) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {options.map(o => {
        const active = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} className="btn btn-sm" style={{
            background: active ? "color-mix(in oklab, var(--accent) 18%, transparent)" : "var(--surface)",
            border: "1px solid " + (active ? "color-mix(in oklab, var(--accent) 40%, transparent)" : "var(--border)"),
            color: active ? "#bfdbfe" : "var(--text-2)", fontWeight: active ? 600 : 500,
          }}>
            {o.label}
            <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 11, fontFamily: "var(--font-mono, monospace)" }}>{o.count}</span>
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

/* ═══════════════════════════════════════════════════════════
   TASK ROW (List view)
   ═══════════════════════════════════════════════════════════ */
function TaskRow({ t, onEdit, onStatusChange, q, last, mobile }: {
  t: Task; onEdit: () => void; onStatusChange: (status: string) => void;
  q: string; last: boolean; mobile?: boolean;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const due = dueInfo(t.dueDate);
  const isOverdue = due?.overdue && t.status !== "done";

  const cycleStatus = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = t.status === "open" ? "in_progress" : t.status === "in_progress" ? "done" : "open";
    onStatusChange(next);
  };

  // Mobile: a stacked card — title on top, then a wrapping meta row. Far more
  // legible on a phone than the desktop single-line row.
  if (mobile) {
    const dueChip = due && (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, padding: "3px 8px", borderRadius: 6,
        background: isOverdue ? "color-mix(in oklab, var(--red) 18%, transparent)" :
                    due.soon ? "color-mix(in oklab, var(--amber) 14%, transparent)" : "var(--surface-2)",
        color: isOverdue ? "#fca5a5" : due.soon ? "#fcd34d" : "var(--text-2)",
        fontWeight: isOverdue ? 600 : 500,
      }}>
        <Clock size={11} /> {dueText(due, tr, locale)}
      </span>
    );
    return (
      <div onClick={onEdit} style={{
        display: "flex", gap: 12, padding: "13px 16px",
        borderBottom: last ? "none" : "1px solid var(--border)",
        borderLeft: isOverdue ? "3px solid var(--red)" : "3px solid transparent",
        paddingLeft: isOverdue ? 13 : 16, cursor: "pointer",
      }}>
        <div style={{ paddingTop: 1 }}><StatusCheckbox status={t.status} onClick={cycleStatus} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
            {t.source === "ai" && <Sparkles size={12} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 3 }} />}
            <div style={{
              fontSize: 14, fontWeight: 500, lineHeight: 1.35, flex: 1, minWidth: 0,
              color: t.status === "done" ? "var(--muted)" : "var(--text)",
              textDecoration: t.status === "done" ? "line-through" : "none",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>
              <Hl text={t.title} q={q} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <PriorityTag p={t.priority} />
            {dueChip}
            {t.assignee ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--muted)", marginLeft: "auto" }}>
                <Avatar name={t.assignee.name || "?"} image={t.assignee.image} size="sm" />
                {(t.assignee.name || "").split(" ")[0]}
              </span>
            ) : t.assigneeName ? (
              <span style={{ fontSize: 11.5, color: "var(--muted)", marginLeft: "auto" }}>{t.assigneeName}</span>
            ) : null}
          </div>
          {t.meeting && t.meetingId && (
            <Link href={`/meetings/${t.meetingId}/report`} onClick={e => e.stopPropagation()} style={{
              display: "inline-flex", alignItems: "center", gap: 4, color: "var(--muted)", textDecoration: "none",
              fontSize: 11.5, marginTop: 8, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              <Video size={11} /> {t.meeting.title}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
      borderBottom: last ? "none" : "1px solid var(--border)",
      borderLeft: isOverdue ? "3px solid var(--red)" : "3px solid transparent",
      paddingLeft: isOverdue ? 13 : 16, transition: "background .15s", cursor: "pointer",
    }}
      onClick={onEdit}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <StatusCheckbox status={t.status} onClick={cycleStatus} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          {t.source === "ai" && <Sparkles size={12} style={{ color: "var(--accent)", flexShrink: 0 }} />}
          <div style={{
            fontSize: 13.5, fontWeight: 500,
            color: t.status === "done" ? "var(--muted)" : "var(--text)",
            textDecoration: t.status === "done" ? "line-through" : "none",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0,
          }}>
            <Hl text={t.title} q={q} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: "var(--muted)", overflow: "hidden" }}>
          {t.meeting && t.meetingId ? (
            <Link href={`/meetings/${t.meetingId}/report`} onClick={e => e.stopPropagation()} style={{
              display: "inline-flex", alignItems: "center", gap: 4, color: "var(--muted)", textDecoration: "none",
              fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260,
            }}>
              <Video size={11} /> {t.meeting.title}
            </Link>
          ) : !t.meetingId ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--muted)", fontSize: 11.5 }}>
              <ListChecks size={11} /> {tr("tasks.standaloneTask")}
            </span>
          ) : null}
        </div>
      </div>
      <PriorityTag p={t.priority} />
      {t.assignee ? (
        <div title={t.assignee.name || ""} style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: 160, flexShrink: 0 }}>
          <Avatar name={t.assignee.name || "?"} image={t.assignee.image} size="sm" />
          <span style={{ fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.assignee.name}</span>
        </div>
      ) : t.assigneeName ? (
        <span title={t.assigneeName} style={{ fontSize: 12, color: "var(--muted)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{t.assigneeName}</span>
      ) : null}
      <div style={{ minWidth: 108, textAlign: "right" }}>
        {due && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, padding: "3px 8px", borderRadius: 6,
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

/* ═══════════════════════════════════════════════════════════
   LIST VIEW
   ═══════════════════════════════════════════════════════════ */
function TaskListView({ tasks, onEdit, onStatusChange, q, mobile }: {
  tasks: Task[]; onEdit: (t: Task) => void; onStatusChange: (id: string, s: string) => void; q: string; mobile?: boolean;
}) {
  const tr = useTranslations();
  const groups = useMemo(() => ({
    open: tasks.filter(t => t.status === "open"),
    in_progress: tasks.filter(t => t.status === "in_progress"),
    done: tasks.filter(t => t.status === "done"),
  }), [tasks]);
  const [collapsedDone, setCollapsedDone] = useState(true);

  const sectionMeta: Record<string, { label: string; color: string }> = {
    open: { label: tr("tasks.statusOpen"), color: "var(--accent)" },
    in_progress: { label: tr("tasks.statusInProgress"), color: "var(--amber)" },
    done: { label: tr("tasks.statusDone"), color: "var(--green)" },
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "18px clamp(14px, 4vw, 28px) 60px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 26 }}>
        {(["open", "in_progress", "done"] as const).map(status => {
          const items = groups[status];
          if (items.length === 0) return null;
          const meta = sectionMeta[status];
          const collapsed = status === "done" && collapsedDone;
          return (
            <section key={status}>
              <button onClick={() => { if (status === "done") setCollapsedDone(c => !c); }}
                disabled={status !== "done"}
                style={{
                  display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
                  background: "transparent", border: "none", padding: 0,
                  cursor: status === "done" ? "pointer" : "default", color: "inherit", width: "100%",
                }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", textTransform: "uppercase", letterSpacing: ".06em" }}>{meta.label}</span>
                <span style={{ fontSize: 11, color: "var(--muted)", background: "var(--surface)", padding: "2px 7px", borderRadius: 5, fontFamily: "var(--font-mono, monospace)" }}>{items.length}</span>
                <div style={{ flex: 1, height: 1, background: "var(--border)", marginLeft: 6 }} />
                {status === "done" && (
                  <span style={{ color: "var(--muted)", fontSize: 11.5, display: "flex", alignItems: "center", gap: 4 }}>
                    {collapsed ? tr("tasks.show") : tr("tasks.hide")}
                    <ChevronDown size={13} style={{ transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform .15s" }} />
                  </span>
                )}
              </button>
              {!collapsed && (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                  {items.map((t, i) => (
                    <TaskRow key={t.id} t={t} onEdit={() => onEdit(t)}
                      onStatusChange={(s) => onStatusChange(t.id, s)} q={q} last={i === items.length - 1} mobile={mobile} />
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

/* ═══════════════════════════════════════════════════════════
   KANBAN VIEW
   ═══════════════════════════════════════════════════════════ */
function KanbanCard({ t, onEdit, onDragStart, dragging }: {
  t: Task; onEdit: () => void; onDragStart: () => void; dragging: boolean;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const due = dueInfo(t.dueDate);
  const isOverdue = due?.overdue && t.status !== "done";
  const isDone = t.status === "done";

  return (
    <div draggable onDragStart={onDragStart} onClick={onEdit}
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderLeft: isOverdue ? "3px solid var(--red)" : "1px solid var(--border)",
        borderRadius: 10, padding: "12px 12px 10px", cursor: "pointer",
        opacity: dragging ? 0.4 : isDone ? 0.7 : 1, transition: "border-color .15s, transform .1s",
        userSelect: "none",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-2, #3f3f46)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "none"; }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
        <PriorityDot p={t.priority} size={8} />
        {t.source === "ai" && <Sparkles size={11} style={{ color: "var(--accent)", marginTop: 2 }} />}
        <div style={{
          fontSize: 13, lineHeight: 1.4, fontWeight: 500, flex: 1, minWidth: 0,
          color: isDone ? "var(--muted)" : "var(--text)",
          textDecoration: isDone ? "line-through" : "none",
        }}>{t.title}</div>
      </div>
      {t.meeting && t.meetingId ? (
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--muted)", fontSize: 11.5, marginBottom: 10,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <Video size={11} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.meeting.title}</span>
        </div>
      ) : !t.meetingId ? (
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--muted)", fontSize: 11.5, marginBottom: 10 }}>
          <ListChecks size={11} /> {tr("tasks.standaloneTask")}
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {t.assignee ? <Avatar name={t.assignee.name || "?"} image={t.assignee.image} size="sm" /> : <span />}
        {due && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 7px", borderRadius: 5,
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

function KanbanView({ tasks, onEdit, onStatusChange }: {
  tasks: Task[]; onEdit: (t: Task) => void; onStatusChange: (id: string, s: string) => void;
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
    <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", padding: "18px clamp(14px, 4vw, 28px) 28px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(260px, 1fr))", gap: 14, height: "100%", minWidth: 840 }}>
        {cols.map(col => (
          <div key={col.id} style={{
            display: "flex", flexDirection: "column", minHeight: 0,
            background: "var(--bg, #0f1117)", border: "1px solid " + (hoverCol === col.id ? "color-mix(in oklab, var(--accent) 45%, var(--border))" : "var(--border)"),
            borderRadius: 14, padding: "14px", transition: "border-color .15s",
          }}
            onDragOver={e => { e.preventDefault(); setHoverCol(col.id); }}
            onDragLeave={() => setHoverCol(c => c === col.id ? null : c)}
            onDrop={() => onDrop(col.id)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "2px 4px" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: col.color }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>{col.label}</span>
              <span style={{ fontSize: 11, color: "var(--muted)", background: "var(--surface)", padding: "2px 7px", borderRadius: 5, fontFamily: "var(--font-mono, monospace)" }}>
                {(grouped[col.id] || []).length}
              </span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 4, paddingBottom: 14 }}>
              {(grouped[col.id] || []).length === 0 ? (
                <div style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: "24px 14px", textAlign: "center", color: "var(--muted)", fontSize: 12.5 }}>
                  {tr("tasks.dropTaskHere")}
                </div>
              ) : (grouped[col.id] || []).map(t => (
                <KanbanCard key={t.id} t={t} onEdit={() => onEdit(t)}
                  onDragStart={() => setDragId(t.id)} dragging={dragId === t.id} />
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
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div style={{ textAlign: "center", maxWidth: 380 }}>
        <div style={{ width: 88, height: 88, borderRadius: "50%", background: "var(--surface)", border: "1px dashed var(--border)",
          display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
          <ListChecks size={36} style={{ color: "var(--muted)" }} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6, letterSpacing: "-0.01em" }}>
          {q ? tr("tasks.emptyNoResultsTitle") : scope === "mine" ? tr("tasks.emptyMineTitle") : tr("tasks.emptyAllTitle")}
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.55, marginBottom: 18 }}>
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
function TaskModal({ open, task, meetings, users, onClose, onSaved }: {
  open: boolean; task: Task | null; meetings: MeetingOption[]; users: UserItem[];
  onClose: () => void; onSaved: () => void;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const isNew = !task;
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [meetingId, setMeetingId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("open");
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingQ, setMeetingQ] = useState("");
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title); setDesc(task.description || "");
      setMeetingId(task.meetingId); setAssigneeId(task.assigneeId || task.assignee?.id || "");
      setPriority(task.priority); setDueDate(task.dueDate ? task.dueDate.slice(0, 10) : "");
      setStatus(task.status);
    } else {
      setTitle(""); setDesc(""); setMeetingId("");
      setAssigneeId(""); setPriority("medium"); setDueDate(""); setStatus("open");
    }
    setMeetingOpen(false); setAssigneeOpen(false); setMeetingQ("");
  }, [open, task?.id]);

  if (!open) return null;

  const valid = title.trim().length >= 3;
  const meeting = meetings.find(m => m.id === meetingId);
  const assignee = users.find(u => u.id === assigneeId);
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
    setSaving(true);
    try {
      if (isNew) {
        await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description: desc || null, meetingId: meetingId || null, assigneeId: assigneeId || null, priority, dueDate: dueDate || null }),
        });
      } else {
        await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: task!.id, title, description: desc || null, meetingId: meetingId || null, assigneeId: assigneeId || null, priority, dueDate: dueDate || null, status }),
        });
      }
      onSaved();
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!task) return;
    setSaving(true);
    try {
      await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id }),
      });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(8,10,14,.55)", backdropFilter: "blur(6px)",
      zIndex: 950, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--card, #181a20)", border: "1px solid var(--border)", borderRadius: 18,
        width: 600, maxWidth: "100%", maxHeight: "92vh", display: "flex", flexDirection: "column",
        boxShadow: "0 40px 80px -10px rgba(0,0,0,.7)",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "color-mix(in oklab, var(--accent) 18%, transparent)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ListChecks size={15} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{isNew ? tr("tasks.newTask") : tr("tasks.editTask")}</div>
          {!isNew && task?.source === "ai" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", borderRadius: 6,
              background: "color-mix(in oklab, var(--accent) 14%, transparent)", color: "#bfdbfe" }}>
              <Sparkles size={10} /> AI
            </span>
          )}
          <button className="btn btn-sm" style={{ marginLeft: "auto", padding: "4px 6px" }} onClick={onClose}><X size={15} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 22px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
            placeholder={tr("tasks.titlePlaceholder")}
            style={{ fontSize: 17, fontWeight: 600, background: "transparent", border: "none", padding: "4px 0",
              borderBottom: "1px solid var(--border)", borderRadius: 0, outline: "none", color: "var(--text)", width: "100%" }} />

          <div style={{ position: "relative" }}>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
              placeholder={tr("tasks.descriptionPlaceholder")}
              style={{ resize: "vertical", fontSize: 13, lineHeight: 1.55, background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "10px 12px", paddingRight: 42, outline: "none", color: "var(--text)", width: "100%" }} />
            <button
              onClick={generateDesc}
              disabled={aiLoading || title.trim().length < 3}
              title={desc.trim() ? tr("tasks.aiRegenerateDescription") : tr("tasks.aiGenerateDescription")}
              style={{
                position: "absolute", top: 8, right: 8,
                width: 30, height: 30, borderRadius: 8, border: "none", cursor: aiLoading || title.trim().length < 3 ? "not-allowed" : "pointer",
                background: aiLoading ? "color-mix(in oklab, var(--accent) 25%, transparent)" : "color-mix(in oklab, var(--accent) 12%, transparent)",
                color: title.trim().length < 3 ? "var(--muted)" : "var(--accent)",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all .2s", opacity: title.trim().length < 3 ? 0.4 : 1,
                padding: 0,
              }}
              onMouseEnter={e => { if (!aiLoading && title.trim().length >= 3) e.currentTarget.style.background = "color-mix(in oklab, var(--accent) 30%, transparent)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = aiLoading ? "color-mix(in oklab, var(--accent) 25%, transparent)" : "color-mix(in oklab, var(--accent) 12%, transparent)"; }}
            >
              {aiLoading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Wand2 size={14} />}
            </button>
          </div>

          {/* Meeting picker */}
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 6 }}>{tr("tasks.meeting")}</label>
            <button onClick={() => setMeetingOpen(o => !o)} className="btn" style={{
              width: "100%", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10,
              background: "var(--surface)", border: "1px solid var(--border)",
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                {meetingId ? <Video size={13} style={{ color: "var(--muted)" }} /> : <ListChecks size={13} style={{ color: "var(--muted)" }} />}
                <span style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {meeting?.title || (meetingId ? tr("tasks.selectMeeting") : tr("tasks.noMeeting"))}
                </span>
              </span>
              <ChevronDown size={14} style={{ color: "var(--muted)", transform: meetingOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            </button>
            {meetingOpen && (
              <div style={{ marginTop: 6, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--card, #181a20)" }}>
                <div style={{ position: "relative" }}>
                  <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
                  <input autoFocus placeholder={tr("tasks.searchMeeting")} value={meetingQ} onChange={e => setMeetingQ(e.target.value)}
                    style={{ paddingLeft: 32, border: "none", borderBottom: "1px solid var(--border)", borderRadius: 0, height: 34,
                      background: "transparent", outline: "none", color: "var(--text)", width: "100%", fontSize: 13 }} />
                </div>
                <div style={{ maxHeight: 200, overflowY: "auto" }}>
                  <button onClick={() => { setMeetingId(""); setMeetingOpen(false); setMeetingQ(""); }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "8px 12px",
                      background: !meetingId ? "var(--surface)" : "transparent", border: "none", cursor: "pointer", color: "inherit", textAlign: "left",
                      borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
                    onMouseLeave={e => (e.currentTarget.style.background = !meetingId ? "var(--surface)" : "transparent")}
                  >
                    <span style={{ fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
                      <ListChecks size={12} /> {tr("tasks.noMeeting")}
                    </span>
                    {!meetingId && <Check size={13} style={{ color: "var(--accent)" }} />}
                  </button>
                  {meetingMatches.map(m => (
                    <button key={m.id} onClick={() => { setMeetingId(m.id); setMeetingOpen(false); setMeetingQ(""); }}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "8px 12px",
                        background: m.id === meetingId ? "var(--surface)" : "transparent", border: "none", cursor: "pointer", color: "inherit", textAlign: "left" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
                      onMouseLeave={e => (e.currentTarget.style.background = m.id === meetingId ? "var(--surface)" : "transparent")}
                    >
                      <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>{m.title}</span>
                      {m.scheduledAt && <span style={{ fontSize: 10.5, color: "var(--muted)", marginLeft: 8, fontFamily: "var(--font-mono, monospace)" }}>
                        {new Date(m.scheduledAt).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                      </span>}
                    </button>
                  ))}
                  {meetingMatches.length === 0 && <div style={{ padding: "12px", color: "var(--muted)", fontSize: 13, textAlign: "center" }}>{tr("tasks.nothingFound")}</div>}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* Assignee */}
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 6 }}>{tr("tasks.assignee")}</label>
              <button onClick={() => setAssigneeOpen(o => !o)} className="btn" style={{
                width: "100%", justifyContent: "space-between", padding: "8px 12px", borderRadius: 10,
                background: "var(--surface)", border: "1px solid var(--border)",
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {assignee ? (
                    <><Avatar name={assignee.name} image={assignee.image} size="sm" /><span style={{ fontSize: 13 }}>{assignee.name}</span></>
                  ) : (
                    <><User size={13} style={{ color: "var(--muted)" }} /><span style={{ fontSize: 13, color: "var(--muted)" }}>{tr("tasks.unassigned")}</span></>
                  )}
                </span>
                <ChevronDown size={14} style={{ color: "var(--muted)" }} />
              </button>
              {assigneeOpen && (
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", top: 6, left: 0, right: 0, background: "var(--card, #181a20)", border: "1px solid var(--border)",
                    borderRadius: 10, padding: 6, zIndex: 10, maxHeight: 220, overflowY: "auto", boxShadow: "0 12px 30px -8px rgba(0,0,0,.5)" }}>
                    <button onClick={() => { setAssigneeId(""); setAssigneeOpen(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", width: "100%", background: "transparent",
                        border: "none", cursor: "pointer", color: "inherit", borderRadius: 6, textAlign: "left" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <User size={13} style={{ color: "var(--muted)" }} />
                      <span style={{ fontSize: 13, color: "var(--muted)" }}>{tr("tasks.unassigned")}</span>
                    </button>
                    {users.map(u => (
                      <button key={u.id} onClick={() => { setAssigneeId(u.id); setAssigneeOpen(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", width: "100%", background: "transparent",
                          border: "none", cursor: "pointer", color: "inherit", borderRadius: 6, textAlign: "left" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <Avatar name={u.name} image={u.image} size="sm" />
                        <span style={{ fontSize: 13 }}>{u.name}</span>
                        {u.id === assigneeId && <Check size={13} style={{ marginLeft: "auto", color: "var(--accent)" }} />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* Due date */}
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 6 }}>{tr("tasks.dueDate")}</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                style={{ height: 38, padding: "0 12px", fontSize: 13, borderRadius: 10, background: "var(--surface)",
                  border: "1px solid var(--border)", color: "var(--text)", outline: "none", width: "100%" }} />
            </div>
          </div>

          {/* Priority */}
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 6 }}>{tr("tasks.priority")}</label>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { id: "high", label: tr("tasks.priorityHigh"), c: "var(--red)" },
                { id: "medium", label: tr("tasks.priorityMedium"), c: "var(--amber)" },
                { id: "low", label: tr("tasks.priorityLow"), c: "var(--muted)" },
              ].map(p => {
                const active = priority === p.id;
                return (
                  <button key={p.id} onClick={() => setPriority(p.id)} className="btn btn-sm" style={{
                    flex: 1, justifyContent: "center",
                    background: active ? `color-mix(in oklab, ${p.c} 18%, transparent)` : "var(--surface)",
                    border: "1px solid " + (active ? `color-mix(in oklab, ${p.c} 50%, transparent)` : "var(--border)"),
                    color: active ? p.c : "var(--text-2)", fontWeight: active ? 600 : 500,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.c }} /> {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status (edit only) */}
          {!isNew && (
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 6 }}>{tr("tasks.status")}</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  { id: "open", label: tr("tasks.statusOpenSingular"), c: "var(--accent)" },
                  { id: "in_progress", label: tr("tasks.statusInProgress"), c: "var(--amber)" },
                  { id: "done", label: tr("tasks.statusDone"), c: "var(--green)" },
                ].map(s => {
                  const active = status === s.id;
                  return (
                    <button key={s.id} onClick={() => setStatus(s.id)} className="btn btn-sm" style={{
                      flex: 1, justifyContent: "center",
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
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          {!isNew && (
            <button className="btn btn-sm" onClick={handleDelete} disabled={saving}
              style={{ color: "var(--red)", borderColor: "color-mix(in oklab, var(--red) 30%, transparent)" }}>
              <Trash2 size={13} /> {tr("common.delete")}
            </button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn" onClick={onClose}>{tr("common.cancel")}</button>
            <button className="btn btn-primary" disabled={!valid || saving} onClick={save}
              style={{ opacity: valid && !saving ? 1 : 0.5, fontWeight: 600 }}>
              {saving ? <Loader2 size={14} className="spin" /> : null}
              {isNew ? tr("tasks.createTask") : tr("common.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */
export default function TasksPage() {
  const tr = useTranslations();
  const { data: session } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [meetings, setMeetings] = useState<MeetingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [scope, setScope] = useState("mine");
  const [filterMeeting, setFilterMeeting] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Task | null | "new">(null);

  const isAdmin = session?.user?.role === "admin";
  const userId = session?.user?.id;
  const isMobile = useIsMobile();

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks?scope=all");
      if (res.ok) setTasks(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchTasks();
    fetch("/api/users").then(r => r.json()).then(d => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/meetings").then(r => r.json()).then((data: any[]) => {
      setMeetings(data.map(m => ({ id: m.id, title: m.title, scheduledAt: m.scheduledAt })));
    }).catch(() => {});
    setLoading(false);
  }, []);

  const filtered = useMemo(() => tasks.filter(t => {
    if (scope === "mine" && t.assignee?.id !== userId && t.assigneeId !== userId) return false;
    if (filterMeeting !== "all" && t.meetingId !== filterMeeting) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterAssignee !== "all" && t.assignee?.id !== filterAssignee && t.assigneeId !== filterAssignee) return false;
    if (q) {
      const low = q.toLowerCase();
      if (!t.title.toLowerCase().includes(low) && !(t.description || "").toLowerCase().includes(low)) return false;
    }
    return true;
  }), [tasks, scope, filterMeeting, filterPriority, filterAssignee, q, userId]);

  const meetingOptions = useMemo(() => {
    const ids = [...new Set(tasks.map(t => t.meetingId))];
    return ids.map(id => meetings.find(m => m.id === id)).filter(Boolean) as MeetingOption[];
  }, [tasks, meetings]);

  const counts = useMemo(() => ({
    mine: tasks.filter(t => t.assignee?.id === userId || t.assigneeId === userId).length,
    all: tasks.length,
  }), [tasks, userId]);

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    await fetch("/api/tasks", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, status: newStatus }),
    });
  };

  const handleSaved = () => {
    setEditing(null);
    fetchTasks();
  };

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loader2 size={24} className="spin" style={{ color: "var(--muted)" }} />
    </div>
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "18px clamp(14px, 4vw, 28px) 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>{tr("tasks.pageTitle")}</h1>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{tr("tasks.pageSubtitle")}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 3 }}>
              <button onClick={() => setView("list")} className="btn btn-sm" style={{
                background: view === "list" ? "var(--surface-2, #2a2a32)" : "transparent",
                border: "none", borderRadius: 7, fontWeight: view === "list" ? 600 : 500,
              }}><LayoutList size={14} /> {tr("tasks.viewList")}</button>
              <button onClick={() => setView("kanban")} className="btn btn-sm" style={{
                background: view === "kanban" ? "var(--surface-2, #2a2a32)" : "transparent",
                border: "none", borderRadius: 7, fontWeight: view === "kanban" ? 600 : 500,
              }}><LayoutGrid size={14} /> {tr("tasks.viewKanban")}</button>
            </div>
            <button className="btn btn-primary" onClick={() => setEditing("new")} style={{ fontWeight: 600 }}>
              <Plus size={15} /> {tr("tasks.newTask")}
            </button>
          </div>
        </div>
        {/* Filter row */}
        <div className="tasks-filter-bar" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <FilterPills value={scope} onChange={setScope} options={[
            { id: "mine", label: tr("tasks.scopeMine"), count: counts.mine },
            { id: "all", label: tr("tasks.scopeAll"), count: counts.all },
          ]} />
          <div className="tasks-filter-sep" style={{ width: 1, height: 24, background: "var(--border)" }} />
          <SelectChip icon={CalendarIcon} value={filterMeeting} onChange={setFilterMeeting}
            options={[{ value: "all", label: tr("tasks.filterAllMeetings") }, ...meetingOptions.map(m => ({ value: m.id, label: m.title }))]} />
          <SelectChip icon={AlertCircle} value={filterPriority} onChange={setFilterPriority}
            options={[
              { value: "all", label: tr("tasks.filterAnyPriority") },
              { value: "high", label: tr("tasks.priorityHigh") },
              { value: "medium", label: tr("tasks.priorityMedium") },
              { value: "low", label: tr("tasks.priorityLow") },
            ]} />
          {isAdmin && (
            <SelectChip icon={User} value={filterAssignee} onChange={(v) => { setFilterAssignee(v); if (v !== "all") setScope("all"); }}
              options={[{ value: "all", label: tr("tasks.filterAllAssignees") }, ...users.map(u => ({ value: u.id, label: u.name || u.email }))]} />
          )}
          <div className="tasks-search" style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
            <input placeholder={tr("tasks.searchPlaceholder")} value={q} onChange={e => setQ(e.target.value)}
              style={{ paddingLeft: 34, height: 34, fontSize: 13, width: "100%", background: "var(--surface)",
                border: "1px solid var(--border)", borderRadius: 8, outline: "none", color: "var(--text)" }} />
            {q && <button onClick={() => setQ("")} className="btn btn-sm" style={{ position: "absolute", right: 4, top: 4, width: 26, height: 26, padding: 0 }}><X size={12} /></button>}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {filtered.length === 0 ? (
          <EmptyState scope={scope} q={q} onCreate={() => setEditing("new")} />
        ) : view === "list" ? (
          <TaskListView tasks={filtered} onEdit={t => setEditing(t)} onStatusChange={handleStatusChange} q={q} mobile={isMobile} />
        ) : (
          <KanbanView tasks={filtered} onEdit={t => setEditing(t)} onStatusChange={handleStatusChange} />
        )}
      </div>

      <TaskModal open={!!editing} task={editing === "new" ? null : editing as Task}
        meetings={meetings} users={users} onClose={() => setEditing(null)} onSaved={handleSaved} />
    </div>
  );
}
