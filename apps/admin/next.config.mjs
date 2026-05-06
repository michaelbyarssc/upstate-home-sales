/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@uhs/db', '@uhs/design-tokens'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
