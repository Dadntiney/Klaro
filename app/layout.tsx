import "./globals.css";

export const metadata = {
  title: "Bezochte websites & apps",
  description: "Overzicht van bezochte websites en apps uit NextDNS",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
