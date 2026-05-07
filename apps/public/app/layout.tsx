import type { Metadata } from 'next';
import './globals.css';
import { SiteHeader, SiteFooter } from './site-chrome';

export const metadata: Metadata = {
  title: { default: 'Upstate Home Sales', template: '%s · Upstate Home Sales' },
  description:
    'Manufactured homes in the South Carolina Upstate. Family-owned dealer with two lots, every major manufacturer, honest pricing.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
