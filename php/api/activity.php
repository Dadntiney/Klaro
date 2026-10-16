<?php
// De pagina meldt hier echt gebruik (tikken, scrollen, typen), hooguit eens per minuut en alleen vanuit een tabblad dat in beeld
// is. Alleen dit verlengt de sessie; live bijwerken en ander automatisch verkeer niet. ?ago=<seconden> = wanneer het gebruik was.
require __DIR__ . '/common.php';
// Alleen een POST met de eigen kop: een andere website kan dit niet namens de gebruiker doen.
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || ($_SERVER['HTTP_X_KLARO'] ?? '') !== '1') json_out(405, ['error' => 'Niet toegestaan.']);
$state = session_state((int)($_GET['ago'] ?? 0));
if ($state !== 'ok') {
  header('X-Klaro-Login: ' . ($state === 'verlopen' ? 'verlopen' : 'nodig'));
  json_out(401, ['error' => 'Inloggen vereist.']);
}
http_response_code(204);
