<?php
// Gedeeld door alle api-bestanden: instellingen, inloggen, antwoorden. Geheimen staan alleen in _private/config.php
// (aangemaakt via setup.php) en komen nooit in de pagina of in de code op GitHub.
declare(strict_types=1);
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const PRIV = __DIR__ . '/_private';
const AUTH_COOKIE = 'klaro_auth';
const AUTH_DAYS = 180;

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

/** Zelfde cookie als vroeger: een handtekening afgeleid van het wachtwoord (nieuw wachtwoord = iedereen uitgelogd). */
function auth_token(string $password): string {
  return hash_hmac('sha256', 'klaro-login-v1', $password);
}

function is_logged_in(array $cfg): bool {
  $cookie = $_COOKIE[AUTH_COOKIE] ?? '';
  if ($cookie !== '' && hash_equals(auth_token($cfg['password']), $cookie)) return true;
  // Basic-auth (voor scripts): gebruikersnaam maakt niet uit, alleen het wachtwoord.
  $pw = $_SERVER['PHP_AUTH_PW'] ?? null;
  if ($pw === null) {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (stripos($h, 'Basic ') === 0) {
      $d = base64_decode(substr($h, 6), true) ?: '';
      $pw = substr($d, strpos($d, ':') === false ? 0 : strpos($d, ':') + 1);
    }
  }
  return $pw !== null && $pw !== '' && hash_equals($cfg['password'], $pw);
}

/** Alleen ingelogd verder; anders 401 (de pagina gaat dan naar het inlogscherm). */
function require_login(): array {
  $cfg = klaro_config();
  if (!$cfg) json_out(503, ['error' => 'Klaro is nog niet ingesteld (open /api/setup.php).']);
  if (!is_logged_in($cfg)) json_out(401, ['error' => 'Inloggen vereist.']);
  return $cfg;
}
