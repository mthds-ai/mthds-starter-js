/** @type {import('next').NextConfig} */
const nextConfig = {
  // The PDF example uploads a file in the browser, base64-encodes it, and
  // sends it to a Server Action. Base64 inflates payloads by ~37%, so an
  // 8 MB PDF (MAX_PDF_BYTES in src/lib/fileEncoding.ts) becomes an ~11 MB
  // request body — over the 1 MB Server Action default.
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  // Each Server Action sends a method's whole directory, which `loadMethodTree`
  // (src/lib/methodTree.ts) hands to the `mthds` SDK to list at request time.
  // Name `methods/` here so every traced deployment (Vercel, or
  // `output: "standalone"`) ships it, rather than relying on the bundler
  // guessing it from a path built at runtime. The `/*` key covers every route,
  // since a Server Action runs on whichever page imports it.
  outputFileTracingIncludes: {
    "/*": ["./methods/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
