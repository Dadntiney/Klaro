<?php
// "Klopt niet" en "Iets gemist?" (alleen na inloggen).
//  GET                                   alle meldingen, nieuwste eerst
//  POST {kind, dev, site, name, s, e, note}  nieuwe melding (kind: fout = deze regel klopt niet, gemist = er ontbreekt iets)
//  POST {done: id, antwoord}             afgehandeld (dagelijkse controle)
require __DIR__ . '/common.php';
require __DIR__ . '/feedback-lib.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] === 'GET') json_out(200, ['items' => array_reverse(feedback_list())]);
$in = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($in)) json_out(400, ['error' => 'Ongeldige aanvraag.']);
if (isset($in['done'])) json_out(feedback_done((string)$in['done'], (string)($in['antwoord'] ?? ''), time() * 1000) ? 200 : 404, ['ok' => true]);
$id = feedback_add($in, time() * 1000);
$id !== '' ? json_out(200, ['ok' => true, 'id' => $id]) : json_out(400, ['error' => 'Schrijf kort wat er niet klopt.']);
