<?php
// "Nakijken": de eigenaar tikt in Klaro bij een regel op "Nakijken"; Claude zoekt het uit en zet er een kort antwoord bij.
// Bewaard in _private/nakijken.json (hooguit 300, oudste eerst weg).
declare(strict_types=1);
if (!defined('PRIV')) define('PRIV', __DIR__ . '/_private');
const NAKIJKEN = PRIV . '/nakijken.json';
const NAKIJKEN_MAX = 300;

function nakijken_with(callable $fn) {
  $lock = fopen(PRIV . '/nakijken.lock', 'c');
  flock($lock, LOCK_EX);
  $list = is_file(NAKIJKEN) ? json_decode((string)file_get_contents(NAKIJKEN), true) : [];
  if (!is_array($list)) $list = [];
  $before = json_encode($list);
  $result = $fn($list);
  if (json_encode($list) !== $before) {
    file_put_contents(NAKIJKEN . '.tmp', json_encode($list, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    rename(NAKIJKEN . '.tmp', NAKIJKEN);
  }
  flock($lock, LOCK_UN);
  fclose($lock);
  return $result;
}

function nakijken_text($v, int $max): string {
  $s = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string)$v) ?? '');
  return mb_substr($s, 0, $max);
}

/** Nieuw verzoek; hetzelfde bezoek (apparaat, site, begin) dat nog open staat, komt er niet nog eens bij. Geeft het id, of ''. */
function nakijken_add(array $in, int $now): string {
  $item = [
    'd' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($in['d'] ?? '')) ? (string)$in['d'] : '',
    'dev' => nakijken_text($in['dev'] ?? '', 80),
    'site' => nakijken_text($in['site'] ?? '', 120),
    'name' => nakijken_text($in['name'] ?? '', 120),
    's' => is_numeric($in['s'] ?? null) ? (int)$in['s'] : 0,
    'e' => is_numeric($in['e'] ?? null) ? (int)$in['e'] : 0,
  ];
  if ($item['site'] === '' || $item['s'] <= 0) return '';
  return nakijken_with(function (array &$list) use ($item, $now) {
    foreach ($list as $x) if (!$x['done'] && $x['dev'] === $item['dev'] && $x['site'] === $item['site'] && $x['s'] === $item['s']) return $x['id'];
    $item = ['id' => bin2hex(random_bytes(6)), 'at' => $now] + $item + ['done' => 0, 'antwoord' => ''];
    $list[] = $item;
    if (count($list) > NAKIJKEN_MAX) $list = array_slice($list, -NAKIJKEN_MAX);
    return $item['id'];
  });
}

function nakijken_list(): array { return nakijken_with(fn(array &$list) => $list); }

/** Nagekeken, met een kort antwoord voor de eigenaar. */
function nakijken_done(string $id, string $antwoord, int $now): bool {
  return nakijken_with(function (array &$list) use ($id, $antwoord, $now) {
    foreach ($list as &$x) if (($x['id'] ?? '') === $id) { $x['done'] = $now; $x['antwoord'] = nakijken_text($antwoord, 600); return true; }
    return false;
  });
}
