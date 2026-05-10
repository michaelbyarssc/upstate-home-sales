import Link from 'next/link';
import { createCollection } from '../actions';

export default function NewCollectionPage() {
  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Link href="/collections" style={{ color: 'var(--adm-ink-mute)', fontSize: 13, textDecoration: 'none' }}>
          ← Back to collections
        </Link>
      </div>

      <form action={createCollection} style={{
        background: '#fff', border: '1px solid var(--adm-line)', borderRadius: 8,
        padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720,
      }}>
        <div className="field">
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" className="input" required maxLength={120} placeholder="Under $100k" />
        </div>

        <div className="field">
          <label className="label" htmlFor="slug">URL slug (optional)</label>
          <input id="slug" name="slug" className="input" maxLength={60} placeholder="auto-generated from name" />
          <div style={{ fontSize: 12, color: 'var(--adm-ink-mute)', marginTop: 4 }}>
            Becomes <code>/inventory/collection/{'{slug}'}</code> on the public site.
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="description">Description</label>
          <textarea id="description" name="description" className="textarea" rows={3} maxLength={500} placeholder="Optional copy shown on the collection page" />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--adm-line)', paddingTop: 16 }}>
          <Link href="/collections" style={{
            background: '#fff', border: '1px solid var(--adm-line)', color: 'var(--adm-ink)',
            padding: '8px 14px', borderRadius: 6, fontSize: 13, textDecoration: 'none',
          }}>Cancel</Link>
          <button type="submit" style={{
            background: 'var(--adm-accent)', color: '#fff',
            border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>Create collection</button>
        </div>
      </form>
    </>
  );
}
