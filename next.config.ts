import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.PLAYWRIGHT_SERVER === "1" ? ".next-playwright" : ".next",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
};

export default nextConfig;
