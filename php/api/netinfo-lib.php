<?php
// Welk soort netwerk hoort bij een internetadres: mobiel internet of een gewone (vaste) aansluiting, met de naam van de provider.
// Uit het openbare register van RIPE (whois). Dit is een schatting: 4G of 5G is niet te zien, en sommige providers gebruiken
// dezelfde naam voor mobiel en vast; dan zeggen we niets.

/** Velden uit het register (RIPEstat whois): netname, descr, org-name ... van het kleinste adresblok eerst. */
function netinfo_fields(array $whois): array {
  $out = [];
  foreach (($whois['data']['records'] ?? []) as $rec) {
    if (!is_array($rec)) continue;
    $f = [];
    foreach ($rec as $kv) if (is_array($kv) && isset($kv['key'], $kv['value'])) $f[strtolower((string)$kv['key'])][] = (string)$kv['value'];
    if (isset($f['inetnum']) || isset($f['inet6num']) || isset($f['netname'])) $out[] = $f;
  }
  return $out;
}

/** mobiel / vast / null (niet zeker), plus een korte naam van de provider. */
function netinfo_classify(array $records): array {
  $text = '';
  $name = '';
  foreach ($records as $f) {
    $text .= ' ' . implode(' ', array_merge($f['netname'] ?? [], $f['descr'] ?? [], $f['remarks'] ?? []));
    if ($name === '') $name = (string)(($f['descr'][0] ?? '') ?: ($f['netname'][0] ?? ''));
  }
  $soort = null;
  if (preg_match('/\b(mobile|mobiel|gprs|umts|lte|cellular|gsm|3g|4g|5g|cgnat-mobile|mobility)\b/i', $text)) $soort = 'mobiel';
  elseif (preg_match('/\b(fiber|fibre|glasvezel|ftth|dsl|adsl|vdsl|cable|kabel|broadband|residential|fixed|thuis)\b/i', $text)) $soort = 'vast';
  return ['soort' => $soort, 'naam' => mb_substr(trim($name), 0, 60)];
}
