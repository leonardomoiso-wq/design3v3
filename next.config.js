/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Disattiva il blocco della build per errori ESLint minori (apostrofi, virgolette, etc.)
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;