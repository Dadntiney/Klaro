<?php
// Soort netwerk bij een internetadres (alleen na inloggen): GET ?ip=1.2.3.4 -> {soort: "mobiel"|"vast"|null, naam}.
// Uitkomst 30 dagen bewaard in _private/netinfo.json; zo wordt het register maar één keer per adres gevraagd.
require __DIR__ . '/common.php';
require __DIR__ . '/netinfo-lib.php';
require_login();

$ip = (string)($_GET['ip'] ?? '');
if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) json_out(400, ['error' => 'Geen geldig openbaar adres.']);
// IPv6: alleen het netwerkdeel opvragen (de eerste 64 bits); het apparaatdeel gaat niet naar buiten.
$key = $ip;
if (str_contains($ip, ':')) { $bin = inet_pton($ip); $key = inet_ntop(substr($bin, 0, 8) . str_repeat("\0", 8)) . '/64'; }
$file = PRIV . '/netinfo.json';
$cache = is_file($file) ? (json_decode((string)file_get_contents($file), true) ?: []) : [];
$now = time();
if (isset($cache[$key]) && $now - (int)$cache[$key]['t'] < 30 * 86400) json_out(200, $cache[$key]['v']);

$ch = curl_init('https://stat.ripe.net/data/whois/data.json?sourceapp=klaro&resource=' . rawurlencode($key));
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => 8, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS]);
$body = curl_exec($ch);
$code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);
$whois = is_string($body) && $code === 200 ? json_decode($body, true) : null;
if (!is_array($whois)) json_out(502, ['error' => 'Register nu niet bereikbaar.']);
$fields = netinfo_fields($whois);
$v = netinfo_classify($fields);
if (isset($_GET['ruw'])) $v['ruw'] = $fields; // alleen om de herkenning na te kijken
else { $cache[$key] = ['t' => $now, 'v' => $v]; file_put_contents($file, json_encode($cache), LOCK_EX); }
json_out(200, $v);
