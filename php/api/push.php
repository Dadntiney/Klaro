<?php
// Meldingen op dit toestel (alleen na inloggen).
//  GET                         {publicKey, aan: is dit abonnement bekend, laatst: waarschuw-taak laatst goed,
//                               aantal: op hoeveel toestellen meldingen aan staan (0 = rode waarschuwing in de pagina),
//                               meldingen: de laatste meldingen met de echte tekst (op de iPhone staat alleen een neutrale tekst)} (?endpoint=...)
//  POST {subscription, label}  aanzetten (de volgende controle, binnen ~5-15 min, stuurt een proefmelding)
//  POST {uit: endpoint}        uitzetten
//  POST {test: endpoint}       nog een proefmelding bij de volgende controle
require __DIR__ . '/common.php';
require __DIR__ . '/push-lib.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $e = (string)($_GET['endpoint'] ?? '');
  // Wanneer de waarschuw-taak laatst goed draaide (de pagina meldt het als dat te lang geleden is).
  $ok = null; $hist = [];
  try {
    require_once __DIR__ . '/store.php';
    $db = store_db();
    $ok = (int)(store_meta($db, 'alert_ok') ?? 0) ?: null;
    $hist = array_reverse(json_decode(store_meta($db, 'alerts_hist') ?? '[]', true) ?: []);
  } catch (Throwable $x) { $ok = null; }
  json_out(200, ['publicKey' => push_public_key(), 'aan' => $e !== '' && push_has($e), 'laatst' => $ok, 'meldingen' => $hist, 'aantal' => count(push_subs())]);
}
$in = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($in)) json_out(400, ['error' => 'Ongeldige aanvraag.']);
if (isset($in['uit'])) { push_remove([(string)$in['uit']]); json_out(200, ['ok' => true]); }
if (isset($in['test'])) json_out(200, ['ok' => push_mark_test((string)$in['test'])]);
if (is_array($in['subscription'] ?? null) && push_add($in['subscription'], (string)($in['label'] ?? ''))) json_out(200, ['ok' => true]);
json_out(400, ['error' => 'Dit abonnement wordt niet geaccepteerd.']);
