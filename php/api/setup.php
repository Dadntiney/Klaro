<?php
// Eenmalig instellen: NextDNS-sleutel, profiel en het inlogwachtwoord. Daarna weigert deze pagina (alles staat dan vast).
require __DIR__ . '/common.php';
header('Content-Type: text/html; charset=utf-8');
if (klaro_config()) { http_response_code(404); echo 'Klaro is al ingesteld.'; exit; }
$err = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $key = trim((string)($_POST['key'] ?? ''));
  $profile = trim((string)($_POST['profile'] ?? ''));
  $pw = (string)($_POST['password'] ?? '');
  if (!preg_match('/^[A-Za-z0-9]{6,20}$/', $profile)) $err = 'Profiel-ID klopt niet (bijv. abc123).';
  elseif (strlen($key) < 20) $err = 'API-sleutel lijkt te kort.';
  elseif (strlen($pw) < 10) $err = 'Kies een wachtwoord van minstens 10 tekens.';
  else {
    @mkdir(PRIV, 0700, true);
    $php = "<?php\nreturn " . var_export(['key' => $key, 'profile' => $profile, 'password' => $pw], true) . ";\n";
    file_put_contents(PRIV . '/config.php', $php, LOCK_EX);
    @chmod(PRIV . '/config.php', 0600);
    header('Location: /login', true, 303);
    exit;
  }
}
?><!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Klaro instellen</title>
<body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:0 16px">
<h1>Klaro instellen</h1>
<p>Eenmalig. Daarna is deze pagina dicht.</p>
<?php if ($err) echo '<p style="color:#c00">' . htmlspecialchars($err) . '</p>'; ?>
<form method="post">
<p><label>NextDNS API-sleutel (my.nextdns.io → Account → API)<br><input name="key" type="password" required style="width:100%"></label></p>
<p><label>NextDNS profiel-ID (staat in het adres, bijv. abc123)<br><input name="profile" required style="width:100%"></label></p>
<p><label>Nieuw inlogwachtwoord voor Klaro (minstens 10 tekens)<br><input name="password" type="password" required minlength="10" style="width:100%"></label></p>
<p><button type="submit">Opslaan</button></p>
</form></body></html>
