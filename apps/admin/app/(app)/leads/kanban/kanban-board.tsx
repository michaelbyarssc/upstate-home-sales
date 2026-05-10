'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { createClient } from '@uhs/db/browser';
import { formatCents, type LeadStage } from '@uhs/db';
import { updateLeadStage } from '../[id]/actions';
import type { KanbanCard } from './types';
import './kanban.css';

type Props = { initial: KanbanCard[] };

const COLUMNS: Array<{ key: LeadStage; label: string; tint: string }> = [
  { key: 'new',         label: 'New',         tint: '#dbeafe' },
  { key: 'in_progress', label: 'In progress', tint: '#fef3c7' },
  { key: 'quoted',      label: 'Quoted',      tint: '#e0e7ff' },
  { key: 'won',         label: 'Won',         tint: '#dcfce7' },
  { key: 'lost',        label: 'Lost',        tint: '#f3f4f6' },
];

export function KanbanBoard({ initial }: Props) {
  const [cards, setCards] = useState<KanbanCard[]>(initial);
  const [dragOver, setDragOver] = useState<LeadStage | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Realtime: subscribe to lead inserts and updates so the board stays current
  // when a teammate drags a card or a new lead arrives.
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel('leads-kanban')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        (p) => {
          const row = p.new as unknown as KanbanCard;
          setCards((prev) => (prev.find((c) => c.id === row.id) ? prev : [{ ...row, homes: null }, ...prev]));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads' },
        (p) => {
          const row = p.new as unknown as KanbanCard;
          setCards((prev) => prev.map((c) => (c.id === row.id ? { ...c, ...row, homes: c.homes } : c)));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  function onDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e: React.DragEvent, stage: LeadStage) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOver !== stage) setDragOver(stage);
  }

  function onDragLeave(stage: LeadStage) {
    if (dragOver === stage) setDragOver(null);
  }

  function onDrop(e: React.DragEvent, toStage: LeadStage) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const card = cards.find((c) => c.id === id);
    if (!card || card.stage === toStage) return;

    // Optimistic update.
    const prevStage = card.stage;
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, stage: toStage } : c)));
    setError(null);

    startTransition(async () => {
      try {
        await updateLeadStage(id, toStage);
      } catch (err) {
        // Rollback.
        setCards((prev) => prev.map((c) => (c.id === id ? { ...c, stage: prevStage } : c)));
        setError(err instanceof Error ? err.message : 'Update failed');
      }
    });
  }

  return (
    <div>
      {error && (
        <div style={{ padding: 10, background: '#fee', color: '#a00', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}
      <div className="kanban-board">
        {COLUMNS.map((col) => {
          const inCol = cards.filter((c) => c.stage === col.key);
          const isOver = dragOver === col.key;
          return (
            <div
              key={col.key}
              className={`kanban-col${isOver ? ' over' : ''}`}
              onDragOver={(e) => onDragOver(e, col.key)}
              onDragLeave={() => onDragLeave(col.key)}
              onDrop={(e) => onDrop(e, col.key)}
            >
              <header style={{ background: col.tint }}>
                <h3>{col.label}</h3>
                <span className="count">{inCol.length}</span>
              </header>
              <div className="kanban-cards">
                {inCol.length === 0 ? (
                  <div className="kanban-empty">Drop a card here</div>
                ) : (
                  inCol.map((card) => (
                    <article
                      key={card.id}
                      className="kanban-card"
                      draggable
                      onDragStart={(e) => onDragStart(e, card.id)}
                    >
                      <Link href={`/leads/${card.id}`} className="kanban-card-link">
                        <div className="kanban-card-name">
                          {card.is_hot && <span title="Hot lead" style={{ marginRight: 4 }}>🔥</span>}
                          {card.contact_name}
                        </div>
                        {card.homes ? (
                          <div className="kanban-card-home">
                            {card.homes.name} · {card.homes.stock_no}
                          </div>
                        ) : (
                          <div className="kanban-card-home faint">General inquiry</div>
                        )}
                        <div className="kanban-card-meta">
                          <span className="kanban-pill">{card.source.replace('_', ' ')}</span>
                          {card.homes?.listed_price_cents != null && (
                            <span className="kanban-price">{formatCents(card.homes.listed_price_cents)}</span>
                          )}
                          {!card.assignee_id && <span className="kanban-pill warn">unassigned</span>}
                        </div>
                      </Link>
                    </article>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
