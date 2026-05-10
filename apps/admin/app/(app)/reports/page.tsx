import Link from 'next/link';

export default function ReportsIndexPage() {
  return (
    <>
      <div className="page-header">
        <div className="eyebrow">Workspace · Reports</div>
        <h1>Reports</h1>
        <p>How leads find you and what they do once they&rsquo;re in the funnel.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 24 }}>
        <ReportCard
          href="/reports/sources"
          title="Lead sources"
          desc="UTM and channel breakdown. Find your highest-converting campaigns."
        />
      </div>
    </>
  );
}

function ReportCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        padding: 20,
        background: '#fff',
        border: '1px solid var(--adm-line)',
        borderRadius: 8,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      <p style={{ fontSize: 13, color: 'var(--adm-ink-mute)' }}>{desc}</p>
    </Link>
  );
}
