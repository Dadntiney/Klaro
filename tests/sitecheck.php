<?php
// Test van het websitecontrole-oordeel (php/api/sitecheck-lib.php). Gebruik: php tests/sitecheck.php
declare(strict_types=1);
require __DIR__ . '/../php/api/sitecheck-lib.php';
$ok = 0; $bad = 0;
function check(string $name, bool $c): void { global $ok, $bad; echo ($c ? '✓ ' : '✗ ') . $name . "\n"; $c ? $ok++ : $bad++; }
$page = '<html><head><title>Kleurplaten voor kinderen</title><script>var a=1;</script></head><body>' . str_repeat('Mooie kleurplaten om te printen. ', 10) . '</body></html>';
$w = sitecheck_verdict('www.voorbeeld.nl', 200, 'text/html; charset=utf-8', 'https://www.voorbeeld.nl/', $page);
check('echte website met titel', $w['soort'] === 'website' && $w['titel'] === 'Kleurplaten voor kinderen');
check('doorsturen naar een ander domein', sitecheck_verdict('kort.link', 200, 'text/html', 'https://www.winkel.nl/actie', $page)['soort'] === 'doorsturen');
check('zelfde domein (www.) is geen doorsturen', sitecheck_verdict('voorbeeld.nl', 200, 'text/html', 'https://www.voorbeeld.nl/', $page)['soort'] === 'website');
check('script of data is techniek', sitecheck_verdict('cdn.voorbeeld.nl', 200, 'application/javascript', 'https://cdn.voorbeeld.nl/', 'var x')['soort'] === 'techniek');
check('foutcode: geen pagina', sitecheck_verdict('api.voorbeeld.nl', 404, 'text/html', 'https://api.voorbeeld.nl/', 'Not found')['soort'] === 'geen pagina');
check('lege pagina', sitecheck_verdict('widget.voorbeeld.nl', 200, 'text/html', 'https://widget.voorbeeld.nl/', '<html><body></body></html>')['soort'] === 'leeg');
check('geen antwoord: onbereikbaar', sitecheck_verdict('weg.voorbeeld.nl', 0, '', '', '', 'timeout')['soort'] === 'onbereikbaar');
check('geldig adres', sitecheck_host('Www.Voorbeeld.NL') === 'www.voorbeeld.nl');
check('geen IP, lokaal of pad', sitecheck_host('10.0.0.1') === null && sitecheck_host('router.home') === null && sitecheck_host('a.nl/pad') === null);
check('18+/dating nooit ophalen', sitecheck_refuse_word('www.sexshop.nl') && sitecheck_refuse_word('gratis-dating.nl') && !sitecheck_refuse_word('kleur-v-kind.com'));
check('basisdomein met co.uk', sitecheck_base('shop.winkel.co.uk') === 'winkel.co.uk');
echo "\n$ok goed, $bad fout\n";
exit($bad ? 1 : 0);
