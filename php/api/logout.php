<?php
// Uitloggen (alleen via het formulier op de pagina): dit apparaat, of met alle=1 alle apparaten.
require __DIR__ . '/common.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(405, ['error' => 'Niet toegestaan.']);
session_end(($_POST['alle'] ?? '') === '1');
header('Location: /login?uit=1', true, 303);
