export const metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <main className="section">
      <div className="inner section-text">
        <div className="eyebrow">About</div>
        <h1 style={{ marginTop: 'var(--s-3)' }}>A family business, two lots, plain talk.</h1>
        <p style={{ fontSize: 'var(--t-body-l)', marginTop: 'var(--s-5)' }}>
          Upstate Home Sales has been selling manufactured and modular homes in the South Carolina
          Upstate since 1998. We started in Lexington with a single lot and a single Clayton
          dealer agreement. Today we run two lots and carry every major manufacturer that ships into
          the state.
        </p>
        <p style={{ fontSize: 'var(--t-body-l)' }}>
          The reason we&rsquo;re still here, two decades in, is simple: we tell people the truth
          about pricing. The base price is the base price. Our markup is built into the listed
          price you see online. Setup, delivery, and add-ons are itemized. There&rsquo;s no
          &ldquo;dealer prep fee&rdquo; that materializes at signing.
        </p>
        <p style={{ fontSize: 'var(--t-body-l)' }}>
          If you&rsquo;re shopping around and getting numbers that move every time you ask — that&rsquo;s
          how you know to come see us.
        </p>

        <h2 style={{ marginTop: 'var(--s-12)' }}>Find us</h2>
        <div className="feature-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 'var(--s-6)' }}>
          <div className="feature">
            <h3>Lexington Lot</h3>
            <p>1234 Augusta Hwy<br />Lexington, SC 29073<br /><br />Mon–Sat 9–6, Sun 12–5</p>
          </div>
          <div className="feature">
            <h3>Anderson Lot</h3>
            <p>5678 Clemson Blvd<br />Anderson, SC 29621<br /><br />Mon–Sat 9–6, Sun 12–5</p>
          </div>
        </div>
      </div>
    </main>
  );
}
