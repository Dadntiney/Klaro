<?php
// Voorpagina van een adres ophalen en kijken of het een echte website is (alleen na inloggen, alleen voor de controles):
// GET ?host=voorbeeld.nl -> {soort: website|doorsturen|leeg|techniek|geen pagina|onbereikbaar, titel, naar, code}.
// Alleen de voorpagina, zonder cookies; 18+/dating wordt nooit opgehaald. Uitkomst 30 dagen bewaard in _private/sitecheck.json.
require __DIR__ . '/common.php';
require __DIR__ . '/sitecheck-lib.php';
require_login();

$host = sitecheck_host((string)($_GET['host'] ?? ''));
if ($host === null) json_out(400, ['error' => 'Geen geldig adres.']);
if (sitecheck_refuse_word($host)) json_out(200, ['soort' => 'overgeslagen', 'uitleg' => '18+/dating: nooit ophalen']);
// Ook niet als het adres (of een bovenliggend domein) op de 18+- of datinglijst staat.
$parts = explode('.', $host);
for ($i = 0; $i < count($parts) - 1; $i++) {
  $c = implode('.', array_slice($parts, $i));
  foreach (['adult', 'dating'] as $name) {
    $f = PRIV . "/lists/$name/" . substr(md5($c), 0, 2) . '.txt';
    if (is_file($f) && strpos((string)file_get_contents($f), "\n" . $c . "\n") !== false) json_out(200, ['soort' => 'overgeslagen', 'uitleg' => '18+/dating: nooit ophalen']);
  }
}
$file = PRIV . '/sitecheck.json';
$cache = is_file($file) ? (json_decode((string)file_get_contents($file), true) ?: []) : [];
if (isset($cache[$host]) && time() - (int)$cache[$host]['t'] < 30 * 86400) json_out(200, $cache[$host]['v']);

$body = '';
$ch = curl_init('https://' . $host . '/');
curl_setopt_array($ch, [
  CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => 8,
  CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP,
  CURLOPT_USERAGENT => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  CURLOPT_HTTPHEADER => ['Accept: text/html,*/*;q=0.8', 'Accept-Language: nl,en;q=0.8'],
  // Hooguit 300 kB lezen: genoeg voor titel en tekst.
  CURLOPT_WRITEFUNCTION => function ($c, $d) use (&$body) { $body .= $d; return strlen($body) > 300000 ? 0 : strlen($d); },
]);
curl_exec($ch);
$v = sitecheck_verdict($host, (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE), (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE), (string)curl_getinfo($ch, CURLINFO_EFFECTIVE_URL), $body, curl_errno($ch) && $body === '' ? curl_error($ch) : '');
curl_close($ch);
$cache[$host] = ['t' => time(), 'v' => $v];
file_put_contents($file, json_encode($cache), LOCK_EX);
json_out(200, $v);
