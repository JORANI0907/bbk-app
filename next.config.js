/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development' || !!process.env.NETLIFY,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/andmmbxhtufwvtsgdhti\.supabase\.co\/.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'supabase-cache',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24,
        },
      },
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'image-cache',
        expiration: {
          maxEntries: 500,
          maxAgeSeconds: 60 * 60 * 24 * 7,
        },
      },
    },
  ],
})

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'andmmbxhtufwvtsgdhti.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'k.kakaocdn.net',
      },
    ],
  },
}

module.exports = withPWA(nextConfig)
