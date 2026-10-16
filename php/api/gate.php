<?php
// De pagina zelf (/) alleen met een geldige sessie; anders naar het inlogscherm. Een pagina openen telt als gebruik.
require __DIR__ . '/common.php';
$cfg = klaro_config();
$state = $cfg ? session_state(0) : 'geen';
if ($state !== 'ok' && !($cfg && basic_auth_ok($cfg))) {
  header('Location: /login' . ($state === 'verlopen' ? '?verlopen=1' : ''), true, 303);
  exit;
}
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, private');
readfile(dirname(__DIR__) . '/index.html');
