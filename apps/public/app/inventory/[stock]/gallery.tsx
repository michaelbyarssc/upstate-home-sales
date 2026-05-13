'use client';

import { useState } from 'react';
import { PhotoLightbox } from './photo-lightbox';

interface GalleryPhoto {
  id: string;
  url: string;
  alt: string;
}

interface GalleryProps {
  photos: GalleryPhoto[];
}

export function Gallery({ photos }: GalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const hero = photos[0];
  const secondary = photos[1];
  const rest = photos.slice(2);

  return (
    <>
      <div className="detail-gallery">
        <div
          className="pane"
          role="button"
          tabIndex={0}
          onClick={() => hero && setLightboxIndex(0)}
          onKeyDown={(e) => e.key === 'Enter' && hero && setLightboxIndex(0)}
          style={hero ? { backgroundImage: `url(${hero.url})`, cursor: 'pointer' } : undefined}
        >
          {hero && <button type="button" className="expand" aria-label="Expand photo" onClick={(e) => { e.stopPropagation(); setLightboxIndex(0); }}>&#x2922;</button>}
        </div>
        <div
          className="pane"
          role={secondary ? 'button' : undefined}
          tabIndex={secondary ? 0 : undefined}
          onClick={() => secondary && setLightboxIndex(1)}
          onKeyDown={(e) => e.key === 'Enter' && secondary && setLightboxIndex(1)}
          style={secondary ? { backgroundImage: `url(${secondary.url})`, cursor: 'pointer' } : undefined}
        >
          {secondary && <button type="button" className="expand" aria-label="Expand photo" onClick={(e) => { e.stopPropagation(); setLightboxIndex(1); }}>&#x2922;</button>}
        </div>
      </div>

      {rest.length > 0 && (
        <div className="gallery-thumbs" style={{ marginBottom: 'var(--s-8)' }}>
          {rest.slice(0, 8).map((p, i) => (
            <button
              key={p.id}
              type="button"
              style={{ backgroundImage: `url(${p.url})`, cursor: 'pointer' }}
              aria-label={p.alt}
              onClick={() => setLightboxIndex(i + 2)}
            />
          ))}
        </div>
      )}

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos.map((p) => ({ url: p.url, alt: p.alt }))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
