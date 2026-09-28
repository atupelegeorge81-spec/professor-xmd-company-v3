/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lint inaendeshwa kwa `npm run lint` — build isikwame kwa sababu ya lint.
  eslint: { ignoreDuringBuilds: true },
  // R12: unpdf (READ_SOURCE ya PDF) inaendeshwa na Node moja kwa moja — isipakiwe na webpack
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
