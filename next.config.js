/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev and production build output are kept apart. `next dev` and
  // `next build` both default to `.next`, and mixing them corrupts it: the
  // dev-rendered HTML asks for dev-only chunks (main-app.js,
  // app-pages-internals.js, app/layout.js, static/css/app/layout.css) that a
  // production build never writes, so every asset 404s. The dev script sets
  // NEXT_DIST_DIR=.next-dev; build/start keep the default so deployments that
  // expect `.next` are unaffected.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    domains: ['res.cloudinary.com', 'maps.googleapis.com'],
  },
  env: {
    NEXT_PUBLIC_GOOGLE_CLIENT_ID:
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
      process.env.GOOGLE_CLIENT_ID ||
      '',
  },
};

module.exports = nextConfig;
