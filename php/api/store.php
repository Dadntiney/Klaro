<?php
// Eigen kopie van het NextDNS-logboek in SQLite (_private/logs.sqlite). Zonder kopie downloadt de server elke 2 minuten het hele
// logboek (20 okt: 72 MB na 24 dagen, ~3 MB per dag erbij). Met de kopie haalt hij hooguit eens per minuut alleen de nieuwe regels
// op (zelfde /logs-aanvraag als de pagina voor vandaag gebruikt) en geeft de telefoon precies hetzelfde lichte TSV-formaat.
// NextDNS blijft de bron: is de kopie leeg, te oud of lukt bijwerken niet volledig, dan wordt hij opnieuw gevuld uit de download.
require_once __DIR__ . '/slim.php';

const STORE_COLS = ['timestamp', 'domain', 'status', 'reasons', 'destination_country', 'client_ip', 'device_id', 'device_name', 'device_model'];
const STORE_SYNC_EVERY = 60;        // s: niet vaker bij NextDNS aankloppen (anders 429)
const STORE_OVERLAP = 600_000;      // ms: telkens 10 min terug ophalen (regels komen soms iets later binnen); dubbele vallen weg
const STORE_MAX_AGE = 3 * 86_400_000; // ms: langer niet bijgewerkt = opnieuw vullen uit de download
const STORE_MAX_PAGES = 60;         // pagina's van 1000; meer = opnieuw vullen uit de download

