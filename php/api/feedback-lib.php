<?php
// Meldingen van de eigenaar dat iets niet klopt ("Klopt niet" bij een regel, of "Iets gemist?"). Bewaard in
// _private/feedback.json (hooguit 300, oudste eerst weg). De dagelijkse controle leest ze, maakt er referentiegevallen van,
// lost ze op en zet ze op afgehandeld met een kort antwoord dat de eigenaar in Klaro ziet.
declare(strict_types=1);
if (!defined('PRIV')) define('PRIV', __DIR__ . '/_private');
const FEEDBACK = PRIV . '/feedback.json';
const FEEDBACK_MAX = 300;

function feedback_with(callable $fn) {
  $lock = fopen(PRIV . '/feedback.lock', 'c');
  flock($lock, LOCK_EX);
  $list = is_file(FEEDBACK) ? json_decode((string)file_get_contents(FEEDBACK), true) : [];
  if (!is_array($list)) $list = [];
  $before = json_encode($list);
  $result = $fn($list);
  if (json_encode($list) !== $before) {
    file_put_contents(FEEDBACK . '.tmp', json_encode($list, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    rename(FEEDBACK . '.tmp', FEEDBACK);
  }
  flock($lock, LOCK_UN);
  fclose($lock);
  return $result;
}

function feedback_text($v, int $max): string {
  $s = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string)$v) ?? '');
  return function_exists('mb_substr') ? mb_substr($s, 0, $max) : (preg_match('/^.{0,' . $max . '}/us', $s, $m) ? $m[0] : substr($s, 0, $max));
}

/** Nieuwe melding; geeft het id terug, of '' als er niets bruikbaars in staat. */
function feedback_add(array $in, int $now): string {
  $kind = in_array($in['kind'] ?? '', ['fout', 'gemist'], true) ? $in['kind'] : '';
  $item = [
    'kind' => $kind,
    'dev' => feedback_text($in['dev'] ?? '', 80),
    'site' => feedback_text($in['site'] ?? '', 120),
    'name' => feedback_text($in['name'] ?? '', 120),
    's' => is_numeric($in['s'] ?? null) ? (int)$in['s'] : 0,
    'e' => is_numeric($in['e'] ?? null) ? (int)$in['e'] : 0,
    'note' => feedback_text($in['note'] ?? '', 500),
  ];
  if ($kind === '' || ($item['site'] === '' && $item['note'] === '')) return '';
  $item = ['id' => bin2hex(random_bytes(6)), 'at' => $now] + $item + ['done' => 0, 'antwoord' => ''];
  feedback_with(function (array &$list) use ($item) {
    $list[] = $item;
    if (count($list) > FEEDBACK_MAX) $list = array_slice($list, -FEEDBACK_MAX);
  });
  return $item['id'];
}

function feedback_list(): array { return feedback_with(fn(array &$list) => $list); }

/** Afgehandeld (door de dagelijkse controle), met een kort antwoord voor de eigenaar. */
function feedback_done(string $id, string $antwoord, int $now): bool {
  return feedback_with(function (array &$list) use ($id, $antwoord, $now) {
    foreach ($list as &$x) if (($x['id'] ?? '') === $id) { $x['done'] = $now; $x['antwoord'] = feedback_text($antwoord, 500); return true; }
    return false;
  });
}
