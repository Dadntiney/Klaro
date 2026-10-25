<?php
// Gedeeld door alle api-bestanden: instellingen, inloggen, antwoorden. Geheimen staan alleen in _private/config.php
// (aangemaakt via setup.php) en komen nooit in de pagina of in de code op GitHub.
declare(strict_types=1);
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if (!defined('PRIV')) define('PRIV', __DIR__ . '/_private'); // tests gebruiken een eigen map
const OLD_COOKIE = 'klaro_auth'; // oud cookie (vóór 16 okt 2026): wordt niet meer geaccepteerd en bij inloggen opgeruimd
const SID_COOKIE = 'klaro_sid';
/** Na zoveel seconden zonder gebruik (op geen enkel apparaat) is iedereen uitgelogd. */
const IDLE = 30 * 86400; // 30 dagen niet gebruikt (op geen enkel apparaat): opnieuw inloggen (was 60 minuten; wens eigenaar 25 okt)
const SESSIONS = PRIV . '/sessions.json';

function klaro_config(): ?array {
  $f = PRIV . '/config.php';
  if (!is_file($f)) return null;
  $c = require $f;
  return is_array($c) && !empty($c['key']) && !empty($c['profile']) && !empty($c['password']) ? $c : null;
}

function json_out(int $status, $body): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}

/**
 * Inlogsessies, op de server bijgehouden in _private/sessions.json:
 *   last  = laatste keer dat de app echt gebruikt werd (tikken, scrollen, typen, een pagina openen), op welk apparaat dan ook;
 *   s     = actieve sessies (sleutel: sha256 van het cookie; het cookie zelf staat nergens op de server);
 *   gone  = sessies die door inactiviteit zijn verlopen (om de juiste melding te tonen), 7 dagen bewaard.
 * Automatische verzoeken (live bijwerken, alles ophalen, lijsten) lezen alleen; ze verlengen nooit iets.
 */
function sessions_with(callable $fn) {
  $lock = fopen(PRIV . '/sessions.lock', 'c');
  flock($lock, LOCK_EX);
  $raw = is_file(SESSIONS) ? (string)file_get_contents(SESSIONS) : '';
  $s = json_decode($raw, true);
  if (!is_array($s)) $s = [];
  $s += ['last' => 0, 's' => [], 'gone' => []];
  $before = json_encode($s);
  $result = $fn($s);
  $after = json_encode($s);
  if ($after !== $before) {
    file_put_contents(SESSIONS . '.tmp', $after);
    rename(SESSIONS . '.tmp', SESSIONS);
  }
  flock($lock, LOCK_UN);
  fclose($lock);
  return $result;
}

function sid_hash(): ?string {
  $sid = $_COOKIE[SID_COOKIE] ?? '';
  return is_string($sid) && preg_match('/^[a-f0-9]{64}$/', $sid) ? hash('sha256', $sid) : null;
}

