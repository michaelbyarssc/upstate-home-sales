'use client';

import { useState } from 'react';
import { clearReply, replyToReview } from './actions';

type Props = {
  reviewId: string;
  initialReplyText: string | null;
  initialRepliedAt: string | null;
};

export function ReplyForm({ reviewId, initialReplyText, initialRepliedAt }: Props) {
  const [replyText, setReplyText] = useState(initialReplyText ?? '');
  const [repliedAt, setRepliedAt] = useState(initialRepliedAt);
  const [savedText, setSavedText] = useState(initialReplyText);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(!initialReplyText);

  const hasReply = !!savedText;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const r = await replyToReview({ reviewId, replyText });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setSavedText(replyText);
      setRepliedAt(new Date().toISOString());
      setEditing(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function onClear() {
    if (!confirm('Clear this reply? It will be removed from the local record (and from Google on the next sync).')) return;
    setErr(null);
    setSubmitting(true);
    try {
      const r = await clearReply({ reviewId });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setSavedText(null);
      setRepliedAt(null);
      setReplyText('');
      setEditing(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (hasReply && !editing) {
    return (
      <div style={{ marginTop: 10, padding: '8px 12px', background: '#FAF4EB', borderRadius: 4, fontSize: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <strong>Your reply{repliedAt ? ` (${new Date(repliedAt).toLocaleDateString()})` : ''}</strong>
          <span style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setEditing(true)}
              style={{ background: 'none', border: 'none', color: 'var(--adm-accent)', cursor: 'pointer', fontSize: 12, padding: 0 }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={submitting}
              style={{ background: 'none', border: 'none', color: 'var(--adm-ink-mute)', cursor: 'pointer', fontSize: 12, padding: 0 }}
            >
              Clear
            </button>
          </span>
        </div>
        <p style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{savedText}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 10 }}>
      <textarea
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        placeholder="Thanks for the review — we appreciate you stopping by…"
        rows={3}
        maxLength={4000}
        required
        style={{
          width: '100%',
          padding: '8px 10px',
          border: '1px solid var(--adm-line)',
          borderRadius: 6,
          fontSize: 13,
          fontFamily: 'inherit',
          resize: 'vertical',
          minHeight: 64,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--adm-ink-mute)' }}>
          {replyText.length} / 4000 · Saved locally; pushes to Google on the next sync.
        </span>
        <span style={{ display: 'flex', gap: 6 }}>
          {hasReply && (
            <button
              type="button"
              onClick={() => { setReplyText(savedText ?? ''); setEditing(false); setErr(null); }}
              disabled={submitting}
              style={{
                background: 'transparent',
                color: 'var(--adm-ink-mute)',
                border: '1px solid var(--adm-line)',
                padding: '6px 10px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={submitting || !replyText.trim()}
            style={{
              background: 'var(--adm-accent)',
              color: '#fff',
              border: 'none',
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              opacity: submitting || !replyText.trim() ? 0.6 : 1,
            }}
          >
            {submitting ? 'Saving…' : hasReply ? 'Update reply' : 'Reply'}
          </button>
        </span>
      </div>
      {err && (
        <div style={{ marginTop: 6, color: '#a00', fontSize: 12 }}>{err}</div>
      )}
    </form>
  );
}
