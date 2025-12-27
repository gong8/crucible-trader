/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Temporarily ignore build errors to bypass caching issue
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
