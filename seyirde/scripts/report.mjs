#!/usr/bin/env node
// Biriken veriden okunabilir bir ozet basar. API'ye gitmez, sadece data/ okur.
// Boylece internet/credential olmadan da (ve benim tarafimdan da) calisir.
//
//   node seyirde/scripts/report.mjs            # son 28 gun
//   node seyirde/scripts/report.mjs --days 90

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readCsv } from './lib/store.mjs';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const argv = process.argv.slice(2);
const i = argv.indexOf('--days');
const DAYS = Number(i >= 0 ? argv[i + 1] : 28);

const num = (v) => (v === '' || v === undefined ? 0 : Number(v));
const sum = (rows, f) => rows.reduce((a, r) => a + num(r[f]), 0);
const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '-');

const cutoff = new Date();
cutoff.setUTCDate(cutoff.getUTCDate() - DAYS);
const since = cutoff.toISOString().slice(0, 10);

const daily = readCsv(join(DATA, 'channel_daily.csv')).filter((r) => r.date >= since);
const videos = readCsv(join(DATA, 'videos.csv'));
const videoDaily = readCsv(join(DATA, 'video_daily.csv')).filter((r) => r.date >= since);
const traffic = readCsv(join(DATA, 'traffic_sources.csv')).filter((r) => r.date >= since);
const retention = readCsv(join(DATA, 'retention.csv'));
const reach = readCsv(join(DATA, 'reach_basic.csv')).filter((r) => r.date >= since.replace(/-/g, ''));
const snaps = readCsv(join(DATA, 'channel_daily_snapshot.csv'));

if (!daily.length && !snaps.length) {
  console.log('Henuz veri yok. Once collect.mjs kosmali.');
  process.exit(0);
}

const title = (s) => console.log(`\n${s}\n${'-'.repeat(s.length)}`);

console.log(`SEYIRDE RAPORU — son ${DAYS} gun (${since} sonrasi)`);

if (snaps.length) {
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  title('Kanal');
  console.log(`Abone      : ${last.subscribers}  (ilk kayit ${first.date}: ${first.subscribers})`);
  console.log(`Toplam izl.: ${last.total_views}`);
  console.log(`Video       : ${last.video_count}`);
  console.log(`Takip suresi: ${snaps.length} gun kayit`);
}

if (daily.length) {
  const views = sum(daily, 'views');
  const mins = sum(daily, 'estimatedMinutesWatched');
  const gained = sum(daily, 'subscribersGained');
  const lost = sum(daily, 'subscribersLost');
  const avgDur = views ? sum(daily, 'averageViewDuration') / daily.length : 0;

  title('Donem toplami');
  console.log(`Izlenme          : ${views}  (gunluk ort. ${fmt(views / daily.length)})`);
  console.log(`Izlenme dakikasi : ${mins}`);
  console.log(`Ort. izlenme sur.: ${fmt(avgDur, 0)} sn`);
  console.log(`Abone            : +${gained} / -${lost} = net ${gained - lost}`);

  // Ilk yari vs ikinci yari: trend yonu
  const half = Math.floor(daily.length / 2);
  if (half >= 3) {
    const a = daily.slice(0, half);
    const b = daily.slice(half);
    const va = sum(a, 'views') / a.length;
    const vb = sum(b, 'views') / b.length;
    const delta = va ? ((vb - va) / va) * 100 : 0;
    const yon = delta > 5 ? 'YUKARI' : delta < -5 ? 'ASAGI' : 'yatay';
    title('Trend');
    console.log(`Gunluk izlenme ortalamasi: ${fmt(va)} -> ${fmt(vb)}  (${fmt(delta)}%, ${yon})`);
  }
}

if (videoDaily.length) {
  const byVideo = new Map();
  for (const r of videoDaily) {
    const k = r.video;
    const cur = byVideo.get(k) ?? { views: 0, mins: 0, subs: 0, days: 0, avgPct: 0 };
    cur.views += num(r.views);
    cur.mins += num(r.estimatedMinutesWatched);
    cur.subs += num(r.subscribersGained);
    cur.avgPct += num(r.averageViewPercentage);
    cur.days += 1;
    byVideo.set(k, cur);
  }
  const titleOf = (id) =>
    (videos.find((v) => v.video_id === id)?.title ?? id).slice(0, 48);

  title(`En cok izlenen videolar (donem ici)`);
  const top = [...byVideo.entries()].sort((a, b) => b[1].views - a[1].views).slice(0, 10);
  for (const [id, s] of top) {
    const pct = s.days ? s.avgPct / s.days : 0;
    console.log(
      `${String(s.views).padStart(6)} izl | ort %${fmt(pct, 0).padStart(3)} tamamlama | +${String(s.subs).padStart(3)} abone | ${titleOf(id)}`
    );
  }
}

if (traffic.length) {
  const bySrc = new Map();
  for (const r of traffic) {
    bySrc.set(r.insightTrafficSourceType, (bySrc.get(r.insightTrafficSourceType) ?? 0) + num(r.views));
  }
  const total = [...bySrc.values()].reduce((a, b) => a + b, 0) || 1;
  title('Trafik kaynaklari');
  for (const [src, v] of [...bySrc.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${String(v).padStart(6)} izl  %${fmt((v / total) * 100, 0).padStart(3)}  ${src}`);
  }
}

if (reach.length) {
  const byVideo = new Map();
  for (const r of reach) {
    const k = r.video_id;
    const cur = byVideo.get(k) ?? { imp: 0, ctrSum: 0, n: 0 };
    cur.imp += num(r.video_thumbnail_impressions);
    cur.ctrSum += num(r.video_thumbnail_impressions_ctr);
    cur.n += 1;
    byVideo.set(k, cur);
  }
  title('Gosterim ve CTR');
  for (const [id, s] of [...byVideo.entries()].sort((a, b) => b[1].imp - a[1].imp).slice(0, 10)) {
    const t = (videos.find((v) => v.video_id === id)?.title ?? id).slice(0, 44);
    console.log(`${String(s.imp).padStart(7)} gosterim | CTR %${fmt(s.n ? s.ctrSum / s.n : 0, 2).padStart(5)} | ${t}`);
  }
} else {
  title('Gosterim ve CTR');
  console.log('Veri yok. setup-reach-jobs.mjs kosuldu mu? Ilk rapor 24-48 saat sonra gelir.');
}

if (retention.length) {
  title('Retention (ilk %25te kalan izleyici)');
  const byVideo = new Map();
  for (const r of retention) {
    if (num(r.elapsedVideoTimeRatio) > 0.25) continue;
    const cur = byVideo.get(r.video_id) ?? [];
    cur.push(num(r.audienceWatchRatio));
    byVideo.set(r.video_id, cur);
  }
  for (const [id, vals] of byVideo) {
    const t = (videos.find((v) => v.video_id === id)?.title ?? id).slice(0, 44);
    const last = vals.length ? vals[vals.length - 1] : 0;
    console.log(`%${fmt(last * 100, 0).padStart(3)} kaliyor | ${t}`);
  }
}

console.log('');
