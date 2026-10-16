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

if (isset($_GET['download'])) {
  // Alles ophalen is traag en NextDNS remt bij te vaak vragen: 2 minuten hergebruiken (meerdere toestellen tegelijk).
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
  header('Content-Type: text/csv; charset=utf-8');
  if (!ini_get('zlib.output_compression')) ob_start('ob_gzhandler');
  readfile($cache);
  exit;
}

$q = (string)($_GET['q'] ?? '');
// Alleen gewone zoekparameters doorgeven (geen andere paden bij NextDNS).
if (!preg_match('/^[A-Za-z0-9_.=&%:+\-]*$/', $q)) json_out(400, ['error' => 'Ongeldige aanvraag.']);
[$status, $body] = nd_get($base . ($q !== '' ? '?' . $q : ''), $cfg['key'], 20);
http_response_code($status);
header('Content-Type: application/json; charset=utf-8');
echo $body;
