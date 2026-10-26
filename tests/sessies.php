<?php
// Test van de inlogsessies (php/api/common.php) met een eigen tijdelijke map; draait bij elke update (GitHub Actions).
// Gebruik: php tests/sessies.php
declare(strict_types=1);
set_error_handler(fn($n, $m) => strpos($m, 'headers already sent') !== false); // koppen (cookies) doen in de test niets
define('PRIV', sys_get_temp_dir() . '/klaro-sessietest-' . getmypid());
@mkdir(PRIV);
require __DIR__ . '/../php/api/common.php';

$ok = 0; $bad = 0;
function check(string $name, bool $c): void { global $ok, $bad; echo ($c ? '✓ ' : '✗ ') . $name . "\n"; $c ? $ok++ : $bad++; }
function S(): array { return json_decode((string)file_get_contents(SESSIONS), true); }
function setLast(int $ago): void { $s = S(); $s['last'] = time() - $ago; file_put_contents(SESSIONS, json_encode($s)); }
function use_cookie(string $sid): void { $_COOKIE[SID_COOKIE] = $sid; }

$_COOKIE = [];
check('zonder cookie: geen sessie', session_state(null) === 'geen');
// twee apparaten inloggen (cookie zoals login.php het zet)
$a = bin2hex(random_bytes(32)); $b = bin2hex(random_bytes(32));
foreach ([$a, $b] as $sid) sessions_with(function (array &$s) use ($sid) { $s['s'][hash('sha256', $sid)] = ['c' => time(), 'a' => time()]; $s['last'] = time(); });
use_cookie($a);
check('ingelogd: geldig', session_state(null) === 'ok');
check('het cookie zelf staat niet op de server', strpos((string)file_get_contents(SESSIONS), $a) === false);
setLast(119 * 60); $last = S()['last'];
check('1 uur 59 niet gebruikt: nog geldig', session_state(null) === 'ok');
check('automatisch verkeer verlengt niets', S()['last'] === $last);
check('gebruik reset de timer', session_state(0) === 'ok' && time() - S()['last'] <= 1);
setLast(30 * 60); session_state(20);
check('gebruik van 20 s geleden telt vanaf dat moment', abs(time() - 20 - S()['last']) <= 1);
check('"geleden" kan niet verder terug dan 60 s', (function () { setLast(30 * 60); session_state(99999); return abs(time() - 60 - S()['last']) <= 1; })());
use_cookie($b); session_state(0); use_cookie($a); setLast(10);
check('gebruik op apparaat B houdt apparaat A geldig', session_state(null) === 'ok');
setLast(2 * 3600);
check('2 uur niet gebruikt: verlopen', session_state(null) === 'verlopen');
check('alle sessies (alle apparaten) ongeldig', S()['s'] === []);
use_cookie($b);
check('ook het andere apparaat ziet "verlopen"', session_state(0) === 'verlopen');
check('gebruik na verloop maakt niets weer geldig', session_state(0) === 'verlopen' && S()['s'] === []);
use_cookie(str_repeat('0', 64));
check('onbekend cookie: geen sessie', session_state(0) === 'geen');
use_cookie('niet-hex');
check('vreemd cookie: geen sessie', session_state(0) === 'geen');
// uitloggen
foreach ([$a, $b] as $sid) sessions_with(function (array &$s) use ($sid) { $s['s'][hash('sha256', $sid)] = ['c' => time(), 'a' => time()]; $s['last'] = time(); });
$_COOKIE = []; session_end(true);
check('zonder sessie kan niemand (overal) uitloggen', count(S()['s']) === 2);
use_cookie($a); session_end(false);
check('uitloggen: alleen dit apparaat', count(S()['s']) === 1);
use_cookie($b); session_end(true);
check('overal uitloggen: iedereen uit', S()['s'] === []);
// basic-auth (scripts)
$cfg = ['password' => 'geheim-wachtwoord'];
$_SERVER['HTTP_AUTHORIZATION'] = 'Basic ' . base64_encode('klaro:geheim-wachtwoord');
check('script met juist wachtwoord', basic_auth_ok($cfg));
$_SERVER['HTTP_AUTHORIZATION'] = 'Basic ' . base64_encode('klaro:fout');
check('script met fout wachtwoord geweigerd', !basic_auth_ok($cfg));

// Raden afremmen (inlogscherm en basic-auth samen) en wachtwoord vergelijken zonder lengte-lek.
@unlink(FAILS);
check('goed wachtwoord via password_ok', password_ok($cfg, $cfg['password']));
check('leeg wachtwoord nooit goed', !password_ok($cfg, ''));
check('langer wachtwoord met hetzelfde begin is fout', !password_ok($cfg, $cfg['password'] . 'x'));
for ($i = 0; $i < 19; $i++) auth_failed();
check('19 fouten: nog niet dicht', !auth_blocked());
auth_failed();
check('20 fouten in 15 min: dicht', auth_blocked());
file_put_contents(FAILS, json_encode(array_fill(0, 30, time() - 901)));
check('oude fouten (> 15 min) tellen niet', !auth_blocked());
@unlink(FAILS);

array_map('unlink', glob(PRIV . '/*')); rmdir(PRIV);
echo "\n$ok goed, $bad fout\n";
exit($bad ? 1 : 0);
