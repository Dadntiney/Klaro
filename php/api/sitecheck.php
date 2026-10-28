<?php
// Voorpagina van een adres ophalen en kijken of het een echte website is (alleen na inloggen, alleen voor de controles):
// GET ?host=voorbeeld.nl -> {soort: website|doorsturen|leeg|techniek|geen pagina|onbereikbaar, titel, naar, code}.
// Alleen de voorpagina, zonder cookies; 18+/dating wordt nooit opgehaald. Uitkomst 30 dagen bewaard in _private/sitecheck.json.
require __DIR__ . '/common.php';
require __DIR__ . '/sitecheck-lib.php';
require_login();

$host = sitecheck_host((string)($_GET['host'] ?? ''));
if ($host === null) json_out(400, ['error' => 'Geen geldig adres.']);
json_out(200, sitecheck_run($host));
