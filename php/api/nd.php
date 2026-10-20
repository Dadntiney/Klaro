<?php
// Doorgeefluik naar NextDNS: voegt de geheime sleutel toe. ?q=<querystring> voor /logs, ?download=1 voor alle logs (CSV).
require __DIR__ . '/common.php';
$cfg = require_login();
$base = ($cfg['api'] ?? 'https://api.nextdns.io') . '/profiles/' . rawurlencode(trim($cfg['profile'])) . '/logs';

function nd_get(string $url, string $key, int $timeout): array {
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5,
    CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => $timeout, CURLOPT_ENCODING => '',
    CURLOPT_HTTPHEADER => ['X-Api-Key: ' . trim($key)],
  ]);
  $body = curl_exec($ch);
  $status = $body === false ? 502 : (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  curl_close($ch);
  return [$status, $body === false ? '{"error":"NextDNS is niet bereikbaar."}' : $body];
}


require __DIR__ . '/slim.php';

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

if (isset($_GET['download'])) {
  // ?since=<ms>: alleen regels van na dat moment (de telefoon bewaart de rest zelf).
  $since = isset($_GET['since']) ? (int)$_GET['since'] : 0;
  // Eigen kopie (lib: store.php): alleen de nieuwe regels bij NextDNS ophalen. ?oud=1 of een fout: de oude manier hieronder.
  if (!isset($_GET['oud']) && class_exists('PDO') && in_array('sqlite', PDO::getAvailableDrivers(), true)) {
    try {
      require_once __DIR__ . '/store.php';
      $db = store_db();
      $lock = fopen(PRIV . '/store.lock', 'c');
      flock($lock, LOCK_EX);
      $now = (int)(microtime(true) * 1000);
      $r = store_sync($db, fn(string $q) => nd_get($base . '?' . $q, $cfg['key'], 20), $now);
      if ($r === 'leeg' || $r === 'oud' || $r === 'onvolledig') {
        $file = nd_full_download($cfg, $base);
        if (str_ends_with($file, '.tsv')) { store_seed($db, $file); store_meta($db, 'synced', (string)$now); store_meta($db, 'seeded', (string)$now); }
      }
      flock($lock, LOCK_UN);
      if ($db->query('SELECT 1 FROM logs LIMIT 1')->fetchColumn()) {
        header('Content-Type: text/tab-separated-values; charset=utf-8');
        header('X-Klaro-Bron: kopie-' . $r);
        if (!ini_get('zlib.output_compression')) ob_start('ob_gzhandler');
        store_out($db, $since);
        exit;
      }
    } catch (Throwable $e) {
      error_log('Klaro kopie: ' . $e->getMessage()); // dan de oude manier
    }
  }
  $file = nd_full_download($cfg, $base);
  header('Content-Type: text/tab-separated-values; charset=utf-8');
  if (!ini_get('zlib.output_compression')) ob_start('ob_gzhandler');
  // Het bestand staat op tijd, nieuwste eerst.
  if ($since > 0 && str_ends_with($file, '.tsv')) { slim_since($file, $since); exit; }
  readfile($file);
  exit;
}

$q = (string)($_GET['q'] ?? '');
// Alleen gewone zoekparameters doorgeven (geen andere paden bij NextDNS).
if (!preg_match('/^[A-Za-z0-9_.=&%:+\-]*$/', $q)) json_out(400, ['error' => 'Ongeldige aanvraag.']);
[$status, $body] = nd_get($base . ($q !== '' ? '?' . $q : ''), $cfg['key'], 20);
http_response_code($status);
header('Content-Type: application/json; charset=utf-8');
echo $body;
