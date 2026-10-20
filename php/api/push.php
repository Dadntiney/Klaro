<?php
// Meldingen op dit toestel (alleen na inloggen).
//  GET                         {publicKey, aan: <dit abonnement bekend?>} (?endpoint=... om te weten of dit toestel al aan staat)
//  POST {subscription, label}  aanzetten (de volgende controle, binnen ~5-15 min, stuurt een proefmelding)
//  POST {uit: endpoint}        uitzetten
//  POST {test: endpoint}       nog een proefmelding bij de volgende controle
require __DIR__ . '/common.php';
require __DIR__ . '/push-lib.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $e = (string)($_GET['endpoint'] ?? '');
  json_out(200, ['publicKey' => push_public_key(), 'aan' => $e !== '' && push_has($e)]);
}
$in = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($in)) json_out(400, ['error' => 'Ongeldige aanvraag.']);
if (isset($in['uit'])) { push_remove([(string)$in['uit']]); json_out(200, ['ok' => true]); }
if (isset($in['test'])) json_out(200, ['ok' => push_mark_test((string)$in['test'])]);
if (is_array($in['subscription'] ?? null) && push_add($in['subscription'], (string)($in['label'] ?? ''))) json_out(200, ['ok' => true]);
json_out(400, ['error' => 'Dit abonnement wordt niet geaccepteerd.']);
