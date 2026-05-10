'use client';

import { useState, useTransition } from 'react';
import type { Org } from '@uhs/db';
import { saveAiSettings } from './actions';

export function AiSettingsForm({ initial }: { initial: Org }) {
  const [enabled, setEnabled] = useState(initial.ai_chat_enabled);
  const [cap, setCap] = useState(initial.ai_daily_token_cap);
  const [faq, setFaq] = useState(initial.faq_markdown ?? '');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      try {
        await saveAiSettings({
          ai_chat_enabled: enabled,
          ai_daily_token_cap: cap,
          faq_markdown: faq.trim() || null,
        });
        setMsg({ kind: 'success', text: 'Saved.' });
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Save failed' });
      }
    });
  }

  return (
    <form onSubmit={save} className="card" style={{ maxWidth: 800 }}>
      <div className="card-body">
        <div className="field">
          <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>Enable AI chatbot on the public site</span>
          </label>
          <div className="help">
            When on, a floating chat bubble appears bottom-right of every public page.
            The bot can search inventory and capture leads via tool calls.
            Requires <code>AI_GATEWAY_API_KEY</code> in Vercel env.
          </div>
        </div>

        <div className="field">
          <label className="label">Daily token cap</label>
          <div className="input-suffix">
            <input
              className="input"
              type="number"
              min={0}
              step={1000}
              value={cap}
              onChange={(e) => setCap(Number(e.target.value || 0))}
            />
            <span className="sx">tokens / day</span>
          </div>
          <div className="help">
            Cost guardrail. Sonnet at ~$3/M input + $15/M output ≈ $1.50 per 100k tokens.
            Set to 0 for unlimited (not recommended).
          </div>
        </div>

        <div className="field">
          <label className="label">FAQ / context (markdown)</label>
          <textarea
            className="textarea"
            rows={10}
            value={faq}
            onChange={(e) => setFaq(e.target.value)}
            placeholder="## What financing do you offer?
We work with chattel + land-home lenders.

## Do you deliver?
Within 90 miles of Spartanburg, included in the price."
          />
          <div className="help">
            Appended to the bot&rsquo;s system prompt. Use it to answer common questions
            without sending the bot to grep your website.
          </div>
        </div>

        {msg && (
          <div style={{
            padding: 10, borderRadius: 4, fontSize: 13, marginTop: 8,
            background: msg.kind === 'success' ? '#e6efe2' : '#faf0ee',
            color: msg.kind === 'success' ? '#4a6b3f' : '#a53a2c',
          }}>{msg.text}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="submit" disabled={pending} style={{
            background: 'var(--adm-accent)', color: '#fff',
            border: 'none', padding: '9px 16px', borderRadius: 6,
            fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: pending ? 0.7 : 1,
          }}>
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  );
}
