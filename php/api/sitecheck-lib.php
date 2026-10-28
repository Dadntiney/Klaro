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

const SITECHECK_VERSIE = 2; // hoger = oude oordelen opnieuw bepalen (2: "afgeschermd" apart van "geen pagina")

/** Staat het adres (of een bovenliggend domein) op de 18+- of datinglijst van de server (_private/lists)? */
function sitecheck_on_list(string $host): bool {
  $parts = explode('.', $host);
  for ($i = 0; $i < count($parts) - 1; $i++) {
    $c = implode('.', array_slice($parts, $i));
    foreach (['adult', 'dating'] as $name) {
      $f = PRIV . "/lists/$name/" . substr(md5($c), 0, 2) . '.txt';
      if (is_file($f) && strpos((string)file_get_contents($f), "\n" . $c . "\n") !== false) return true;
    }
  }
  return false;
}

/** Bekend oordeel (30 dagen bewaard), of null. */
function sitecheck_cached(string $host): ?array {
  $file = PRIV . '/sitecheck.json';
  $cache = is_file($file) ? (json_decode((string)file_get_contents($file), true) ?: []) : [];
  $c = $cache[$host] ?? null;
  return $c && time() - (int)$c['t'] < 30 * 86400 && ($c['r'] ?? 1) === SITECHECK_VERSIE ? $c['v'] : null;
}

/** Voorpagina ophalen en beoordelen (zelfde voor de pagina en voor de taak die elke 5 minuten de nieuwe regels nakijkt). */
function sitecheck_run(string $host, int $timeout = 8): array {
  if (sitecheck_refuse_word($host) || sitecheck_on_list($host)) return ['soort' => 'overgeslagen', 'uitleg' => '18+/dating: nooit ophalen'];
  $known = sitecheck_cached($host);
  if ($known !== null) return $known;
  $body = '';
  $ch = curl_init('https://' . $host . '/');
  curl_setopt_array($ch, [
    CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => $timeout,
    CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP,
    CURLOPT_USERAGENT => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    CURLOPT_HTTPHEADER => ['Accept: text/html,*/*;q=0.8', 'Accept-Language: nl,en;q=0.8'],
    // Hooguit 300 kB lezen: genoeg voor titel en tekst.
    CURLOPT_WRITEFUNCTION => function ($c, $d) use (&$body) { $body .= $d; return strlen($body) > 300000 ? 0 : strlen($d); },
  ]);
  curl_exec($ch);
  $v = sitecheck_verdict($host, (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE), (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE), (string)curl_getinfo($ch, CURLINFO_EFFECTIVE_URL), $body, curl_errno($ch) && $body === '' ? curl_error($ch) : '');
  curl_close($ch);
  $file = PRIV . '/sitecheck.json';
  $fp = fopen($file, 'c+');
  if ($fp && flock($fp, LOCK_EX)) {
    $cache = json_decode((string)stream_get_contents($fp), true) ?: [];
    foreach ($cache as $h => $c) if (time() - (int)($c['t'] ?? 0) > 30 * 86400) unset($cache[$h]); // oud: weg
    $cache[$host] = ['t' => time(), 'v' => $v, 'r' => SITECHECK_VERSIE];
    ftruncate($fp, 0); rewind($fp); fwrite($fp, json_encode($cache)); fflush($fp); flock($fp, LOCK_UN);
  }
  if ($fp) fclose($fp);
  return $v;
}
