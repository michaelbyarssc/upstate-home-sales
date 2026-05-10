import Link from 'next/link';
import { headers } from 'next/headers';
import './automations.css';

export default function AutomationsLayout({ children }: { children: React.ReactNode }) {
  // Read the current pathname from headers so we can mark the right tab active.
  // The /admin app sets x-pathname via middleware; fall back to a referer parse.
  const h = headers();
  const pathname = h.get('x-pathname') ?? h.get('next-url') ?? '';

  const isCampaigns = pathname.includes('/automations/campaigns');
  const isWorkflows = pathname.includes('/automations/workflows');

  return (
    <>
      <div className="page-header">
        <div className="eyebrow">Workspace · Automations</div>
        <h1>Automations</h1>
        <p>Drip campaigns and event-triggered rules. Engines run automatically once active.</p>
      </div>

      <nav className="auto-tabs" aria-label="Automations sections">
        <Link
          href="/automations/campaigns"
          className={isCampaigns || (!isCampaigns && !isWorkflows) ? 'active' : ''}
        >
          Drip campaigns
        </Link>
        <Link
          href="/automations/workflows"
          className={isWorkflows ? 'active' : ''}
        >
          Workflow rules
        </Link>
      </nav>

      {children}
    </>
  );
}
