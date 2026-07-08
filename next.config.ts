import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', 'bcryptjs', '@napi-rs/canvas', 'better-sqlite3'],
};

export default nextConfig;
