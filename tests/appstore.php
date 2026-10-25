<?php
// Test van het kiezen van een App Store-icoon (php/api/appstore.php): alleen de zeker juiste app. Gebruik: php tests/appstore.php
declare(strict_types=1);
require __DIR__ . '/../php/api/appstore.php';

$ok = 0; $bad = 0;
function check(string $name, bool $c): void { global $ok, $bad; echo ($c ? '✓ ' : '✗ ') . $name . "\n"; $c ? $ok++ : $bad++; }
$art = 'https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg';

check('zelfde naam (met toevoeging na een streepje) wordt herkend', appstore_pick([['trackName' => 'Buienalarm - regenradar', 'artworkUrl100' => $art]], 'Buienalarm', 'buienalarm.nl') === $art);
check('app van dezelfde website wordt herkend', appstore_pick([['trackName' => 'Princess Games', 'sellerUrl' => 'https://www.my-little-princess.net/', 'artworkUrl100' => $art]], 'My Little Princess (spel)', 'my-little-princess.net') === $art);
check('naam die er alleen mee begint: geen icoon (kan een ander spel zijn)', appstore_pick([['trackName' => 'My Little Princess Castle', 'artworkUrl100' => $art]], 'My Little Princess (spel)', 'my-little-princess.net') === null);
check('plaatje van buiten de App Store wordt geweigerd', appstore_pick([['trackName' => 'Buienalarm', 'artworkUrl100' => 'https://kwaadaardig.example/x.jpg']], 'Buienalarm', 'buienalarm.nl') === null);
check('geen resultaten: geen icoon', appstore_pick([], 'Buienalarm', 'buienalarm.nl') === null);

echo "\n$ok goed, $bad fout\n";
exit($bad ? 1 : 0);
