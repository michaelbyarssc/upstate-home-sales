import Script from 'next/script';

/**
 * Phase G — pixel installer.
 *
 * Server-rendered. Reads the connected integrations for the org and injects
 * the appropriate analytics scripts (GA4 gtag, GTM, Meta Pixel) into the
 * public site. Each integration is independent — empty values are skipped.
 *
 * Called from the root layout. To avoid a per-request DB lookup on every
 * page, the layout passes a memoized snapshot of the active integrations
 * fetched once at request boundary.
 */

type Props = {
  ga4MeasurementId?: string | null;
  gtmContainerId?: string | null;
  metaPixelId?: string | null;
};

export function PixelInstaller({ ga4MeasurementId, gtmContainerId, metaPixelId }: Props) {
  return (
    <>
      {/* GA4 gtag */}
      {ga4MeasurementId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4MeasurementId)}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${ga4MeasurementId}', { send_page_view: true });
          `}</Script>
        </>
      )}

      {/* GTM */}
      {gtmContainerId && (
        <Script id="gtm-init" strategy="afterInteractive">{`
          (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
          new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
          j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
          'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','${gtmContainerId}');
        `}</Script>
      )}

      {/* Meta Pixel */}
      {metaPixelId && (
        <Script id="meta-pixel-init" strategy="afterInteractive">{`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${metaPixelId}');
          fbq('track', 'PageView');
        `}</Script>
      )}
    </>
  );
}
