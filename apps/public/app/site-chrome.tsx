import Link from 'next/link';

export function SiteHeader() {
  return (
    <>
      <div className="uhs-topbar">
        <div className="uhs-topbar-inner">
          <span>Serving South Carolina and North Carolina</span>
          <span className="spacer" />
          <a href="tel:864-680-4030" className="phone">
            (864) 680-4030
          </a>
        </div>
      </div>
      <header className="uhs-nav">
        <div className="uhs-nav-inner">
          <Link href="/" className="uhs-brand">
            <span className="name">
              Upstate Home <em>Center</em>
            </span>
            <span className="tag">South Carolina</span>
          </Link>
          <nav className="uhs-nav-links">
            <Link href="/inventory">Inventory</Link>
            <Link href="/financing">Financing</Link>
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
          </nav>
          <span className="spacer" />
          <div className="uhs-nav-cta">
            <Link href="/inventory" className="btn btn-primary btn-sm">
              Browse homes
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="uhs-footer">
      <div className="uhs-footer-inner">
        <div className="uhs-footer-grid">
          <div className="brandblock">
            <div className="name">
              Upstate Home <em>Center</em>
            </div>
            <p>
              Family-owned manufactured home dealer serving the South Carolina Upstate since 1998.
              Spartanburg lot, every major manufacturer, honest pricing.
            </p>
          </div>
          <div>
            <h4>Browse</h4>
            <ul>
              <li><Link href="/inventory">All inventory</Link></li>
              <li><Link href="/inventory?type=single">Single-wides</Link></li>
              <li><Link href="/inventory?type=double">Double-wides</Link></li>
              <li><Link href="/inventory?type=modular">Modular</Link></li>
            </ul>
          </div>
          <div>
            <h4>Programs</h4>
            <ul>
              <li><Link href="/financing">Financing</Link></li>
              <li><Link href="/trade-in">Trade-in</Link></li>
              <li><Link href="/contact">Service</Link></li>
            </ul>
          </div>
          <div>
            <h4>Visit</h4>
            <ul>
              <li>Spartanburg, SC</li>
              <li><a href="tel:864-680-4030">(864) 680-4030</a></li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li><Link href="/about">About</Link></li>
              <li><Link href="/contact">Contact</Link></li>
            </ul>
          </div>
        </div>
        <div className="uhs-footer-bottom">
          <span>© {new Date().getFullYear()} Upstate Home Center</span>
          <span className="spacer" />
          <span>Manufactured Home Dealer License # MDL.35984</span>
        </div>
      </div>
    </footer>
  );
}