function set_sid_cookie(string $value, int $expires): void {
  setcookie(SID_COOKIE, $value, ['expires' => $expires, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
}

/**
 * Is deze sessie geldig? 'ok', 'verlopen' (30 dagen niet gebruikt: dan zijn alle sessies ongeldig gemaakt) of 'geen'.
 * $used: dit verzoek is echt gebruik (seconden geleden, 0 = nu); null = automatisch verzoek, verlengt niets.
 */
function session_state(?int $used = null): string {
  $h = sid_hash();
  if ($h === null) return 'geen';
  return sessions_with(function (array &$s) use ($h, $used) {
    $now = time();
    foreach ($s['gone'] as $k => $t) if ($now - (int)$t > 7 * 86400) unset($s['gone'][$k]);
    if (!isset($s['s'][$h])) return isset($s['gone'][$h]) ? 'verlopen' : 'geen';
    if ($now - (int)$s['last'] >= IDLE) {
      foreach ($s['s'] as $k => $_) $s['gone'][$k] = $now; // alle sessies van de gebruiker, op alle apparaten
      $s['s'] = [];
      return 'verlopen';
    }
    if ($used !== null) {
      $t = $now - max(0, min(60, $used));
      if ($t > (int)$s['last']) $s['last'] = $t;
      $s['s'][$h]['a'] = max((int)($s['s'][$h]['a'] ?? 0), $t);
    }
    return 'ok';
  });
}

/** Nieuwe sessie na inloggen (telt als gebruik). */
function session_start_new(): void {
  $sid = bin2hex(random_bytes(32));
  $ua = substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 120);
  sessions_with(function (array &$s) use ($sid, $ua) {
    $now = time();
    if ($now - (int)$s['last'] >= IDLE) $s['s'] = []; // oude, al verlopen sessies opruimen
    $s['s'][hash('sha256', $sid)] = ['c' => $now, 'a' => $now, 'ua' => $ua];
    $s['last'] = $now;
  });
  set_sid_cookie($sid, time() + 400 * 86400); // het cookie mag blijven; de server bepaalt of de sessie nog geldt
  setcookie(OLD_COOKIE, '', ['expires' => 1, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
}

/** Uitloggen: alleen dit apparaat, of ($all) alle apparaten. */
function session_end(bool $all): void {
  $h = sid_hash();
  sessions_with(function (array &$s) use ($h, $all) {
    if ($h === null || !isset($s['s'][$h])) return; // alleen wie zelf ingelogd is, kan (overal) uitloggen
    if ($all) $s['s'] = [];
    else unset($s['s'][$h]);
  });
  set_sid_cookie('', 1);
}

/** Wachtwoord vergelijken zonder dat de lengte via de tijd uitlekt. */
function password_ok(array $cfg, string $given): bool {
  return $given !== '' && hash_equals(hash('sha256', (string)$cfg['password']), hash('sha256', $given));
}

/**
 * Raden afremmen, voor inlogscherm en basic-auth samen: na 20 foute wachtwoorden in 15 minuten is alles met een wachtwoord
 * 15 minuten dicht (429). Alleen foute pogingen tellen; verzoeken zonder wachtwoord (de pagina zelf, live) niet.
 */
const FAILS = PRIV . '/fails.json';
function auth_blocked(): bool {
  $s = is_file(FAILS) ? json_decode((string)file_get_contents(FAILS), true) : [];
  $now = time();
  return count(array_filter(is_array($s) ? $s : [], fn($t) => is_int($t) && $now - $t < 900)) >= 20;
}
function auth_failed(): void {
  $h = fopen(FAILS, 'c+');
  if (!$h) return;
  flock($h, LOCK_EX);
  $s = json_decode((string)stream_get_contents($h), true);
  $now = time();
  $s = array_values(array_filter(is_array($s) ? $s : [], fn($t) => is_int($t) && $now - $t < 900));
  $s[] = $now;
  ftruncate($h, 0); rewind($h); fwrite($h, json_encode(array_slice($s, -50)));
  flock($h, LOCK_UN); fclose($h);
}

/** Basic-auth (voor scripts zoals de dagelijkse controle): elk verzoek met het wachtwoord; geen sessie, verlengt niets. */
function basic_auth_ok(array $cfg): bool {
  $pw = $_SERVER['PHP_AUTH_PW'] ?? null;
  if ($pw === null) {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (stripos($h, 'Basic ') === 0) {
      $d = base64_decode(substr($h, 6), true) ?: '';
      $pw = substr($d, strpos($d, ':') === false ? 0 : strpos($d, ':') + 1);
    }
  }
  if ($pw === null || $pw === '') return false;
  if (auth_blocked()) json_out(429, ['error' => 'Te vaak een fout wachtwoord. Probeer het over 15 minuten opnieuw.']);
  if (password_ok($cfg, $pw)) return true;
  auth_failed();
  return false;
}

/** Alleen ingelogd verder; anders 401 (de pagina gaat dan naar het inlogscherm, met de reden in X-Klaro-Login). */
function require_login(): array {
  $cfg = klaro_config();
  if (!$cfg) json_out(503, ['error' => 'Klaro is nog niet ingesteld (open /api/setup.php).']);
  if (basic_auth_ok($cfg)) return $cfg;
  $state = session_state(null);
  if ($state === 'ok') return $cfg;
  header('X-Klaro-Login: ' . ($state === 'verlopen' ? 'verlopen' : 'nodig'));
  json_out(401, ['error' => $state === 'verlopen' ? 'Automatisch uitgelogd: de app is 30 dagen niet gebruikt.' : 'Inloggen vereist.']);
}

/**
 * Nieuw inlogwachtwoord opslaan (sleutel en profiel blijven). Alle andere sessies vervallen (wie het oude wachtwoord kende,
 * is overal uitgelogd); deze sessie blijft. Geeft een foutmelding terug, of null als het gelukt is.
 */
function password_change(array $cfg, string $current, string $new): ?string {
  if (!password_ok($cfg, $current)) { auth_failed(); return 'Het huidige wachtwoord klopt niet.'; }
  if (strlen($new) < 12) return 'Kies een nieuw wachtwoord van minstens 12 tekens.';
  if (hash_equals((string)$cfg['password'], $new)) return 'Het nieuwe wachtwoord is hetzelfde als het oude.';
  $cfg['password'] = $new;
  $f = PRIV . '/config.php';
  if (@file_put_contents($f . '.tmp', "<?php\nreturn " . var_export($cfg, true) . ";\n", LOCK_EX) === false || !@rename($f . '.tmp', $f)) return 'Opslaan lukt niet op de server.';
  @chmod($f, 0600);
  if (function_exists('opcache_invalidate')) @opcache_invalidate($f, true);
  $h = sid_hash();
  sessions_with(function (array &$s) use ($h) {
    foreach ($s['s'] as $k => $_) if ($k !== $h) { $s['gone'][$k] = time(); unset($s['s'][$k]); }
  });
  return null;
}
