/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lint inaendeshwa kwa `npm run lint` — build isikwame kwa sababu ya lint.
  eslint: { ignoreDuringBuilds: true },
  // R12: unpdf (READ_SOURCE ya PDF) inaendeshwa na Node moja kwa moja — isipakiwe na webpack
  serverExternalPackages: ["unpdf"],
  // sandbox (2GB): identity webpack config → Next inajenga IN-PROCESS (build-worker tofauti
  // + mkuu = OOM ya pande zote kwenye 2GB). Buffers ndogo + static-gen worker mmoja.
  webpack: (cfg) => cfg,
  experimental: { cpus: 1, webpackMemoryOptimizations: true },
};

export default nextConfig;
