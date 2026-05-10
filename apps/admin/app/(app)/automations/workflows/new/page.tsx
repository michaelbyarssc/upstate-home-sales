import Link from 'next/link';
import { createWorkflowRule } from '../actions';

const EVENTS = [
  { value: 'lead.created', label: 'Lead created (new inquiry)' },
  { value: 'lead.stage.changed', label: 'Lead stage changed' },
  { value: 'quote.sent', label: 'Quote sent to buyer' },
  { value: 'quote.signed', label: 'Quote signed by buyer' },
  { value: 'lead.message.received', label: 'Inbound reply received' },
];

export default function NewWorkflowPage() {
  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Link href="/automations/workflows" style={{ color: 'var(--adm-ink-mute)', fontSize: 13, textDecoration: 'none' }}>
          ← Back to workflows
        </Link>
      </div>

      <form action={createWorkflowRule} className="auto-form">
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" required maxLength={120} placeholder="Auto-assign new web leads" />
        </div>

        <div className="field">
          <label htmlFor="event">Event</label>
          <select id="event" name="event" required defaultValue="lead.created">
            {EVENTS.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="filter">Filter (JSON, optional)</label>
          <textarea
            id="filter"
            name="filter"
            placeholder={'{ "source": "quote_form" }'}
            rows={3}
          />
          <span className="hint">
            Only run when the event payload matches all keys. Examples:<br />
            <code>{'{ "stage": "quoted" }'}</code> for stage-changes only when moving to &ldquo;quoted&rdquo;.<br />
            <code>{'{ "utm_source": "google" }'}</code> for leads from Google ads only.
          </span>
        </div>

        <div className="actions">
          <Link href="/automations/workflows" style={{
            background: '#fff', border: '1px solid var(--adm-line)', color: 'var(--adm-ink)',
            padding: '8px 14px', borderRadius: 6, fontSize: 13, textDecoration: 'none',
          }}>Cancel</Link>
          <button type="submit" style={{
            background: 'var(--adm-accent)', color: '#fff',
            border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>Create rule</button>
        </div>
      </form>
    </>
  );
}
