/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lint inaendeshwa kwa `npm run lint` — build isikwame kwa sababu ya lint.
  eslint: { ignoreDuringBuilds: true },
  // R12: unpdf (READ_SOURCE ya PDF) inaendeshwa na Node moja kwa moja — isipakiwe na webpack
  serverExternalPackages: ["unpdf"],
  // TASK-1: URL ya agizo /api/_test/* — App Router haiteini folda za underscore
  // (entries.js ignorePartFilter: part.startsWith('_')); hivyo rewrite hadi /api/xtest/*.
  async rewrites() {
    return [{ source: "/api/_test/:path*", destination: "/api/xtest/:path*" }];
  },
};

export default nextConfig;
