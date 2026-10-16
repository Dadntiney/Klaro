/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gewone bestanden (map out/) voor eigen hosting: de pagina's draaien in de browser, het geheime deel in php/ (zie docs/strato.md).
  // Beveiligingskoppen en de afscherming staan in php/.htaccess.
  output: "export",
  images: { unoptimized: true },
};
export default nextConfig;
