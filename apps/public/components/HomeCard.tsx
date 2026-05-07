import Link from 'next/link';
import { formatCents, type PublicHome } from '@uhs/db';
import { publicPhotoUrl } from '../lib/supabase';

type Props = {
  home: PublicHome & {
    manufacturers?: { name: string } | null;
    public_home_photos?: Array<{ storage_path: string; sort_order: number }> | null;
  };
  index?: number;
};

export function HomeCard({ home, index = 0 }: Props) {
  const photo = home.public_home_photos?.[0];
  const phClass = `ph-${(index % 9) + 1}`;
  const isNew = home.on_lot_since
    ? Math.floor((Date.now() - new Date(home.on_lot_since).getTime()) / 86_400_000) <= 14
    : false;

  return (
    <Link href={`/inventory/${home.stock_no}`} className="home-card">
      <div className="photo">
        {photo ? (
          <div
            className="placeholder"
            style={{
              width: '100%',
              height: '100%',
              backgroundImage: `url(${publicPhotoUrl(photo.storage_path)})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        ) : (
          <div className={`placeholder ${phClass}`}>{home.manufacturers?.name ?? 'Photo'}</div>
        )}
        {isNew && <span className="badge new">New</span>}
        {home.is_featured && !isNew && <span className="badge">Featured</span>}
      </div>
      <div className="body">
        <div className="eyebrow-card">
          {home.manufacturers?.name ?? 'Manufactured Home'}
          {home.model ? ` · ${home.model}` : ''}
        </div>
        <div className="name">{home.name}</div>
        <div className="specs">
          {home.beds ?? '—'} bed · {home.baths ?? '—'} bath
          {home.sqft ? ` · ${home.sqft.toLocaleString()} sqft` : ''}
        </div>
        <div className="price-row">
          <div>
            <div className="price">{formatCents(home.listed_price_cents)}</div>
            {home.starting_from && <div className="price-caveat">Starting from</div>}
          </div>
          <span className="view">View →</span>
        </div>
      </div>
    </Link>
  );
}
