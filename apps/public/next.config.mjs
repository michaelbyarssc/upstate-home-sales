/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@uhs/db', '@uhs/design-tokens'],
};

export default nextConfig;
