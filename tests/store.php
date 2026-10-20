<?php
// Test van de eigen kopie van het logboek (php/api/store.php) met een nep-NextDNS. Draait bij elke update (GitHub Actions).
// Gebruik: php tests/store.php
declare(strict_types=1);
define('PRIV', sys_get_temp_dir() . '/klaro-opslagtest-' . getmypid());
@mkdir(PRIV);
require __DIR__ . '/../php/api/store.php';

$ok = 0; $bad = 0;
function check(string $name, bool $c): void { global $ok, $bad; echo ($c ? '✓ ' : '✗ ') . $name . "\n"; $c ? $ok++ : $bad++; }
function iso(int $ms): string { return gmdate('Y-m-d\TH:i:s', intdiv($ms, 1000)) . sprintf('.%03dZ', $ms % 1000); }
function entry(int $ms, string $host, string $dev = 'P1', string $status = 'default'): array {
  return ['timestamp' => iso($ms), 'domain' => $host, 'status' => $status, 'reasons' => [], 'clientIp' => '10.0.0.1', 'device' => ['id' => $dev, 'name' => 'Telefoon', 'model' => '']];
}
function lines(PDO $db, int $since = 0): array { ob_start(); store_out($db, $since); return array_values(array_filter(explode("\n", (string)ob_get_clean()))); }

$T = 1_760_000_000_000;
// Vullen uit een lichte download (nieuwste eerst, zoals NextDNS).
$tsv = PRIV . '/seed.tsv';
file_put_contents($tsv, implode("\t", STORE_COLS) . "\n" . implode("\t", [iso($T + 2000), 'www.b.nl', '', '', 'NL', '10.0.0.1', 'P1', 'Telefoon', '']) . "\n" . implode("\t", [iso($T), 'www.a.nl', '', '', 'NL', '10.0.0.1', 'P1', 'Telefoon', '']) . "\n");
$db = store_db(PRIV . '/logs.sqlite');
check('leeg: opnieuw vullen nodig', store_sync($db, fn() => [500, ''], $T) === 'leeg');
check('gevuld uit de download: 2 regels', store_seed($db, $tsv) === 2);

// Bijwerken: twee pagina's, met overlap (dezelfde regel nog eens) en een dubbele opvraging binnen 1,5 s.
$pages = [
  ['data' => [entry($T + 120_000, 'www.c.nl'), entry($T + 119_500, 'www.c.nl'), entry($T + 2000, 'www.b.nl')], 'meta' => ['pagination' => ['cursor' => 'p2']]],
  ['data' => [entry($T + 60_000, 'www.d.nl', 'P2', 'blocked')], 'meta' => ['pagination' => ['cursor' => null]]],
];
$asked = [];
$fetch = function (string $q) use (&$pages, &$asked) { $asked[] = $q; return [200, json_encode(array_shift($pages))]; };
check('bijwerken lukt', store_sync($db, $fetch, $T + 130_000) === 'ok');
check('vraagt vanaf de nieuwste regel min 10 minuten', str_starts_with($asked[0], 'from=' . ($T + 2000 - STORE_OVERLAP) . '&limit=1000&raw=1'));
check('tweede pagina met de cursor', str_contains($asked[1] ?? '', 'cursor=p2'));
$l = lines($db);
check('kop + 4 regels (overlap en dubbele opvraging vallen weg)', count($l) === 5);
check('nieuwste eerst', str_starts_with($l[1], iso($T + 119_500)) && str_starts_with($l[4], iso($T)));
check('zelfde kolommen als de download', count(explode("\t", $l[2])) === 9 && explode("\t", $l[2])[2] === 'blocked' && explode("\t", $l[2])[6] === 'P2');
check('gewone status leeg, zoals de download', explode("\t", $l[1])[2] === '');
check('?since: alleen nieuwere regels', count(lines($db, $T + 60_000)) === 2);

// Net bijgewerkt: niet opnieuw aankloppen.
check('binnen een minuut: rust', store_sync($db, fn() => [200, '{}'], $T + 150_000) === 'rust');
// NextDNS geeft een fout: niets veranderen.
check('fout van NextDNS: fout, niets veranderd', store_sync($db, fn() => [429, ''], $T + 200_000) === 'fout' && count(lines($db)) === 5);
// Niet alles binnen (te veel pagina's): niets bewaren, opnieuw vullen.
$endless = fn() => [200, json_encode(['data' => [entry($T + 300_000, 'www.e.nl')], 'meta' => ['pagination' => ['cursor' => 'nog']]])];
check('half binnen: onvolledig, niets bewaard', store_sync($db, $endless, $T + 400_000) === 'onvolledig' && count(lines($db)) === 5);
// Lang niet bijgewerkt: opnieuw vullen.
check('dagen oud: opnieuw vullen', store_sync($db, fn() => [200, '{}'], $T + 5 * 86_400_000) === 'oud');
// Opnieuw vullen vervangt alles.
check('opnieuw vullen vervangt de kopie', store_seed($db, $tsv) === 2 && count(lines($db)) === 3);

array_map('unlink', glob(PRIV . '/*') ?: []);
@rmdir(PRIV);
echo "\n$ok goed, $bad fout\n";
exit($bad ? 1 : 0);
