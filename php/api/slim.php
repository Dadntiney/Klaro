<?php
// Lichte versie van de NextDNS-download voor de telefoon (zie nd.php). Los bestand, zodat het te testen is.
/** Zelfde opschoning als extractHost in lib/parse.ts (alleen voor het samennemen van dubbele opvragingen). */
function klaro_host(string $v): string {
  $v = strtolower(trim($v));
  $v = preg_replace('~^[a-z][a-z0-9+.-]*://~', '', $v);
  $v = preg_split('~[/?#]~', $v, 2)[0];
  $v = preg_replace(['~^[^@]*@~', '~:\d+$~', '~\.$~'], '', $v);
  return $v;
}

function slim_csv(string $from, string $to): bool {
  $in = fopen($from, 'r');
  $out = fopen($to, 'w');
  if (!$in || !$out) return false;
  $hdr = fgetcsv($in, 0, ',', '"', '');
  if (!$hdr) return false;
  $hdr = array_map(fn($h) => strtolower(trim(preg_replace('/^\xEF\xBB\xBF/', '', (string)$h))), $hdr);
  $want = ['timestamp', 'domain', 'status', 'reasons', 'destination_country', 'client_ip', 'device_id', 'device_name', 'device_model'];
  $idx = array_map(fn($w) => array_search($w, $hdr, true), $want);
  if ($idx[0] === false || $idx[1] === false) return false;
  fwrite($out, implode("\t", $want) . "\n");
  $last = [];
  while (($r = fgetcsv($in, 0, ',', '"', '')) !== false) {
    if ($r === [null] || count($r) < 2) continue;
    $ts = (string)($r[$idx[0]] ?? '');
    $t = 0;
    try { $t = $ts !== '' ? (int)(new DateTimeImmutable($ts))->format('Uv') : 0; } catch (Throwable $e) { $t = 0; }
    $id = trim((string)($idx[6] === false ? '' : ($r[$idx[6]] ?? '')));
    $name = trim((string)($idx[7] === false ? '' : ($r[$idx[7]] ?? '')));
    $k = ($id !== '' ? $id : ($name !== '' ? 'n:' . $name : 'onbekend')) . '|' . klaro_host((string)($r[$idx[1]] ?? ''));
    if ($t && isset($last[$k]) && abs($t - $last[$k]) <= 1500) continue;
    if ($t) $last[$k] = $t;
    $row = [];
    foreach ($idx as $i) $row[] = $i === false ? '' : str_replace(["\t", "\n", "\r"], ' ', (string)($r[$i] ?? ''));
    fwrite($out, implode("\t", $row) . "\n");
  }
  fclose($in);
  fclose($out);
  return true;
}

/** Kop + alle regels van na `since` (ms) uit de lichte download (nieuwste eerst): stopt bij de eerste oudere regel. */
function slim_since(string $file, int $since): void {
  $in = fopen($file, 'r');
  if (!$in) return;
  $hdr = fgets($in);
  if ($hdr === false) return;
  echo $hdr;
  $older = 0;
  while (($line = fgets($in)) !== false) {
    $ts = strstr($line, "\t", true);
    $t = 0;
    try { $t = $ts ? (int)(new DateTimeImmutable($ts))->format('Uv') : 0; } catch (Throwable $e) { $t = 0; }
    if ($t && $t <= $since) { if (++$older >= 50) break; continue; } // een paar regels kunnen net door elkaar staan
    echo $line;
  }
  fclose($in);
}
