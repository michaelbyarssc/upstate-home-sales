export default function DashboardPage() {
  return (
    <>
      <div className="page-header">
        <div className="eyebrow">Week 1 · Foundation</div>
        <h1>Dashboard</h1>
        <p>
          The bones are in. Auth, multi-tenant RLS, the org switcher, and the cookie + header
          plumbing for active-org are wired. Real widgets land in Week 2 (inventory) and Week 4
          (leads).
        </p>
      </div>
      <div className="placeholder">
        <strong>Coming in Week 2.</strong> Inventory KPIs, recent leads, sale pipeline.
      </div>
    </>
  );
}
