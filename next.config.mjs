/** @type {import('next').NextConfig} */
const nextConfig = {
  // De grote adreslijst moet mee in de serverfuncties.
  experimental: { outputFileTracingIncludes: { "/api/nextdns": ["./data/**"], "/api/nextdns/live": ["./data/**"] } },
};
export default nextConfig;
