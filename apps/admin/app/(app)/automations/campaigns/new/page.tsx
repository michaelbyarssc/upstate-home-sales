import Link from 'next/link';
import { createCampaign } from '../actions';

const TRIGGER_EVENTS = [
  { value: '', label: 'Manual only (no auto-enrollment)' },
  { value: 'lead.created', label: 'When a lead is created' },
  { value: 'lead.stage.changed', label: 'When a lead\'s stage changes' },
  { value: 'quote.sent', label: 'When a quote is sent' },
  { value: 'quote.signed', label: 'When a quote is signed' },
];

export default function NewCampaignPage() {
  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Link href="/automations/campaigns" style={{ color: 'var(--adm-ink-mute)', fontSize: 13, textDecoration: 'none' }}>
          ← Back to campaigns
        </Link>
      </div>

      <form action={createCampaign} className="auto-form">
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" required maxLength={120} placeholder="First-touch follow-up" />
        </div>

        <div className="field">
          <label htmlFor="description">Description</label>
          <input id="description" name="description" type="text" maxLength={500} placeholder="Optional internal note" />
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="channel">Channel</label>
            <select id="channel" name="channel" defaultValue="email">
              <option value="email">Email</option>
              <option value="sms">SMS (only sent to leads with consent)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="trigger_event">Auto-enroll trigger</label>
            <select id="trigger_event" name="trigger_event" defaultValue="">
              {TRIGGER_EVENTS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="trigger_filter">Trigger filter (JSON, optional)</label>
          <textarea
            id="trigger_filter"
            name="trigger_filter"
            placeholder={'{ "source": "quote_form" }'}
            rows={3}
          />
          <span className="hint">
            Only enroll leads that match. Example: <code>{'{ "source": "quote_form" }'}</code> only enrolls quote-form leads.
            Leave empty to enroll every triggering lead.
          </span>
        </div>

        <div className="actions">
          <Link href="/automations/campaigns" style={{
            background: '#fff', border: '1px solid var(--adm-line)', color: 'var(--adm-ink)',
            padding: '8px 14px', borderRadius: 6, fontSize: 13, textDecoration: 'none',
          }}>Cancel</Link>
          <button type="submit" style={{
            background: 'var(--adm-accent)', color: '#fff',
            border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>Create campaign</button>
        </div>
      </form>
    </>
  );
}
