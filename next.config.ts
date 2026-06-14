import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Tillad store fil-uploads (datarum-zips kan være 50-200 MB).
    // Standard er 1 MB for server actions; 4 MB for API routes.
    serverActions: {
      bodySizeLimit: "200mb",
    },
  },
};

export default nextConfig;
