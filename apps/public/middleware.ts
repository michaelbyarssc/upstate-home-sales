import { NextResponse, type NextRequest } from 'next/server';
import {
  BUYER_REGION_HEADER,
  BUYER_ZIP_COOKIE,
  encodeRegion,
  regionFromZip,
} from './lib/region';

/**
 * Phase F middleware:
 *
 *   1. Reads the buyer's zip from the `?zip=` query param OR the
 *      `uhs_buyer_zip` cookie.
 *   2. Resolves it to a RegionContext (zip + county + state).
 *   3. Sets the `x-buyer-region` request header so RSC routes can read it
 *      via headers().get(...) without extra plumbing.
 *   4. If the zip arrived via query param, also sets the cookie so future
 *      visits stay scoped to that region.
 *
 * No PII flows here — zip + county are demographic data.
 */

export const config = {
  // Run on every page route except Next internals + static files.
  // (Skip /api routes too — they read region from request body or their own
 // headers when needed.)
  matcher: ['/((?!_next/static|_next/image|api|favicon.ico|robots.txt|sitemap.xml).*)'],
};

export function middleware(req: NextRequest) {
  const url = new URL(req.url);

  // Pick the source for the buyer's zip. URL takes precedence (lets a buyer
  // override their cookie by visiting `/?zip=29073`).
  const zipParam = url.searchParams.get('zip');
  const zipCookie = req.cookies.get(BUYER_ZIP_COOKIE)?.value;
  const zip = zipParam ?? zipCookie ?? null;
  const region = regionFromZip(zip);

  // Forward the resolved region as a request header so RSC can read it.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(BUYER_REGION_HEADER, encodeRegion(region));

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  // Persist the cookie if it just arrived via URL.
  if (zipParam && region.zip) {
    res.cookies.set(BUYER_ZIP_COOKIE, region.zip, {
      maxAge: 60 * 60 * 24 * 90, // 90 days
      path: '/',
      sameSite: 'lax',
      httpOnly: false, // Needs to be readable by client JS so the calculator can pre-fill.
    });
  }

  return res;
}
