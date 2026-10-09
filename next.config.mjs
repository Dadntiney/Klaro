/** @type {import('next').NextConfig} */
const nextConfig = {
  // De grote adreslijst moet mee in de serverfuncties.
  async headers() {
    const secure = [
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
    ];
    return [
      { source: "/:path*", headers: secure },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
  experimental: { outputFileTracingIncludes: { "/api/nextdns": ["./data/**"], "/api/nextdns/live": ["./data/**"] } },
};
export default nextConfig;
