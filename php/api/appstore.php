<?php
// App-icoon uit de App Store, voor apps waarvan de website geen logo heeft (een spel op de iPad, Buienalarm). Alleen als het zeker
// de juiste app is: een verkeerd icoon is erger dan geen icoon. Zeker = de naam in de App Store is precies de naam in Klaro, of
// de app hoort bij hetzelfde domein (website van de maker). Een naam die er alleen mee begint is niet genoeg ("My Little Princess"
// heet in de App Store misschien anders, en er bestaan meer spellen met zo'n naam).

function appstore_norm(string $s): string {
  $s = preg_replace('/\s*\((spel|leren)\)\s*$/u', '', $s);
  $s = mb_strtolower($s, 'UTF-8');
  return trim(preg_replace('/[^\p{L}\p{N}]+/u', ' ', $s));
}

function appstore_base(string $host): string {
  $p = explode('.', strtolower($host));
  $n = count($p);
  if ($n >= 3 && in_array($p[$n - 2], ['co', 'com', 'org', 'net'], true) && strlen($p[$n - 1]) === 2) return implode('.', array_slice($p, -3));
  return $n >= 2 ? $p[$n - 2] . '.' . $p[$n - 1] : $host;
}

/** De plaatjes-URL van de juiste app uit de zoekresultaten van de App Store, of null als geen enkele zeker klopt. */
function appstore_pick(array $results, string $name, string $domain): ?string {
  $want = appstore_norm($name);
  $base = appstore_base($domain);
  if ($want === '') return null;
  foreach ($results as $r) {
    $art = (string)($r['artworkUrl100'] ?? '');
    if (!preg_match('#^https://[a-z0-9.-]+\.mzstatic\.com/#', $art)) continue;
    $title = appstore_norm((string)($r['trackName'] ?? ''));
    $seller = (string)parse_url((string)($r['sellerUrl'] ?? ''), PHP_URL_HOST);
    $sameSite = $seller !== '' && appstore_base($seller) === $base;
    // Titels als "Buienalarm - regen radar": het deel vóór een streepje of dubbele punt telt als de naam.
    $short = appstore_norm(preg_split('/\s[-–—:|]\s|:\s/u', (string)($r['trackName'] ?? ''))[0] ?? '');
    if ($sameSite || $title === $want || $short === $want) return $art;
  }
  return null;
}

/** Zoekt het icoon in de App Store (Nederland) en geeft het plaatje terug, of null. */
function appstore_icon(string $name, string $domain): ?string {
  $term = appstore_norm($name);
  if ($term === '') return null;
  $ch = curl_init('https://itunes.apple.com/search?entity=software&country=nl&limit=10&term=' . rawurlencode($term));
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => 6, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS]);
  $body = curl_exec($ch);
  curl_close($ch);
  $data = is_string($body) ? json_decode($body, true) : null;
  $art = appstore_pick(is_array($data['results'] ?? null) ? $data['results'] : [], $name, $domain);
  if ($art === null) return null;
  $ch = curl_init($art);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => 6, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS]);
  $img = curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  curl_close($ch);
  return is_string($img) && $code === 200 && strlen($img) > 0 && strlen($img) < 200_000 ? $img : null;
}
