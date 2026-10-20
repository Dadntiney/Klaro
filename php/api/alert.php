<?php
// Voor de waarschuw-taak op GitHub (scripts/waarschuw.ts, elke 5 minuten). Alleen met de geheime sleutel (kop X-Klaro-Sleutel;
// op de server staat alleen de hash in _private/alert.key, gemaakt bij het live zetten).
//  GET                       kopie bijwerken; regels sinds de vorige controle (de taak beoordeelt ze met dezelfde code als de pagina)
//  POST {until, alerts}      wat de taak vond: al gemeld (zelfde apparaat + site, laatste 3 uur) valt weg; geeft wat verstuurd moet
//                            worden en naar welke abonnementen
//  POST {gone: [endpoint]}   abonnementen die niet meer bestaan (Apple antwoordt 404/410) weghalen
require __DIR__ . '/common.php';
require __DIR__ . '/ndlib.php';
require __DIR__ . '/push-lib.php';

$want = is_file(PRIV . '/alert.key') ? trim((string)file_get_contents(PRIV . '/alert.key')) : '';
$got = (string)($_SERVER['HTTP_X_KLARO_SLEUTEL'] ?? '');
if ($want === '' || $got === '' || !hash_equals($want, hash('sha256', $got))) json_out(403, ['error' => 'Geen toegang.']);
$cfg = klaro_config();
if (!$cfg) json_out(503, ['error' => 'Klaro is nog niet ingesteld.']);

const ALERT_REPEAT = 3 * 3600_000; // ms: dezelfde site op hetzelfde apparaat niet vaker melden
const ALERT_OVERLAP = 120_000;     // ms: telkens 2 min terug (regels komen soms iets later binnen)

$k = nd_refresh($cfg, nd_base($cfg));
if (!$k) json_out(503, ['error' => 'Geen kopie mogelijk op deze server.']);
[$db] = $k;
$now = (int)(microtime(true) * 1000);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  // Eerste keer: niet de hele geschiedenis melden, alleen vanaf nu.
  $until = (int)(store_meta($db, 'alert_until') ?? 0) ?: $now - 10 * 60_000;
  $q = $db->prepare('SELECT line FROM logs WHERE t > ? ORDER BY t ASC, rowid DESC');
  $q->execute([$until - ALERT_OVERLAP]);
  $lines = $q->fetchAll(PDO::FETCH_COLUMN);
  $max = (int)$db->query('SELECT MAX(t) FROM logs')->fetchColumn();
  json_out(200, ['since' => $until - ALERT_OVERLAP, 'until' => $max, 'cols' => STORE_COLS, 'rows' => $lines, 'subs' => count(push_subs())]);
}

$in = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($in)) json_out(400, ['error' => 'Ongeldige aanvraag.']);

if (isset($in['gone'])) {
  push_remove(array_filter(is_array($in['gone']) ? $in['gone'] : [], 'is_string'));
  json_out(200, ['ok' => true]);
}

$sent = json_decode(store_meta($db, 'alerted') ?? '{}', true) ?: [];
foreach ($sent as $key => $t) if ($now - (int)$t > 24 * 3600_000) unset($sent[$key]);
$send = [];
foreach (is_array($in['alerts'] ?? null) ? $in['alerts'] : [] as $a) {
  $key = (string)($a['key'] ?? '');
  if ($key === '' || ($now - (int)($sent[$key] ?? 0)) < ALERT_REPEAT) continue;
  $sent[$key] = $now;
  $send[] = ['title' => (string)($a['title'] ?? 'Klaro'), 'body' => (string)($a['body'] ?? ''), 'tag' => $key];
}
store_meta($db, 'alerted', json_encode($sent));
if (isset($in['until'])) store_meta($db, 'alert_until', (string)(int)$in['until']);
json_out(200, ['send' => $send, 'subs' => push_subs(), 'test' => push_take_tests()]);
