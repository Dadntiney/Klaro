<?php
// Wat Klaro eerder uit de logboeken leerde (data/geleerd.json, bij het live zetten naar _private gekopieerd): alleen na inloggen,
// want het zegt welke sites en apps bij welk apparaat horen. Voorheen zat dit in de scripts van de website (zonder inloggen op te halen).
require __DIR__ . '/common.php';
require_login();
$f = PRIV . '/geleerd.json';
header('Content-Type: application/json; charset=utf-8');
echo is_file($f) ? (string)file_get_contents($f) : '{"auto":[],"helpers":[],"followers":[],"fg":[]}';
