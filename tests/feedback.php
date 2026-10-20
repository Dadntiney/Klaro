<?php
// Test van "Klopt niet" (php/api/feedback-lib.php). Draait bij elke update (GitHub Actions). Gebruik: php tests/feedback.php
declare(strict_types=1);
define('PRIV', sys_get_temp_dir() . '/klaro-feedbacktest-' . getmypid());
@mkdir(PRIV);
require __DIR__ . '/../php/api/feedback-lib.php';

$ok = 0; $bad = 0;
function check(string $name, bool $c): void { global $ok, $bad; echo ($c ? '✓ ' : '✗ ') . $name . "\n"; $c ? $ok++ : $bad++; }

$id = feedback_add(['kind' => 'fout', 'dev' => 'iPad', 'site' => 'voorbeeld.nl', 's' => 1000, 'e' => 2000, 'note' => "niet\ngebruikt"], 5);
check('melding wordt bewaard', $id !== '' && count(feedback_list()) === 1);
$x = feedback_list()[0];
check('velden goed bewaard, regeleinde weg', $x['site'] === 'voorbeeld.nl' && $x['s'] === 1000 && $x['note'] === 'niet gebruikt' && $x['done'] === 0);
check('onbekende soort geweigerd', feedback_add(['kind' => 'iets', 'site' => 'a.nl'], 5) === '');
check('lege melding geweigerd', feedback_add(['kind' => 'gemist'], 5) === '');
check('gemist met alleen tekst mag', feedback_add(['kind' => 'gemist', 'note' => 'spelletje om 9 uur'], 6) !== '');
check('lange tekst ingekort', feedback_add(['kind' => 'gemist', 'note' => str_repeat('a', 900)], 7) !== '' && mb_strlen(feedback_list()[2]['note']) === 500);
check('afhandelen met antwoord', feedback_done($id, 'Opgelost: telt nu niet meer.', 9) && feedback_list()[0]['done'] === 9 && feedback_list()[0]['antwoord'] !== '');
check('onbekend id niet afgehandeld', !feedback_done('bestaatniet', '', 9));
for ($i = 0; $i < FEEDBACK_MAX + 5; $i++) feedback_add(['kind' => 'gemist', 'note' => "n$i"], 10 + $i);
check('hooguit ' . FEEDBACK_MAX . ' bewaard, oudste weg', count($l = feedback_list()) === FEEDBACK_MAX && $l[FEEDBACK_MAX - 1]['note'] === 'n' . (FEEDBACK_MAX + 4));

array_map('unlink', glob(PRIV . '/*') ?: []);
@rmdir(PRIV);
echo "\n$ok goed, $bad fout\n";
exit($bad ? 1 : 0);
