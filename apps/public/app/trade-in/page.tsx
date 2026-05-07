import { TradeInForm } from './trade-in-form';

export const metadata = { title: 'Trade in your home' };

export default function TradeInPage() {
  return (
    <main className="section">
      <div className="inner section-narrow">
        <div className="eyebrow">Trade-in</div>
        <h1 style={{ marginTop: 'var(--s-3)' }}>Trade in your current home.</h1>
        <p style={{ fontSize: 'var(--t-body-l)', marginTop: 'var(--s-4)', color: 'var(--c-ink-soft)' }}>
          Fill out the form with the basics about your current manufactured home. We&rsquo;ll review
          and reach out within a business day with a preliminary offer. No obligation, no haggling.
        </p>
        <div style={{ marginTop: 'var(--s-8)' }}>
          <TradeInForm />
        </div>
      </div>
    </main>
  );
}
