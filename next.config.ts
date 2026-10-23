import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // HTTP workflow tests use their own output so a developer server can stay open.
  distDir: process.env.WORTH_TEST_DIST_DIR ?? ".next",
};

export default nextConfig;
