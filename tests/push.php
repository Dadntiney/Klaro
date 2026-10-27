<?php
// Test van de push-abonnementen (php/api/push-lib.php). Draait bij elke update (GitHub Actions). Gebruik: php tests/push.php
declare(strict_types=1);
define('PRIV', sys_get_temp_dir() . '/klaro-pushtest-' . getmypid());
@mkdir(PRIV);
require __DIR__ . '/../php/api/push-lib.php';

$ok = 0; $bad = 0;
function check(string $name, bool $c): void { global $ok, $bad; echo ($c ? '✓ ' : '✗ ') . $name . "\n"; $c ? $ok++ : $bad++; }
$apple = ['endpoint' => 'https://web.push.apple.com/QAbc', 'keys' => ['p256dh' => 'BPub', 'auth' => 'Auth']];

check('abonnement van Apple wordt bewaard', push_add($apple, 'iPhone') && count(push_subs()) === 1);
check('nep-adres (niet van een push-dienst) wordt geweigerd', !push_add(['endpoint' => 'https://kwaadaardig.example/x', 'keys' => ['p256dh' => 'a', 'auth' => 'b']], 'x'));
check('zonder sleutels geweigerd', !push_add(['endpoint' => 'https://web.push.apple.com/Q2'], 'x'));
check('opnieuw aanzetten: geen dubbel abonnement', push_add($apple, 'iPhone') && count(push_subs()) === 1);
check('nieuw abonnement krijgt één keer een proefmelding', push_take_tests() === [$apple['endpoint']] && push_take_tests() === []);
check('proefmelding opnieuw aanvragen', push_mark_test($apple['endpoint']) && push_take_tests() === [$apple['endpoint']]);
check('onbekend abonnement: geen proefmelding', !push_mark_test('https://web.push.apple.com/onbekend'));
check('bekend abonnement herkend', push_has($apple['endpoint']) && !push_has('https://web.push.apple.com/onbekend'));
check('abonnementen geven geen labels of tijden mee aan de taak', array_keys(push_subs()[0]) === ['endpoint', 'keys']);
push_remove([$apple['endpoint']]);
check('uitzetten haalt het abonnement weg', push_subs() === []);
check('geen openbare sleutel zolang de server niet klaar is', push_public_key() === '');

$now = 100 * 86_400_000;
$h = [['t' => $now - 31 * 86_400_000, 'title' => 'oud', 'body' => ''], ['t' => $now - 86_400_000, 'title' => 'a', 'body' => ''], ['t' => $now - 1000, 'title' => 'b', 'body' => '']];
check('laatste meldingen: ouder dan 30 dagen weg, nieuwste eerst', array_column(push_hist_visible($h, $now), 'title') === ['b', 'a']);
check('melding wegtikken haalt alleen die ene weg', array_column(push_hist_without($h, $now - 86_400_000, 'a'), 'title') === ['oud', 'b']);
check('wegtikken met verkeerde titel laat alles staan', count(push_hist_without($h, $now - 86_400_000, 'x')) === 3);

// Het PHP-sluitteken (vraagteken + groter-dan) in een opmerking beëindigt PHP: de rest wordt dan als tekst getoond (20 okt, push.php). Alleen setup.php mag het (HTML).
foreach (glob(__DIR__ . '/../php/api/*.php') as $f) if (basename($f) !== 'setup.php') check(basename($f) . ' bevat geen "?>"', strpos((string)file_get_contents($f), '?' . '>') === false);

array_map('unlink', glob(PRIV . '/*') ?: []);
@rmdir(PRIV);
echo "\n$ok goed, $bad fout\n";
exit($bad ? 1 : 0);
