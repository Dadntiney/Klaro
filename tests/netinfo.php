<?php
// Test van de netwerk-herkenning (php/api/netinfo-lib.php). Gebruik: php tests/netinfo.php
declare(strict_types=1);
require __DIR__ . '/../php/api/netinfo-lib.php';
$ok = 0; $bad = 0;
function check(string $name, bool $c): void { global $ok, $bad; echo ($c ? '✓ ' : '✗ ') . $name . "\n"; $c ? $ok++ : $bad++; }
$rec = fn(array $kv) => ['data' => ['records' => [array_map(fn($k, $v) => ['key' => $k, 'value' => $v], array_keys($kv), $kv)]]];

$m = netinfo_classify(netinfo_fields($rec(['inetnum' => '10.0.0.0 - 10.0.0.255', 'netname' => 'PROVIDER-MOBILE-NL', 'descr' => 'Voorbeeld Mobiel Netwerk'])));
check('mobiel netwerk herkend', $m['soort'] === 'mobiel' && $m['naam'] === 'Voorbeeld Mobiel Netwerk');
$v = netinfo_classify(netinfo_fields($rec(['inetnum' => '10.0.1.0 - 10.0.1.255', 'netname' => 'PROVIDER-FTTH', 'descr' => 'Glasvezel klanten'])));
check('vaste aansluiting herkend', $v['soort'] === 'vast');
$u = netinfo_classify(netinfo_fields($rec(['inetnum' => '10.0.2.0 - 10.0.2.255', 'netname' => 'PROVIDER-NET', 'descr' => 'Provider BV'])));
check('niet zeker: geen soort (nooit raden)', $u['soort'] === null && $u['naam'] === 'Provider BV');
check('"automobile" is geen mobiel netwerk', netinfo_classify(netinfo_fields($rec(['inetnum' => 'x', 'netname' => 'AUTOMOBILECLUB'])))['soort'] === null);
check('leeg antwoord: niets', netinfo_classify(netinfo_fields([]))['soort'] === null);
check('merk uit de netwerknaam', netinfo_classify(netinfo_fields($rec(['inetnum' => 'x', 'netname' => 'VODAFONE-NL', 'descr' => 'Mobile Office Service'])))['merk'] === 'Vodafone');
check('echt voorbeeld (28 okt): Vodafone "Mobile Office Service" is mobiel', netinfo_classify(netinfo_fields($rec(['inetnum' => 'x', 'netname' => 'VODAFONE-NL', 'descr' => 'Mobile Office Service'])))['soort'] === 'mobiel');
check('echt voorbeeld (28 okt): "Pool for fixed WBA users" is vast', netinfo_classify(netinfo_fields($rec(['inetnum' => 'x', 'netname' => 'TMONL-NET', 'descr' => 'Pool for fixed WBA users'])))['soort'] === 'vast');
echo "\n$ok goed, $bad fout\n";
exit($bad ? 1 : 0);
