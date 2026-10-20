<?php
// Alleen-lezen: hoe lang NextDNS de logboeken bewaart en welke databases deze server kan gebruiken (voor de keuze of Klaro
// een eigen kopie van de logboeken gaat bijhouden). Geeft geen geheimen terug.
require __DIR__ . '/common.php';
$cfg = require_login();

$url = ($cfg['api'] ?? 'https://api.nextdns.io') . '/profiles/' . rawurlencode(trim($cfg['profile']));
$ch = curl_init($url);
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 20,
  CURLOPT_HTTPHEADER => ['X-Api-Key: ' . trim($cfg['key'])],
]);
$body = curl_exec($ch);
$status = $body === false ? 502 : (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);
$logs = null;
if ($status === 200) {
  $j = json_decode($body, true);
  $l = $j['data']['settings']['logs'] ?? null;
  if (is_array($l)) $logs = ['enabled' => $l['enabled'] ?? null, 'retention' => $l['retention'] ?? null, 'location' => $l['location'] ?? null];
}

json_out(200, [
  'nextdns' => ['status' => $status, 'logs' => $logs],
  'server' => [
    'php' => PHP_VERSION,
    'pdo_sqlite' => extension_loaded('pdo_sqlite'),
    'sqlite3' => class_exists('SQLite3'),
    'pdo_mysql' => extension_loaded('pdo_mysql'),
    'pdo_drivers' => class_exists('PDO') ? PDO::getAvailableDrivers() : [],
    'vrije_ruimte_mb' => ($f = @disk_free_space(PRIV)) ? (int)($f / 1048576) : null,
    'download_csv_mb' => is_file(PRIV . '/download.csv') ? round(filesize(PRIV . '/download.csv') / 1048576, 1) : null,
  ],
]);
