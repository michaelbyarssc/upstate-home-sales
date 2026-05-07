import Link from 'next/link';
import { createPublicClient } from '../lib/supabase';
import { HomeCard } from '../components/HomeCard';
import type { PublicHome } from '@uhs/db';

export const revalidate = 300;

export default async function HomePage() {
  const supabase = createPublicClient();
  const { data: featured } = await supabase
    .from('public_homes')
    .select(
      'id, stock_no, name, model, type, beds, baths, sqft, listed_price_cents, starting_from, on_lot_since, is_featured, manufacturer_id, manufacturers(name), public_home_photos(storage_path, sort_order)'
    )
    .order('is_featured', { ascending: false })
    .order('on_lot_since', { ascending: false, nullsFirst: false })
    .limit(6);

  const homes = (featured ?? []) as unknown as PublicHome[];

  return (
    <main>
      <section className="hero">
        <div className="hero-inner">
          <div className="eyebrow">A South Carolina dealer</div>
          <h1>
            Manufactured homes, <em>without the runaround.</em>
          </h1>
          <p>
            Two lots across the Upstate, every major manufacturer, and a price you can trust the
            first time you see it. We don&rsquo;t hide the markup, we don&rsquo;t play with the
            paperwork, and we&rsquo;ll set you up with the right floor plan in an afternoon.
          </p>
          <div className="cta">
            <Link href="/inventory" className="btn btn-primary">Browse inventory</Link>
            <Link href="/financing" className="btn btn-secondary">Financing options</Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="inner">
          <div className="section-head">
            <div className="lhs">
              <div className="eyebrow">Featured listings</div>
              <h2>On the lot this week</h2>
            </div>
            <div className="rhs">
              <Link href="/inventory" className="btn btn-ghost">See all →</Link>
            </div>
          </div>
          {homes.length === 0 ? (
            <p style={{ color: 'var(--c-ink-mute)' }}>No published homes yet — check back soon.</p>
          ) : (
            <div className="inv-grid-public">
              {homes.map((h, i) => (
                <HomeCard key={h.id} home={h} index={i} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section" style={{ background: 'var(--c-bg-alt)' }}>
        <div className="inner">
          <div className="section-head">
            <div className="lhs">
              <div className="eyebrow">Why us</div>
              <h2>The Upstate way of buying a home.</h2>
            </div>
          </div>
          <div className="feature-grid">
            <div className="feature">
              <h3>One price, all in</h3>
              <p>Our listed price is the listed price. Add-ons, setup, and delivery are spelled out before you sign.</p>
            </div>
            <div className="feature">
              <h3>Two lots, real walk-throughs</h3>
              <p>Lexington and Anderson. Come see the home you&rsquo;re buying. We&rsquo;re open seven days.</p>
            </div>
            <div className="feature">
              <h3>Honest financing help</h3>
              <p>We&rsquo;ll point you to the lender that fits your situation, not the one that pays us the most.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
