import type { NextConfig } from "next";

// When the pipeline's media folder is synced to object storage (needed on
// Vercel, where the app can't read the pipeline machine's disk), /media/* is
// served from there instead of the local MEDIA_DIR route.
const mediaPublicUrl = process.env.MEDIA_PUBLIC_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: mediaPublicUrl ? [{ source: "/media/:path*", destination: `${mediaPublicUrl}/:path*` }] : [],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
