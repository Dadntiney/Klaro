<?php
// Wachtwoord wijzigen vanuit de app (ingelogd): huidig wachtwoord + nieuw wachtwoord (twee keer). Zie password_change in common.php.
require __DIR__ . '/common.php';
$cfg = klaro_config();
if (!$cfg || $_SERVER['REQUEST_METHOD'] !== 'POST') json_out(405, ['error' => 'Alleen versturen vanuit de app.']);
if (session_state(0) !== 'ok') json_out(401, ['error' => 'Log eerst in.']);
if (auth_blocked()) json_out(429, ['error' => 'Te vaak een fout wachtwoord. Probeer het over 15 minuten opnieuw.']);
$cur = (string)($_POST['huidig'] ?? '');
$new = (string)($_POST['nieuw'] ?? '');
$again = (string)($_POST['nogmaals'] ?? '');
if ($new !== $again) json_out(400, ['error' => 'De twee nieuwe wachtwoorden zijn niet hetzelfde.']);
$err = password_change($cfg, $cur, $new);
if ($err !== null) { usleep(500000); json_out(400, ['error' => $err]); }
json_out(200, ['ok' => true]);
