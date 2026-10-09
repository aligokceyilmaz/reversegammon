// Uzun-format CSV deposu. Anahtara gore upsert yapar, boylece ayni gunu
// tekrar cekmek satir cogaltmaz.
//
// Neden upsert: YouTube Analytics son ~3 gunun verisini sonradan revize
// ediyor. Her kosuda son N gunu yeniden cekip ustune yaziyoruz; append-only
// olsa ayni gun icin celisen satirlar birikirdi.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function esc(v) {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function parseLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

export function readCsv(path) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf8').trim();
  if (!text) return [];
  const [head, ...rest] = text.split('\n');
  const cols = parseLine(head);
  return rest
    .filter((l) => l.trim())
    .map((l) => {
      const vals = parseLine(l);
      return Object.fromEntries(cols.map((c, i) => [c, vals[i] ?? '']));
    });
}

/**
 * Yeni satirlari mevcut CSV'ye birlestirip yeniden yazar.
 * @param keyFields anahtari olusturan sutunlar (ornek: ['date'] ya da ['date','video_id'])
 */
export function upsertCsv(path, rows, keyFields) {
  if (!rows.length && !existsSync(path)) return 0;
  const existing = readCsv(path);
  const keyOf = (r) => keyFields.map((f) => r[f] ?? '').join('\u0000');

  const merged = new Map();
  for (const r of existing) merged.set(keyOf(r), r);
  for (const r of rows) {
    const k = keyOf(r);
    merged.set(k, { ...merged.get(k), ...r });
  }

  // Sutun birlesimi: once mevcut sira, sonra yeni gelen sutunlar.
  const cols = [];
  for (const r of [...merged.values()]) {
    for (const c of Object.keys(r)) if (!cols.includes(c)) cols.push(c);
  }

  const sorted = [...merged.values()].sort((a, b) =>
    keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0
  );

  mkdirSync(dirname(path), { recursive: true });
  const text =
    cols.join(',') + '\n' + sorted.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n') + '\n';
  writeFileSync(path, text);
  return sorted.length;
}

export function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}
