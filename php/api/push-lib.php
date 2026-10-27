<?php
// Push-abonnementen (Klaro op het beginscherm van een iPhone): _private/push.json. Gedeeld door push.php en alert.php.

function push_with(callable $fn) {
  $f = PRIV . '/push.json';
  $h = fopen($f, 'c+');
  flock($h, LOCK_EX);
  $s = json_decode((string)stream_get_contents($h), true);
  if (!is_array($s) || !is_array($s['subs'] ?? null)) $s = ['subs' => []];
  $out = $fn($s);
  ftruncate($h, 0);
  rewind($h);
  fwrite($h, json_encode($s, JSON_UNESCAPED_SLASHES));
  fflush($h);
  flock($h, LOCK_UN);
  fclose($h);
  return $out;
}

/** Alleen geldige abonnementen van de echte push-diensten (Apple, Google, Mozilla, Microsoft). */
function push_valid(array $sub): bool {
  $e = (string)($sub['endpoint'] ?? '');
  return (bool)preg_match('~^https://([a-z0-9.-]+\.)?(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)/~', $e)
    && is_string($sub['keys']['p256dh'] ?? null) && is_string($sub['keys']['auth'] ?? null) && strlen($e) < 1000;
}

function push_subs(): array {
  return push_with(fn(array &$s) => array_values(array_map(fn($x) => ['endpoint' => $x['endpoint'], 'keys' => $x['keys']], $s['subs'])));
}

/** Nieuw abonnement (of vernieuwd); krijgt bij de volgende controle een proefmelding. */
function push_add(array $sub, string $label): bool {
  if (!push_valid($sub)) return false;
  return push_with(function (array &$s) use ($sub, $label) {
    $s['subs'] = array_values(array_filter($s['subs'], fn($x) => $x['endpoint'] !== $sub['endpoint']));
    $s['subs'][] = ['endpoint' => $sub['endpoint'], 'keys' => ['p256dh' => $sub['keys']['p256dh'], 'auth' => $sub['keys']['auth']], 'label' => substr($label, 0, 40), 'added' => time(), 'test' => 1];
    $s['subs'] = array_slice($s['subs'], -10);
    return true;
  });
}

function push_remove(array $endpoints): void {
  push_with(function (array &$s) use ($endpoints) { $s['subs'] = array_values(array_filter($s['subs'], fn($x) => !in_array($x['endpoint'], $endpoints, true))); });
}

function push_has(string $endpoint): bool {
  return push_with(fn(array &$s) => (bool)array_filter($s['subs'], fn($x) => $x['endpoint'] === $endpoint));
}

function push_mark_test(string $endpoint): bool {
  return push_with(function (array &$s) use ($endpoint) {
    $hit = false;
    foreach ($s['subs'] as &$x) if ($x['endpoint'] === $endpoint) { $x['test'] = 1; $hit = true; }
    return $hit;
  });
}

/** Abonnementen die een proefmelding moeten krijgen (eenmalig: de vlag gaat eraf). */
function push_take_tests(): array {
  return push_with(function (array &$s) {
    $out = [];
    foreach ($s['subs'] as &$x) if (!empty($x['test'])) { $out[] = $x['endpoint']; unset($x['test']); }
    return $out;
  });
}

/** Openbare sleutel (VAPID) voor het abonneren, gemaakt bij het live zetten. */
function push_public_key(): string {
  return is_file(PRIV . '/vapid.pub') ? trim((string)file_get_contents(PRIV . '/vapid.pub')) : '';
}

const PUSH_HIST_DAYS = 30; // meldingen blijven 30 dagen in "Laatste meldingen", tenzij de eigenaar ze eerder wegtikt

/** De meldingen die de pagina toont: van de laatste 30 dagen, nieuwste eerst. */
function push_hist_visible(array $hist, int $now): array {
  return array_values(array_reverse(array_filter($hist, fn($m) => is_array($m) && $now - (int)($m['t'] ?? 0) < PUSH_HIST_DAYS * 86_400_000)));
}

/** Eén melding weggetikt (tijdstip + titel, zodat twee meldingen op dezelfde ms niet allebei verdwijnen). */
function push_hist_without(array $hist, int $t, string $title): array {
  return array_values(array_filter($hist, fn($m) => !(is_array($m) && (int)($m['t'] ?? 0) === $t && (string)($m['title'] ?? '') === $title)));
}

