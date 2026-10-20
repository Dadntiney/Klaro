<?php
// Doorgeefluik naar NextDNS: voegt de geheime sleutel toe. ?q=<querystring> voor /logs, ?download=1 voor alle logs (CSV).
require __DIR__ . '/common.php';
require __DIR__ . '/ndlib.php';
$cfg = require_login();
$base = nd_base($cfg);

if (isset($_GET['download'])) {
  // ?since=<ms>: alleen regels van na dat moment (de telefoon bewaart de rest zelf).
  $since = isset($_GET['since']) ? (int)$_GET['since'] : 0;
  // Eigen kopie (store.php): alleen de nieuwe regels bij NextDNS ophalen. ?oud=1 of een fout: de oude manier hieronder.
  if (!isset($_GET['oud'])) {
    try {
      $k = nd_refresh($cfg, $base);
      if ($k && $k[0]->query('SELECT 1 FROM logs LIMIT 1')->fetchColumn()) {
        header('Content-Type: text/tab-separated-values; charset=utf-8');
        header('X-Klaro-Bron: kopie-' . $k[1]);
        if (!ini_get('zlib.output_compression')) ob_start('ob_gzhandler');
        store_out($k[0], $since);
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
