import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // Belt and braces for the private review page: robots meta plus the header.
    return [{ source: "/review", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
