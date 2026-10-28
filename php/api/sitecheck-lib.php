<?php
// Is een adres echt een website? Hulp bij het nakijken van twijfelgevallen (alleen voor de controles, niet op de pagina).
// Een aanwijzing, geen bewijs: ook advertentie- en meetbedrijven hebben een eigen website.
declare(strict_types=1);

/** Geldig openbaar adres (geen IP, geen lokale namen, geen pad). */
function sitecheck_host(string $h): ?string {
  $h = strtolower(trim($h));
  if (strlen($h) > 253 || !preg_match('/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/', $h)) return null;
  if (preg_match('/\.(local|lan|home|internal|arpa|invalid|localdomain)$/', $h)) return null;
  return $h;
}

/** Nooit ophalen: duidelijke 18+/dating-woorden (de lijsten zelf worden apart gecontroleerd). */
function sitecheck_refuse_word(string $h): bool {
  return (bool)preg_match('/porn|xxx|sex|seks|hentai|nsfw|onlyfans|escort|dating|camgirl|nude|erotic|erotiek/', $h);
}

function sitecheck_base(string $h): string {
  $p = explode('.', $h);
  $keep = count($p) >= 3 && strlen(end($p)) === 2 && in_array($p[count($p) - 2], ['co', 'com', 'org', 'net', 'ac'], true) ? 3 : 2;
  return implode('.', array_slice($p, -$keep));
}

/** Oordeel uit het antwoord van de voorpagina. */
function sitecheck_verdict(string $host, int $code, string $ctype, string $finalUrl, string $body, string $err = ''): array {
  if ($code === 0) return ['soort' => 'onbereikbaar', 'uitleg' => $err !== '' ? $err : 'geen antwoord'];
  $finalHost = strtolower((string)parse_url($finalUrl, PHP_URL_HOST));
  $v = ['code' => $code];
  if ($finalHost !== '' && sitecheck_base($finalHost) !== sitecheck_base($host)) $v['naar'] = $finalHost;
  // Afgeschermd tegen robots (403, 401, 429, 503: Cloudflare e.d.) zegt niets over de site zelf: onbekend, niet "geen pagina"
  // (28 okt: deviantart.com en coloriage.info zijn echte sites maar geven een robot 403).
  if (in_array($code, [401, 403, 429, 503], true)) return $v + ['soort' => 'afgeschermd', 'uitleg' => "foutcode $code (weert robots)"];
  if ($code >= 400) return $v + ['soort' => 'geen pagina', 'uitleg' => "foutcode $code"];
  if (!str_contains(strtolower($ctype), 'html')) return $v + ['soort' => 'techniek', 'uitleg' => $ctype !== '' ? $ctype : 'geen soort'];
  $title = '';
  if (preg_match('~<title[^>]*>(.*?)</title>~is', $body, $m)) $title = trim(preg_replace('/\s+/', ' ', html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
  $text = trim(preg_replace('/\s+/', ' ', strip_tags(preg_replace('~<(script|style)[^>]*>.*?</\1>~is', '', $body))));
  if ($title !== '') $v['titel'] = mb_substr($title, 0, 120);
  if (isset($v['naar'])) return $v + ['soort' => 'doorsturen'];
  if ($title === '' && mb_strlen($text) < 80) return $v + ['soort' => 'leeg', 'uitleg' => 'bijna niets op de pagina'];
  return $v + ['soort' => 'website'];
}
