<?php
// Test van "Nakijken" (php/api/nakijken-lib.php). Gebruik: php tests/nakijken.php
declare(strict_types=1);
define('PRIV', sys_get_temp_dir() . '/klaro-nakijktest-' . getmypid());
@mkdir(PRIV);
require __DIR__ . '/../php/api/nakijken-lib.php';

$ok = 0; $bad = 0;
function check(string $name, bool $c): void { global $ok, $bad; echo ($c ? '✓ ' : '✗ ') . $name . "\n"; $c ? $ok++ : $bad++; }
$req = ['d' => '2026-10-26', 'dev' => 'iPhone', 'site' => 'voorbeeld.nl', 'name' => 'voorbeeld.nl', 's' => 1792950000000, 'e' => 1792950060000];
$id = nakijken_add($req, 1);
check('verzoek bewaard', $id !== '' && count(nakijken_list()) === 1 && nakijken_list()[0]['done'] === 0);
check('twee keer tikken: één verzoek', nakijken_add($req, 2) === $id && count(nakijken_list()) === 1);
check('zonder site of begintijd: geweigerd', nakijken_add(['site' => '', 's' => 5], 3) === '' && nakijken_add(['site' => 'x.nl', 's' => 0], 3) === '');
check('vreemde tekens weg, lengte begrensd', strlen(nakijken_list()[0]['site']) <= 120);
check('nagekeken met antwoord', nakijken_done($id, "Klopt: echt bezoek.\n", 9) && nakijken_list()[0]['antwoord'] === 'Klopt: echt bezoek.' && nakijken_list()[0]['done'] === 9);
check('onbekend id: niets', !nakijken_done('onbekend', 'x', 9));
check('na nakijken mag hetzelfde bezoek opnieuw', nakijken_add($req, 10) !== $id && count(nakijken_list()) === 2);
array_map('unlink', glob(PRIV . '/*')); rmdir(PRIV);
echo "\n$ok goed, $bad fout\n";
exit($bad ? 1 : 0);
