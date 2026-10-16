<?php
// Wachtwoord controleren en het apparaat 180 dagen ingelogd houden.
require __DIR__ . '/common.php';
$cfg = klaro_config();
$given = (string)($_POST['password'] ?? '');
if (!$cfg || $_SERVER['REQUEST_METHOD'] !== 'POST' || !hash_equals($cfg['password'], $given)) {
  usleep(800000); // raden afremmen
  header('Location: /login?fout=1', true, 303);
  exit;
}
setcookie(AUTH_COOKIE, auth_token($cfg['password']), [
  'expires' => time() + AUTH_DAYS * 86400, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax',
]);
header('Location: /', true, 303);
