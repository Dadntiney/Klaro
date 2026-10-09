import "./globals.css";

export const metadata = { title: "CSV", description: "DNS-records indelen in categorieën" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
