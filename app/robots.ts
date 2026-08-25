import type { MetadataRoute } from 'next'

// app.next11ven.com is the application, not the marketing site — next11ven.com
// (separate repo) is what should be indexed. Only the sign-in and signup doors
// and the two legal pages have any business in a search result.
//
// This is also a CPU measure, not just an SEO one: middleware.ts runs before the
// CDN cache, so every crawler request to a matched path costs a middleware
// invocation even though the response is a static page off the CDN. There was no
// robots.txt at all until now (25 Aug 2026), so crawlers were free to walk
// /dashboard/* and bill us for the privilege.
//
// ⚠️ NOT a security control. Everything under /dashboard is already behind auth;
// this only stops well-behaved crawlers from knocking. Keep the middleware and
// RLS gates doing the actual work.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/register', '/privacy', '/terms'],
      disallow: [
        '/api/',
        '/dashboard/',
        '/auth/',
        '/claim',
        '/set-password',
        '/pending',
        '/premium/',
      ],
    },
  }
}
