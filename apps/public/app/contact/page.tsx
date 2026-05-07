import { ContactForm } from './contact-form';

export const metadata = { title: 'Contact' };

export default function ContactPage() {
  return (
    <main className="section">
      <div className="inner" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-12)' }}>
        <div>
          <div className="eyebrow">Contact</div>
          <h1 style={{ marginTop: 'var(--s-3)' }}>Drop us a line.</h1>
          <p style={{ fontSize: 'var(--t-body-l)', marginTop: 'var(--s-4)', color: 'var(--c-ink-soft)' }}>
            Questions about a specific home, a trade-in, or whether we deliver to your county? We&rsquo;ll
            usually answer within a business day. For anything urgent, call us.
          </p>

          <div style={{ marginTop: 'var(--s-8)' }}>
            <h3 style={{ marginBottom: 'var(--s-2)' }}>Phone</h3>
            <p><a href="tel:803-555-0124" style={{ fontSize: 'var(--t-body-l)' }}>(803) 555-0124</a></p>

            <h3 style={{ marginTop: 'var(--s-6)', marginBottom: 'var(--s-2)' }}>Email</h3>
            <p><a href="mailto:hello@upstatehomesales.com" style={{ fontSize: 'var(--t-body-l)' }}>hello@upstatehomesales.com</a></p>

            <h3 style={{ marginTop: 'var(--s-6)', marginBottom: 'var(--s-2)' }}>Lots</h3>
            <p>
              Lexington · 1234 Augusta Hwy<br />
              Anderson · 5678 Clemson Blvd
            </p>
          </div>
        </div>

        <ContactForm />
      </div>
    </main>
  );
}
