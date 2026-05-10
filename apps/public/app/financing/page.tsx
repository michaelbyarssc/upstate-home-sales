import Link from 'next/link';
import { LoanCalculator } from './loan-calculator';

export const metadata = { title: 'Financing' };

type SearchParams = { price?: string };

const PARTNERS = [
  {
    name: 'Vanderbilt Mortgage',
    blurb: 'Largest manufactured-home lender in the country. Strong with first-time buyers.',
    href: 'https://www.vmf.com/',
  },
  {
    name: '21st Mortgage',
    blurb: 'Wide credit-tier coverage, including borrowers rebuilding credit. Quick decisions.',
    href: 'https://www.21stmortgage.com/',
  },
  {
    name: 'Triad Financial Services',
    blurb: 'Land-and-home and chattel options. Good for modular and double-wide buyers.',
    href: 'https://www.triadfs.com/',
  },
];

export default function FinancingPage({ searchParams }: { searchParams: SearchParams }) {
  const initialPrice = searchParams.price ? Number(searchParams.price) : undefined;
  return (
    <main>
      <section className="section" style={{ paddingBottom: 'var(--s-8)' }}>
        <div className="inner section-text">
          <div className="eyebrow">Financing</div>
          <h1 style={{ marginTop: 'var(--s-3)' }}>Three lenders. We&rsquo;ll pick the right fit.</h1>
          <p style={{ fontSize: 'var(--t-body-l)', marginTop: 'var(--s-4)', color: 'var(--c-ink-soft)' }}>
            We work with the largest manufactured-home lenders in the South, plus a couple of regional
            options. We&rsquo;ll point you to the one that actually fits your situation — your credit, your
            land, the home you want — not the one that pays us best. Pre-qualifying takes about 10
            minutes and won&rsquo;t hurt your credit score.
          </p>
        </div>
      </section>

      <section className="section tight" style={{ background: 'var(--c-bg-alt)' }}>
        <div className="inner">
          <div className="feature-grid">
            {PARTNERS.map((p) => (
              <div className="feature" key={p.name}>
                <h3>{p.name}</h3>
                <p>{p.blurb}</p>
                <a className="btn btn-secondary btn-sm" href={p.href} target="_blank" rel="noreferrer noopener" style={{ marginTop: 12 }}>
                  Pre-qualify with {p.name.split(' ')[0]} →
                </a>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 'var(--s-8)', fontSize: 13, color: 'var(--c-ink-mute)', textAlign: 'center' }}>
            We don&rsquo;t store any of your financial information on our side. Pre-qual happens entirely on
            the lender&rsquo;s site.
          </p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 'var(--s-10)', paddingBottom: 'var(--s-10)' }}>
        <div className="inner">
          <LoanCalculator initialPrice={Number.isFinite(initialPrice) ? initialPrice : undefined} />
        </div>
      </section>

      <section className="section">
        <div className="inner section-text">
          <h2>Not sure where to start?</h2>
          <p style={{ fontSize: 'var(--t-body-l)', marginTop: 'var(--s-3)' }}>
            Call (864) 680-4030 or visit a lot. We&rsquo;ll talk through your options for free, no
            commitment. Most folks have a clear answer in about 20 minutes.
          </p>
          <div style={{ marginTop: 'var(--s-6)', display: 'flex', gap: 'var(--s-3)' }}>
            <Link href="/contact" className="btn btn-primary">Schedule a visit</Link>
            <Link href="/inventory" className="btn btn-secondary">Browse homes first</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
