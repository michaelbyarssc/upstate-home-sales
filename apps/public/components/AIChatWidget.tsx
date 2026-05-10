'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, useRef, useEffect, useMemo } from 'react';

/**
 * Phase H — floating chatbot bubble + panel.
 *
 * Conditionally rendered by the public layout based on `org.ai_chat_enabled`.
 * Streams responses from /api/ai/chat via Vercel AI SDK.
 */

export function AIChatWidget({ orgSlug }: { orgSlug?: string | null }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: '/api/ai/chat',
      body: orgSlug ? { org_slug: orgSlug } : undefined,
    }),
    [orgSlug],
  );
  const { messages, sendMessage, status } = useChat({ transport });
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    sendMessage({ text });
    setInput('');
  }

  return (
    <>
      {/* Bubble */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close chat' : 'Ask a question'}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--c-brand, #B9532A)',
          color: '#fff',
          border: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          fontSize: 24,
          cursor: 'pointer',
          zIndex: 9999,
        }}
      >
        {open ? '×' : '💬'}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: 88,
          right: 20,
          width: 360,
          maxHeight: 'min(560px, calc(100vh - 120px))',
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          border: '1px solid var(--c-line, #e5dfd1)',
          borderRadius: 12,
          boxShadow: '0 10px 32px rgba(0,0,0,0.15)',
          zIndex: 9999,
          overflow: 'hidden',
        }}>
          <header style={{
            padding: '12px 16px',
            background: 'var(--c-brand, #B9532A)',
            color: '#fff',
          }}>
            <div style={{ fontWeight: 500, fontSize: 14 }}>Ask us anything</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>We&rsquo;ll find the right home for you.</div>
          </header>

          <div ref={listRef} style={{
            flex: 1,
            overflowY: 'auto',
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            fontSize: 13,
          }}>
            {messages.length === 0 && (
              <div style={{ color: 'var(--c-ink-mute)', fontSize: 12, textAlign: 'center', marginTop: 20 }}>
                Try: &ldquo;Show me 3-bed homes under $80k&rdquo; or &ldquo;What lots are open this weekend?&rdquo;
              </div>
            )}
            {messages.map((m) => {
              const isUser = m.role === 'user';
              const text = m.parts
                ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                .map((p) => p.text)
                .join('\n');
              if (!text) return null;
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    background: isUser ? 'var(--c-brand, #B9532A)' : 'var(--c-bg, #FAF4EB)',
                    color: isUser ? '#fff' : 'var(--c-ink)',
                    padding: '8px 12px',
                    borderRadius: 12,
                    borderBottomRightRadius: isUser ? 2 : 12,
                    borderBottomLeftRadius: isUser ? 12 : 2,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {text}
                </div>
              );
            })}
            {(status === 'submitted' || status === 'streaming') && (
              <div style={{
                alignSelf: 'flex-start',
                color: 'var(--c-ink-mute)',
                fontSize: 12,
                fontStyle: 'italic',
                padding: '4px 8px',
              }}>
                Typing…
              </div>
            )}
          </div>

          <form onSubmit={onSubmit} style={{
            display: 'flex',
            gap: 8,
            padding: 12,
            borderTop: '1px solid var(--c-line, #e5dfd1)',
            background: '#fff',
          }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question…"
              disabled={status === 'submitted' || status === 'streaming'}
              style={{
                flex: 1,
                padding: '8px 10px',
                border: '1px solid var(--c-line, #e5dfd1)',
                borderRadius: 6,
                fontSize: 13,
                background: '#fff',
              }}
            />
            <button
              type="submit"
              disabled={status === 'submitted' || status === 'streaming' || !input.trim()}
              style={{
                background: 'var(--c-brand, #B9532A)',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                opacity: status === 'submitted' || status === 'streaming' || !input.trim() ? 0.5 : 1,
              }}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
