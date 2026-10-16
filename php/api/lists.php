<?php
// Welke adressen staan op de 18+- of datinglijst? POST {"hosts":[...]} -> {"adult":[...], "dating":[...]} (de gevonden
// adressen of bovenliggende domeinen). De lijsten staan per vakje (eerste 2 tekens van md5) in _private/lists/.
require __DIR__ . '/common.php';
require_login();
$in = json_decode((string)file_get_contents('php://input'), true);
$hosts = is_array($in['hosts'] ?? null) ? array_slice($in['hosts'], 0, 5000) : [];

$cands = [];
foreach ($hosts as $h) {
  if (!is_string($h) || strlen($h) > 253) continue;
  $parts = explode('.', strtolower($h));
  for ($i = 0; $i < count($parts) - 1; $i++) {
    $c = implode('.', array_slice($parts, $i));
    $cands[substr(md5($c), 0, 2)][$c] = true;
  }
}
$out = ['adult' => [], 'dating' => []];
foreach (['adult', 'dating'] as $name) {
  foreach ($cands as $bucket => $list) {
    $f = PRIV . "/lists/$name/$bucket.txt";
    if (!is_file($f)) continue;
    $data = file_get_contents($f); // "\n" + adressen gescheiden door "\n" + "\n"
    foreach ($list as $c => $_) if (strpos($data, "\n" . $c . "\n") !== false) $out[$name][] = $c;
  }
}
json_out(200, $out);
