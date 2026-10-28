<?php
// Eigen namen voor netwerken buiten de deur (alleen na inloggen), bijv. een andere wifi die vaak terugkomt: "werk", "opa en oma".
//  GET                    {namen: {netwerk: naam}}
//  POST {netwerk, naam}   naam geven (lege naam = weghalen). netwerk = IPv4-adres of IPv6-netwerkdeel ("2001:db8:1:2").
require __DIR__ . '/common.php';
require_login();
$file = PRIV . '/netnames.json';
$names = is_file($file) ? (json_decode((string)file_get_contents($file), true) ?: []) : [];
if ($_SERVER['REQUEST_METHOD'] === 'GET') json_out(200, ['namen' => (object)$names]);
$in = json_decode((string)file_get_contents('php://input'), true);
$net = is_array($in) ? (string)($in['netwerk'] ?? '') : '';
$naam = is_array($in) ? trim((string)($in['naam'] ?? '')) : '';
if (!preg_match('/^([0-9]{1,3}(\.[0-9]{1,3}){3}|[0-9a-f]{1,4}(:[0-9a-f]{1,4}){3})$/i', $net)) json_out(400, ['error' => 'Onbekend netwerk.']);
if ($naam === '') unset($names[$net]);
else $names[$net] = mb_substr(strip_tags($naam), 0, 30);
file_put_contents($file, json_encode($names, JSON_UNESCAPED_UNICODE), LOCK_EX);
json_out(200, ['namen' => (object)$names]);
