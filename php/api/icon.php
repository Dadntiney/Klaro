<?php
// Logo's van sites via de eigen server (alleen na inloggen): de browser vraagt ze niet meer zelf bij Google op, zodat Google niet
// ziet welke sites in de lijst staan (en het werkt ook waar google.com geblokkeerd is). Elk logo wordt één keer opgehaald en
// 30 dagen bewaard in _private/icons. Geen logo: een leeg plaatje van 1x1 (de pagina toont dan de beginletter, zonder foutmelding).
require __DIR__ . '/common.php';
require_login();
$d = strtolower(trim((string)($_GET['d'] ?? '')));
$sz = (int)($_GET['s'] ?? 64) === 32 ? 32 : 64;
if (!preg_match('/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/', $d)) { http_response_code(400); exit; }
$dir = PRIV . '/icons';
if (!is_dir($dir)) @mkdir($dir, 0700);
$f = $dir . '/' . md5($d . '|' . $sz);
// Een logo 30 dagen; "geen logo" maar 1 dag (misschien was de site of de verbinding even weg).
$fresh = is_file($f) && time() - filemtime($f) < (filesize($f) > 0 ? 30 : 1) * 86400;
if (!$fresh) {
  $ch = curl_init('https://www.google.com/s2/favicons?domain=' . rawurlencode($d) . '&sz=' . $sz);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => 6, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS]);
  $img = curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  $type = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
  curl_close($ch);
  // Alleen echte plaatjes bewaren (png/ico/gif/jpeg/webp, hooguit 200 kB); anders leeg bewaren, zodat we niet blijven vragen.
  $ok = $img !== false && ($code === 200 || $code === 404) && strlen($img) > 0 && strlen($img) < 200_000 && preg_match('#^image/(png|x-icon|vnd\.microsoft\.icon|gif|jpeg|webp)#', $type);
  if ($img !== false) { // verbinding mislukt: niets bewaren, volgende keer opnieuw proberen
    @file_put_contents($f . '.tmp', $ok ? $img : '');
    @rename($f . '.tmp', $f);
  }
}
$img = is_file($f) ? (string)file_get_contents($f) : '';
$mime = $img === '' ? '' : (string)(new finfo(FILEINFO_MIME_TYPE))->buffer($img);
if (!preg_match('#^image/(png|x-icon|vnd\.microsoft\.icon|gif|jpeg|webp)$#', $mime)) {
  header('Content-Type: image/png');
  header('Cache-Control: private, max-age=86400');
  echo base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
  exit;
}
header('Content-Type: ' . $mime);
header('Cache-Control: private, max-age=604800'); // een week in de browser
header_remove('Pragma');
echo $img;
