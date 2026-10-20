import "./globals.css";

export const metadata = {
  title: "Dobber",
  description: "Overzicht van bezochte websites en apps uit NextDNS",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
  // Op het beginscherm als losse app (nodig voor pushmeldingen op de iPhone).
  appleWebApp: { capable: true, title: "Dobber", statusBarStyle: "default" as const },
};

// Vaste kleur voor de balk bovenin (zelfde als de achtergrond). Zonder deze kleur legt Safari op de iPhone zelf een
// waas/kleurverloop over de bovenkant (de chips), tot je een keer scrolt.
export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
};

// Vangnet: start de app niet op (een onderdeel laadt niet, of een fout in de browser), dan na 10 s een melding met de fout en
// een knop om opnieuw te laden, in plaats van eindeloos het laadscherm op 0%. De app zet window.__klaroUp zodra hij draait.
const BOOT_GUARD = `(function(){var e=[];function add(m){if(e.length<5)e.push(String(m).slice(0,200));}
addEventListener("error",function(ev){var t=ev.target;if(t&&t!==window&&(t.src||t.href))add("Niet geladen: "+(t.src||t.href).replace(location.origin,""));else add(ev.message||"Fout");},true);
addEventListener("unhandledrejection",function(ev){add((ev.reason&&ev.reason.message)||ev.reason||"Fout");});
setTimeout(function(){if(window.__klaroUp||document.getElementById("boot-fail"))return;var d=document.createElement("div");d.id="boot-fail";
d.innerHTML='<b>Dobber start niet op</b><p>Het laden lukt niet. Probeer opnieuw; blijft dit zo, stuur dan een schermafbeelding van deze melding.</p>'+(e.length?'<pre></pre>':'')+'<button type="button">Opnieuw laden</button>';
if(e.length)d.querySelector("pre").textContent=e.join("\\n")+"\\n"+navigator.userAgent;
d.querySelector("button").onclick=function(){location.replace(location.pathname+"?r="+Date.now());};document.body.appendChild(d);},10000);})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_GUARD }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
