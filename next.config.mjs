/** @type {import('next').NextConfig} */
const nextConfig = {
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
  // De grote adreslijsten (18+, dating) moeten mee in élke serverfunctie die adressen beoordeelt.
  outputFileTracingIncludes: { "/api/**/*": ["./data/**"] },
};
export default nextConfig;
