/** @type {import("next").NextConfig} */
const nextConfig = {
  transpilePackages: ["@repo/auth", "@repo/database"],
};

export default nextConfig;
