<?php
// "Nakijken" (alleen na inloggen).
//  GET                                     alle verzoeken, nieuwste eerst
//  POST {d, dev, site, name, s, e}         nieuw verzoek vanuit Klaro (knop "Nakijken" bij een regel)
//  POST {done: id, antwoord}               nagekeken (alleen met het wachtwoord, door Claude via scripts/nakijken.ts)
require __DIR__ . '/common.php';
require __DIR__ . '/nakijken-lib.php';
$cfg = require_login();
if ($_SERVER['REQUEST_METHOD'] === 'GET') json_out(200, ['items' => array_reverse(nakijken_list())]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(405, ['error' => 'Niet toegestaan.']);
$in = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($in)) json_out(400, ['error' => 'Ongeldige aanvraag.']);
if (isset($in['done'])) {
  if (!basic_auth_ok($cfg)) json_out(403, ['error' => 'Alleen voor de controle.']);
  json_out(nakijken_done((string)$in['done'], (string)($in['antwoord'] ?? ''), time() * 1000) ? 200 : 404, ['ok' => true]);
}
$id = nakijken_add($in, time() * 1000);
$id !== '' ? json_out(200, ['ok' => true, 'id' => $id]) : json_out(400, ['error' => 'Dit bezoek kan niet nagekeken worden.']);
