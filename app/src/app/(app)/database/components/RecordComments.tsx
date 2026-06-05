'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Trash2, Send, MessageSquare } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

type Comment = {
  id: string;
  body: string;
  authorName: string | null;
  userId: string | null;
  createdAt: string;
  canDelete: boolean;
};

/** Comments thread for a single record — fetched lazily from /api/rows/[id]/comments. */
export function RecordComments({ rowId, autoFocus }: { rowId: string; autoFocus?: boolean }) {
  const t = useTranslations('database');
  const locale = useLocale();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/rows/${rowId}/comments`)
      .then((r) => (r.ok ? r.json() : { comments: [] }))
      .then((d) => { if (alive) { setComments(d.comments ?? []); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [rowId]);

  useEffect(() => { if (autoFocus && !loading) taRef.current?.focus(); }, [autoFocus, loading]);

  async function post() {
    const text = body.trim();
    if (!text || posting) return;
    setPosting(true);
    const res = await fetch(`/api/rows/${rowId}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }),
    });
    setPosting(false);
    if (res.ok) { const c: Comment = await res.json(); setComments((cs) => [...cs, c]); setBody(''); }
  }
  async function remove(id: string) {
    setComments((cs) => cs.filter((c) => c.id !== id));
    await fetch(`/api/rows/${rowId}/comments/${id}`, { method: 'DELETE' });
  }

  const fmt = (iso: string) => {
    try { return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; }
  };
  const initial = (name: string | null) => (name?.trim()?.[0] ?? '?').toUpperCase();

  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600 }}>
        <MessageSquare size={14} /> {t('comments')}{comments.length ? ` · ${comments.length}` : ''}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 14 }}><Spinner size={16} /></div>
      ) : comments.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 12.5, marginBottom: 12 }}>{t('noComments')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
          {comments.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 9 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--surface-2)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {initial(c.authorName)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{c.authorName || t('untitled')}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt(c.createdAt)}</span>
                  {c.canDelete && (
                    <button onClick={() => remove(c.id)} title={t('deleteComment')} aria-label={t('deleteComment')} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex', padding: 2 }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 2 }}>{c.body}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={taRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); post(); } }}
          placeholder={t('commentPlaceholder')}
          rows={1}
          style={{ flex: 1, resize: 'none', minHeight: 38, maxHeight: 120, padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', font: 'inherit', fontSize: 13, outline: 'none' }}
        />
        <button
          onClick={post}
          disabled={!body.trim() || posting}
          aria-label={t('sendComment')}
          title={t('sendComment')}
          style={{ width: 38, height: 38, flexShrink: 0, border: 'none', borderRadius: 8, background: body.trim() ? 'var(--accent)' : 'var(--surface-2)', color: body.trim() ? '#fff' : 'var(--muted)', cursor: body.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {posting ? <Spinner size={15} /> : <Send size={15} />}
        </button>
      </div>
    </div>
  );
}
