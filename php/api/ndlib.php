<?php
// Gedeeld door nd.php en alert.php: NextDNS aanroepen met de geheime sleutel, de hele download, en de eigen kopie bijwerken.
require_once __DIR__ . '/slim.php';

/** Basisadres van de logboeken van het ingestelde NextDNS-profiel. */
function nd_base(array $cfg): string {
  return ($cfg['api'] ?? 'https://api.nextdns.io') . '/profiles/' . rawurlencode(trim($cfg['profile'])) . '/logs';
}

function nd_get(string $url, string $key, int $timeout): array {
  // Doorsturen zelf afhandelen: de geheime sleutel gaat alleen naar NextDNS, nooit mee naar het adres waar die naar doorstuurt
  // (de download staat op een tijdelijk opslagadres). Alleen https.
  $home = parse_url($url, PHP_URL_HOST);
  for ($hop = 0; $hop <= 5; $hop++) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false,
      CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => $timeout, CURLOPT_ENCODING => '',
      CURLOPT_HTTPHEADER => parse_url($url, PHP_URL_HOST) === $home ? ['X-Api-Key: ' . trim($key)] : [],
    ]);
    $body = curl_exec($ch);
    $status = $body === false ? 502 : (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $next = (string)curl_getinfo($ch, CURLINFO_REDIRECT_URL);
    curl_close($ch);
    if ($body === false || $status < 300 || $status >= 400 || $next === '') break;
    if (stripos($next, 'https://') !== 0 && stripos($url, 'http://127.0.0.1') !== 0) return [502, '{"error":"NextDNS stuurde door naar een onveilig adres."}'];
    $url = $next;
  }
  return [$status, $body === false ? '{"error":"NextDNS is niet bereikbaar."}' : $body];
}



/**
 * De hele download van NextDNS, licht gemaakt (TSV). Alles ophalen is traag en NextDNS remt bij te vaak vragen: 2 minuten
 * hergebruiken (meerdere toestellen tegelijk). Geeft het pad van het lichte bestand, of stopt met de fout van NextDNS.
 */
function nd_full_download(array $cfg, string $base): string {
  $cache = PRIV . '/download.csv';
  if (!is_file($cache) || time() - filemtime($cache) > 120) {
    $lock = fopen(PRIV . '/download.lock', 'c');
    flock($lock, LOCK_EX);
    clearstatcache();
    if (!is_file($cache) || time() - filemtime($cache) > 120) {
      [$status, $body] = nd_get($base . '/download', $cfg['key'], 85);
      if ($status !== 200) { flock($lock, LOCK_UN); http_response_code($status); header('Content-Type: application/json'); echo $body; exit; }
      file_put_contents($cache . '.tmp', $body);
      rename($cache . '.tmp', $cache);
    }
    flock($lock, LOCK_UN);
  }
  // Voor de telefoon licht maken: alleen de kolommen die Klaro gebruikt, als tabel zonder aanhalingstekens (TSV), en dubbele
  // opvragingen (A/AAAA/HTTPS van hetzelfde adres op hetzelfde apparaat binnen 1,5 s) alvast weg. Klaro telt die toch als één
  // (lib/overview.ts doet precies hetzelfde), dus de uitkomst blijft gelijk; het scheelt de helft tot driekwart van het geheugen.
  $slim = PRIV . '/download.tsv';
  // Elk verzoek een eigen tijdelijk bestand: schrijven twee apparaten tegelijk naar hetzelfde bestand, dan raken regels door elkaar
  // (17 okt: een Facebook-regel zonder tijd, "Datum onbekend").
  if (!is_file($slim) || filemtime($slim) < filemtime($cache)) { $tmp = $slim . '.' . getmypid() . '.tmp'; slim_csv($cache, $tmp) && rename($tmp, $slim); }
  return is_file($slim) ? $slim : $cache;
}

/**
 * De eigen kopie bijwerken (zie store.php): alleen nieuwe regels ophalen, of opnieuw vullen uit de download als hij leeg, oud of
 * half binnen is. Geeft [db, uitkomst], of null als er geen kopie kan zijn (dan de oude manier).
 */
function nd_refresh(array $cfg, string $base): ?array {
  if (!class_exists('PDO') || !in_array('sqlite', PDO::getAvailableDrivers(), true)) return null;
  require_once __DIR__ . '/store.php';
  $db = store_db();
  $lock = fopen(PRIV . '/store.lock', 'c');
  flock($lock, LOCK_EX);
  try {
    $now = (int)(microtime(true) * 1000);
    $r = store_sync($db, fn(string $q) => nd_get($base . '?' . $q, $cfg['key'], 20), $now);
    if ($r === 'leeg' || $r === 'oud' || $r === 'onvolledig') {
      $file = nd_full_download($cfg, $base);
      if (str_ends_with($file, '.tsv')) { store_seed($db, $file); store_meta($db, 'synced', (string)$now); store_meta($db, 'seeded', (string)$now); }
    }
  } finally {
    flock($lock, LOCK_UN);
  }
  return [$db, $r];
}
