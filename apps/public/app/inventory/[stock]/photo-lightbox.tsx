'use client';

import { useCallback, useEffect, useState } from 'react';

interface Photo {
  url: string;
  alt: string;
}

interface PhotoLightboxProps {
  photos: Photo[];
  initialIndex?: number;
  onClose: () => void;
}

export function PhotoLightbox({ photos, initialIndex = 0, onClose }: PhotoLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const photo = photos[index];

  const prev = useCallback(() => setIndex((i) => (i - 1 + photos.length) % photos.length), [photos.length]);
  const next = useCallback(() => setIndex((i) => (i + 1) % photos.length), [photos.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, prev, next]);

  if (!photo) return null;

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose} aria-label="Close gallery">&times;</button>

        {photos.length > 1 && (
          <button className="lightbox-prev" onClick={prev} aria-label="Previous photo">&#8249;</button>
        )}

        <img
          src={photo.url}
          alt={photo.alt}
          className="lightbox-img"
          draggable={false}
        />

        {photos.length > 1 && (
          <button className="lightbox-next" onClick={next} aria-label="Next photo">&#8250;</button>
        )}

        <div className="lightbox-counter">
          {index + 1} / {photos.length}
        </div>

        {photos.length > 1 && (
          <div className="lightbox-strip">
            {photos.map((p, i) => (
              <button
                key={i}
                className={`lightbox-thumb${i === index ? ' active' : ''}`}
                onClick={() => setIndex(i)}
                aria-label={p.alt}
                style={{ backgroundImage: `url(${p.url})` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
