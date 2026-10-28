<?php
// Logo's van sites via de eigen server (alleen na inloggen): de browser vraagt ze niet meer zelf bij Google op, zodat Google niet
// ziet welke sites in de lijst staan (en het werkt ook waar google.com geblokkeerd is). Elk logo wordt één keer opgehaald en
// 30 dagen bewaard in _private/icons. Geen logo: een leeg plaatje van 1x1 (de pagina toont dan een rustig vakje, zonder foutmelding).
// Met `n` (de naam van een app in Klaro): heeft de website geen logo, dan het icoon uit de App Store, als dat zeker de juiste app is.
require __DIR__ . '/common.php';
require __DIR__ . '/appstore.php';
require_login();
$d = strtolower(trim((string)($_GET['d'] ?? '')));
$sz = (int)($_GET['s'] ?? 64) === 32 ? 32 : 64;
$n = trim((string)($_GET['n'] ?? ''));
if (!preg_match('/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/', $d)) { http_response_code(400); exit; }
if (mb_strlen($n, 'UTF-8') > 60 || preg_match('/[\x00-\x1f]/', $n)) { http_response_code(400); exit; }
$dir = PRIV . '/icons';
if (!is_dir($dir)) @mkdir($dir, 0700);
$f = $dir . '/' . md5('v2|' . $d . '|' . $sz . ($n !== '' ? '|' . $n : '')); // v2: met de extra pogingen hieronder (28 okt)
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
  // Google geeft bij "geen logo" een wereldbolletje van 16x16. Dan eerst de www-versie bij Google, daarna het eigen icoon van de
  // site (apple-touch-icon), en voor een app de App Store (28 okt: digid.nl en webinargeek.com kregen anders een letter).
  $tiny = $ok && (($sizes = @getimagesizefromstring($img)) === false || $sizes[0] <= 16);
  foreach (['https://www.google.com/s2/favicons?domain=' . rawurlencode('www.' . preg_replace('/^www\./', '', $d)) . '&sz=' . $sz, 'https://www.' . preg_replace('/^www\./', '', $d) . '/apple-touch-icon.png', 'https://' . $d . '/apple-touch-icon.png'] as $alt) {
    if ($img !== false && $ok && !$tiny) break;
    $ch = curl_init($alt);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => 6, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS]);
    $a = curl_exec($ch);
    $ac = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $at = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);
    if ($a === false || $ac !== 200 || strlen($a) === 0 || strlen($a) >= 200_000 || !preg_match('#^image/(png|x-icon|vnd\.microsoft\.icon|gif|jpeg|webp)#', $at)) continue;
    $as = @getimagesizefromstring($a);
    if ($as !== false && $as[0] > 16) { $img = $a; $ok = true; $tiny = false; }
  }
  if ($n !== '' && $img !== false && (!$ok || $tiny)) {
    $app = appstore_icon($n, $d);
    if ($app !== null) { $img = $app; $ok = true; }
  }
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
