import Link from 'next/link';

export const metadata = { title: 'Investors' };

const OFFERS = [
  {
    title: 'Volume discount on every home',
    blurb:
      "Tell us how many you're buying. We'll quote a price your contractor can't get walking in solo.",
  },
  {
    title: 'One contact, every manufacturer',
    blurb:
      "Clayton, Cavco, Champion, TruMH, plus regional builders. You don't shop eight catalogs; we do.",
  },
  {
    title: 'Coordinated delivery + setup',
    blurb:
      "Multi-home orders coordinated as one schedule so your sites aren't sitting empty.",
  },
];

const STEPS = [
  {
    title: 'Get in touch',
    blurb: 'Call (864) 680-4030 or use the form. Tell us how many homes and a rough timeline.',
  },
  {
    title: 'We scope the order',
    blurb:
      'We talk through your target spec, your land logistics, and what makes sense from each manufacturer.',
  },
  {
    title: 'We send a written quote',
    blurb:
      'Manufacturer, model, all-in price per home, delivery window. No surprises at signing.',
  },
  {
    title: 'You confirm, we deliver',
    blurb: 'We place the order, manage the schedule, and hand off on the agreed dates.',
  },
];

export default function InvestorsPage() {
  return (
    <main>
      <section className="section" style={{ paddingBottom: 'var(--s-8)' }}>
        <div className="inner section-text">
          <div className="eyebrow">Investors</div>
          <h1 style={{ marginTop: 'var(--s-3)' }}>Volume buyers welcome.</h1>
          <p style={{ fontSize: 'var(--t-body-l)', marginTop: 'var(--s-4)', color: 'var(--c-ink-soft)' }}>
            Portfolio investors, rental operators, and dealers stocking multiple lots — when you&rsquo;re
            buying more than one home, the math changes. We offer quantity discounts on multi-home
            orders, coordinate the whole order under one contact, and line up delivery so your
            sites aren&rsquo;t sitting empty waiting for the next unit. Call us for terms.
          </p>
        </div>
      </section>

      <section className="section tight" style={{ background: 'var(--c-bg-alt)' }}>
        <div className="inner">
          <div className="feature-grid">
            {OFFERS.map((o) => (
              <div className="feature" key={o.title}>
                <h3>{o.title}</h3>
                <p>{o.blurb}</p>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 'var(--s-8)', fontSize: 13, color: 'var(--c-ink-mute)', textAlign: 'center' }}>
            Specific discount depends on quantity, spec, and timing. We&rsquo;ll quote you a real number
            once we know the order.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="inner section-text">
          <div className="eyebrow">How it works</div>
          <h2 style={{ marginTop: 'var(--s-2)' }}>Four steps, no fluff.</h2>
          <ol
            style={{
              listStyle: 'none',
              padding: 0,
              marginTop: 'var(--s-6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--s-5)',
            }}
          >
            {STEPS.map((s, i) => (
              <li key={s.title} style={{ display: 'flex', gap: 'var(--s-4)', alignItems: 'flex-start' }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: '0 0 auto',
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'var(--c-accent)',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 'var(--t-body-l)' }}>{s.title}</h3>
                  <p style={{ margin: '4px 0 0', color: 'var(--c-ink-soft)' }}>{s.blurb}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="inner section-text">
          <h2>Ready to scope your next order?</h2>
          <p style={{ fontSize: 'var(--t-body-l)', marginTop: 'var(--s-3)' }}>
            Tell us how many homes and where they&rsquo;re landing. We&rsquo;ll come back with a written
            quote that respects your timeline.
          </p>
          <div style={{ marginTop: 'var(--s-6)', display: 'flex', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
            <Link href="/contact" className="btn btn-primary">Schedule a call</Link>
            <a href="tel:864-680-4030" className="btn btn-secondary">(864) 680-4030</a>
          </div>
        </div>
      </section>
    </main>
  );
}
