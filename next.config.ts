import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Serve avatar URLs directly from Supabase Storage instead of through Vercel's
    // Image Optimizer. The optimizer has a hard monthly cap on the Hobby plan and
    // ~650 avatars (× multiple sizes/formats) blows past it, breaking most images.
    // Direct serving costs a little Supabase egress but is tiny now that the browse
    // lists are paginated (≤20 avatars/page) rather than loading all ~655 rows.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'nujmomcnzckflhkflwod.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
