<?php
// Wachtwoord controleren en een nieuwe sessie starten. Na 2 uur zonder gebruik is opnieuw inloggen nodig (zie common.php).
require __DIR__ . '/common.php';
$cfg = klaro_config();
$given = (string)($_POST['password'] ?? '');
if ($cfg && auth_blocked()) {
  header('Location: /login?fout=2', true, 303);
  exit;
}
if (!$cfg || $_SERVER['REQUEST_METHOD'] !== 'POST' || !password_ok($cfg, $given)) {
  if ($cfg && $_SERVER['REQUEST_METHOD'] === 'POST') auth_failed();
  usleep(800000); // raden afremmen
  header('Location: /login?fout=1', true, 303);
  exit;
}
session_start_new();
header('Location: /', true, 303);
