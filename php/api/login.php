<?php
// Wachtwoord controleren en een nieuwe sessie starten. Na 60 minuten zonder gebruik is opnieuw inloggen nodig (zie common.php).
require __DIR__ . '/common.php';
$cfg = klaro_config();
$given = (string)($_POST['password'] ?? '');
if (!$cfg || $_SERVER['REQUEST_METHOD'] !== 'POST' || !hash_equals($cfg['password'], $given)) {
  usleep(800000); // raden afremmen
  header('Location: /login?fout=1', true, 303);
  exit;
}
session_start_new();
header('Location: /', true, 303);