function store_db(?string $file = null): PDO {
  $db = new PDO('sqlite:' . ($file ?? PRIV . '/logs.sqlite'), null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
  $db->exec('PRAGMA busy_timeout = 20000');
  $db->exec('PRAGMA journal_mode = WAL');
  $db->exec('CREATE TABLE IF NOT EXISTS logs (t INTEGER NOT NULL, k TEXT NOT NULL, line TEXT NOT NULL, UNIQUE (t, k))');
  $db->exec('CREATE INDEX IF NOT EXISTS logs_t ON logs (t)');
  $db->exec('CREATE INDEX IF NOT EXISTS logs_kt ON logs (k, t)');
  $db->exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
  return $db;
}

function store_meta(PDO $db, string $key, ?string $set = null): ?string {
  if ($set !== null) { $db->prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')->execute([$key, $set]); return $set; }
  $q = $db->prepare('SELECT value FROM meta WHERE key = ?');
  $q->execute([$key]);
  $v = $q->fetchColumn();
  return $v === false ? null : (string)$v;
}

/** Tijd (ms) en sleutel (apparaat|adres) van een lichte regel; zelfde sleutel als het samennemen in slim_csv. */
function store_key(array $cells): array {
  $t = 0;
  try { $t = $cells[0] !== '' ? (int)(new DateTimeImmutable($cells[0]))->format('Uv') : 0; } catch (Throwable $e) { $t = 0; }
  $id = trim($cells[6] ?? ''); $name = trim($cells[7] ?? '');
  return [$t, ($id !== '' ? $id : ($name !== '' ? 'n:' . $name : 'onbekend')) . '|' . klaro_host($cells[1] ?? '')];
}

/** Eén regel uit /logs (JSON) als lichte TSV-cellen, zoals fetchToday in lib/overview.ts en zoals de download. */
function store_cells(array $e): array {
  $dev = is_array($e['device'] ?? null) ? $e['device'] : [];
  // Redenen zoals in de download: alleen de codes, met komma's (blocklist:nextdns-recommended,disguised-trackers).
  $reasons = implode(',', array_filter(array_map(fn($r) => (string)($r['id'] ?? ''), is_array($e['reasons'] ?? null) ? $e['reasons'] : [])));
  $cc = '';
  foreach (is_array($e['destinations'] ?? null) ? $e['destinations'] : [] as $d) if (($d['type'] ?? '') === 'country') { $cc = (string)($d['code'] ?? ''); break; }
  $status = (string)($e['status'] ?? '');
  // De download laat de gewone status leeg; het land staat alleen in de download (Klaro gebruikt het niet).
  $cells = [(string)($e['timestamp'] ?? ''), (string)($e['domain'] ?? ''), $status === 'default' ? '' : $status, $reasons, $cc, (string)($e['clientIp'] ?? ''), (string)($dev['id'] ?? ''), (string)($dev['name'] ?? ''), (string)($dev['model'] ?? '')];
  return array_map(fn($v) => str_replace(["\t", "\n", "\r"], ' ', $v), $cells);
}

/** Regels toevoegen (oud naar nieuw); dezelfde opvraging binnen 1,5 s op hetzelfde apparaat telt één keer (zoals slim_csv). */
function store_add(PDO $db, array $rows): int {
  usort($rows, fn($a, $b) => $a[0] <=> $b[0]);
  $near = $db->prepare('SELECT 1 FROM logs WHERE k = ? AND t BETWEEN ? AND ? LIMIT 1');
  $ins = $db->prepare('INSERT OR IGNORE INTO logs (t, k, line) VALUES (?, ?, ?)');
  $n = 0;
  $db->beginTransaction();
  foreach ($rows as [$t, $k, $line]) {
    if (!$t) continue;
    $near->execute([$k, $t - 1500, $t + 1500]);
    $hit = $near->fetchColumn();
    $near->closeCursor();
    if ($hit) continue;
    $ins->execute([$t, $k, $line]);
    $n += $ins->rowCount();
  }
  $db->commit();
  return $n;
}

/** Opnieuw vullen uit een lichte download (TSV, al samengenomen). */
function store_seed(PDO $db, string $tsv): int {
  $in = fopen($tsv, 'r');
  if (!$in) return 0;
  fgets($in); // kop
  $ins = $db->prepare('INSERT OR IGNORE INTO logs (t, k, line) VALUES (?, ?, ?)');
  $n = 0;
  $db->beginTransaction();
  $db->exec('DELETE FROM logs');
  while (($line = fgets($in)) !== false) {
    $line = rtrim($line, "\r\n");
    if ($line === '') continue;
    [$t, $k] = store_key(explode("\t", $line));
    if (!$t) continue;
    $ins->execute([$t, $k, $line]);
    $n += $ins->rowCount();
  }
  $db->commit();
  fclose($in);
  return $n;
}

/**
 * Nieuwe regels ophalen. `$fetch(querystring)` geeft [status, body] van NextDNS /logs. Uitkomst: "ok", "rust" (net bijgewerkt),
 * "leeg" / "oud" / "onvolledig" / "fout" (dan opnieuw vullen uit de download, of de oude manier gebruiken).
 */
function store_sync(PDO $db, callable $fetch, int $nowMs): string {
  $max = (int)$db->query('SELECT MAX(t) FROM logs')->fetchColumn();
  if (!$max) return 'leeg';
  if ($nowMs - $max > STORE_MAX_AGE) return 'oud';
  if ($nowMs - (int)(store_meta($db, 'synced') ?? 0) < STORE_SYNC_EVERY * 1000) return 'rust';
  $from = $max - STORE_OVERLAP;
  $rows = []; $cursor = ''; $done = false;
  for ($page = 0; $page < STORE_MAX_PAGES; $page++) {
    // raw=1: alle opvragingen, zoals de download (zonder raw laat NextDNS herhalingen weg).
    [$status, $body] = $fetch('from=' . $from . '&limit=1000&raw=1' . ($cursor !== '' ? '&cursor=' . rawurlencode($cursor) : ''));
    if ($status !== 200) return 'fout';
    $j = json_decode((string)$body, true);
    if (!is_array($j) || !is_array($j['data'] ?? null)) return 'fout';
    foreach ($j['data'] as $e) {
      $cells = store_cells(is_array($e) ? $e : []);
      [$t, $k] = store_key($cells);
      if ($t) $rows[] = [$t, $k, implode("\t", $cells)];
    }
    $cursor = (string)($j['meta']['pagination']['cursor'] ?? '');
    if ($cursor === '') { $done = true; break; }
  }
  // Half binnen: niets bewaren, anders blijft er een gat (de volgende keer wordt vanaf de nieuwste regel opgehaald).
  if (!$done) return 'onvolledig';
  store_add($db, $rows);
  store_meta($db, 'synced', (string)$nowMs);
  return 'ok';
}

/** Kop + regels van na `since` (ms), nieuwste eerst (zoals de download). */
function store_out(PDO $db, int $since): void {
  echo implode("\t", STORE_COLS), "\n";
  // Gelijke tijden in de volgorde van NextDNS (zoals ingevoegd): Klaro rekent bij gelijke tijd in download-volgorde.
  $q = $db->prepare('SELECT line FROM logs WHERE t > ? ORDER BY t DESC, rowid ASC');
  $q->execute([$since]);
  while (($line = $q->fetchColumn()) !== false) echo $line, "\n";
}

/**
 * Per apparaat (laatste 14 dagen): wanneer laatst gezien, de langste pauze tot nu toe, op hoeveel van de laatste 7 dagen actief,
 * en naam/model (alleen om het soort apparaat te bepalen). Voor de melding "ongewoon lang stil" (scripts/waarschuw.ts).
 */
function store_devices(PDO $db, int $nowMs): array {
  $q = $db->prepare("SELECT t, substr(k, 1, instr(k, '|') - 1) AS d FROM logs WHERE t > ? ORDER BY d, t");
  $q->execute([$nowMs - 14 * 86_400_000]);
  $out = [];
  $prev = null; $prevT = 0;
  while (($r = $q->fetch(PDO::FETCH_NUM)) !== false) {
    $t = (int)$r[0]; $d = (string)$r[1];
    if ($d !== $prev) { $out[$d] = ['id' => $d, 'first' => $t, 'last' => $t, 'maxGap' => 0, 'days' => []]; $prev = $d; $prevT = $t; }
    $o = &$out[$d];
    $o['maxGap'] = max($o['maxGap'], $t - $prevT);
    $o['last'] = $t;
    if ($t > $nowMs - 7 * 86_400_000) $o['days'][intdiv($t, 86_400_000)] = 1;
    $prevT = $t;
    unset($o);
  }
  $line = $db->prepare('SELECT line FROM logs WHERE k >= ? AND k < ? ORDER BY t DESC LIMIT 1');
  foreach ($out as $d => &$o) {
    $line->execute([$d . '|', $d . '}']);
    $c = explode("\t", (string)$line->fetchColumn());
    $line->closeCursor();
    $o = ['id' => $d, 'first' => $o['first'], 'last' => $o['last'], 'maxGap' => $o['maxGap'], 'days7' => min(7, count($o['days'])), 'name' => $c[7] ?? '', 'model' => $c[8] ?? ''];
  }
  return array_values($out);
}

/** Zoals store_devices, maar de zware telling hooguit eens per uur; "laatst gezien" altijd vers (anders vals "stil"). */
function store_devices_cached(PDO $db, int $nowMs): array {
  $c = json_decode(store_meta($db, 'devstats') ?? '', true);
  if (!is_array($c) || $nowMs - (int)($c['at'] ?? 0) > 3_600_000) {
    $c = ['at' => $nowMs, 'devices' => store_devices($db, $nowMs)];
    store_meta($db, 'devstats', json_encode($c));
  }
  $q = $db->prepare("SELECT substr(k, 1, instr(k, '|') - 1) AS d, MAX(t) FROM logs WHERE t > ? GROUP BY d");
  $q->execute([(int)$c['at'] - 600_000]);
  $last = $q->fetchAll(PDO::FETCH_KEY_PAIR);
  return array_map(fn($o) => ['last' => max((int)$o['last'], (int)($last[$o['id']] ?? 0))] + $o, $c['devices']);
}
