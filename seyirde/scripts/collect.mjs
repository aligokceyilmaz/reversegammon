#!/usr/bin/env node
// Gunluk toplayici. GitHub Actions her gun bunu kosar, cikan veriyi commit eder.
//
// Kullanim:
//   node seyirde/scripts/collect.mjs            # son 14 gunu tazele
//   node seyirde/scripts/collect.mjs --days 90  # geriye donuk 90 gun
//   node seyirde/scripts/collect.mjs --backfill # kanal baslangicindan beri

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  getAccessToken, apiGet, apiGetAll, analyticsQuery, rowsToObjects,
  DATA_API, REPORTING_API, isoDate, daysAgo,
} from './lib/yt.mjs';
import { upsertCsv, writeJson } from './lib/store.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

// Analytics son 3 gunu revize ediyor, varsayilan pencere onu rahatca kapsiyor.
const WINDOW_DAYS = Number(opt('days', 14));
const RETENTION_TOP_N = Number(opt('retention-top', 10));

const main = async () => {
  const token = await getAccessToken();
  const today = new Date();
  const endDate = isoDate(daysAgo(1, today)); // dun; bugun henuz tamamlanmadi

  // ---- 1. Kanal kimligi ve anlik sayaclar -------------------------------
  const chRes = await apiGet(token, `${DATA_API}/channels`, {
    part: 'snippet,statistics,contentDetails',
    mine: 'true',
  });
  const channel = chRes.items?.[0];
  if (!channel) throw new Error('Kanal bulunamadi. Refresh token dogru hesaba mi ait?');

  const startDate = flag('backfill')
    ? channel.snippet.publishedAt.slice(0, 10)
    : isoDate(daysAgo(WINDOW_DAYS, today));

  console.log(`Kanal: ${channel.snippet.title} (${channel.id})`);
  console.log(`Pencere: ${startDate} -> ${endDate}`);

  const st = channel.statistics;
  upsertCsv(
    join(DATA, 'channel_daily_snapshot.csv'),
    [{
      date: isoDate(today),
      subscribers: st.subscriberCount,
      total_views: st.viewCount,
      video_count: st.videoCount,
    }],
    ['date']
  );

  // ---- 2. Tum videolarin kunyesi ---------------------------------------
  const uploads = channel.contentDetails.relatedPlaylists.uploads;
  const playlistItems = await apiGetAll(token, `${DATA_API}/playlistItems`, {
    part: 'contentDetails', playlistId: uploads, maxResults: 50,
  });
  const videoIds = playlistItems.map((i) => i.contentDetails.videoId);
  console.log(`${videoIds.length} video bulundu`);

  const videoMeta = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const res = await apiGet(token, `${DATA_API}/videos`, {
      part: 'snippet,statistics,contentDetails', id: batch.join(','),
    });
    for (const v of res.items ?? []) {
      videoMeta.push({
        video_id: v.id,
        published_at: v.snippet.publishedAt,
        title: v.snippet.title,
        duration: v.contentDetails.duration,
        tags: (v.snippet.tags ?? []).join('|'),
        lifetime_views: v.statistics.viewCount ?? '',
        lifetime_likes: v.statistics.likeCount ?? '',
        lifetime_comments: v.statistics.commentCount ?? '',
        snapshot_date: isoDate(today),
      });
    }
  }
  upsertCsv(join(DATA, 'videos.csv'), videoMeta, ['video_id']);

  // ---- 3. Gunluk kanal metrikleri --------------------------------------
  const CORE = 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,likes,comments,shares';
  const daily = rowsToObjects(
    await analyticsQuery(token, {
      startDate, endDate, dimensions: 'day',
      metrics: `${CORE},averageViewPercentage,videosAddedToPlaylists`,
    }, CORE)
  );
  const dailyRows = daily.map((r) => ({ ...r, date: r.day }));
  for (const r of dailyRows) delete r.day;
  upsertCsv(join(DATA, 'channel_daily.csv'), dailyRows, ['date']);
  console.log(`${dailyRows.length} gunluk satir`);

  // ---- 4. Video x gun ---------------------------------------------------
  const perVideo = rowsToObjects(
    await analyticsQuery(token, {
      startDate, endDate, dimensions: 'day,video',
      metrics: `${CORE},averageViewPercentage`,
      sort: 'day', maxResults: 2000,
    }, CORE)
  );
  const perVideoRows = perVideo.map((r) => {
    const { day, ...rest } = r;
    return { date: day, ...rest };
  });
  upsertCsv(join(DATA, 'video_daily.csv'), perVideoRows, ['date', 'video']);
  console.log(`${perVideoRows.length} video x gun satiri`);

  // ---- 5. Trafik kaynaklari --------------------------------------------
  const traffic = rowsToObjects(
    await analyticsQuery(token, {
      startDate, endDate, dimensions: 'day,insightTrafficSourceType',
      metrics: 'views,estimatedMinutesWatched', sort: 'day', maxResults: 2000,
    }, 'views')
  );
  upsertCsv(
    join(DATA, 'traffic_sources.csv'),
    traffic.map(({ day, ...r }) => ({ date: day, ...r })),
    ['date', 'insightTrafficSourceType']
  );
  console.log(`${traffic.length} trafik kaynagi satiri`);

  // ---- 6. Retention egrisi (en cok izlenen N video) --------------------
  // Her video icin ayri sorgu gerekiyor (filters=video==ID), o yuzden
  // sadece anlamli trafigi olanlari cekiyoruz.
  const topVideos = [...videoMeta]
    .sort((a, b) => Number(b.lifetime_views || 0) - Number(a.lifetime_views || 0))
    .slice(0, RETENTION_TOP_N);

  const retentionRows = [];
  for (const v of topVideos) {
    try {
      const rows = rowsToObjects(
        await analyticsQuery(token, {
          startDate: v.published_at.slice(0, 10), endDate,
          filters: `video==${v.video_id}`,
          dimensions: 'elapsedVideoTimeRatio',
          metrics: 'audienceWatchRatio,relativeRetentionPerformance',
        }, 'audienceWatchRatio')
      );
      for (const r of rows) {
        retentionRows.push({ video_id: v.video_id, measured_through: endDate, ...r });
      }
    } catch (err) {
      // Izlenmesi cok az olan videolarda Analytics veri dondurmuyor; normal.
      console.warn(`  ! retention yok: ${v.video_id} (${err.status ?? '?'})`);
    }
  }
  upsertCsv(join(DATA, 'retention.csv'), retentionRows, ['video_id', 'elapsedVideoTimeRatio']);
  console.log(`${retentionRows.length} retention satiri (${topVideos.length} video)`);

  // ---- 7. Gosterim + CTR (Reporting API, toplu reach raporlari) --------
  const reach = await collectReach(token).catch((err) => {
    console.warn(`  ! reach raporu atlandi: ${err.message.slice(0, 300)}`);
    return { rows: 0, note: err.message.slice(0, 200) };
  });

  // ---- 8. Kosu kaydi ----------------------------------------------------
  writeJson(join(DATA, 'last_run.json'), {
    ran_at: new Date().toISOString(),
    channel: { id: channel.id, title: channel.snippet.title },
    window: { startDate, endDate },
    counts: {
      videos: videoMeta.length,
      daily: dailyRows.length,
      video_daily: perVideoRows.length,
      traffic: traffic.length,
      retention: retentionRows.length,
      reach: reach.rows ?? 0,
    },
    snapshot: {
      subscribers: Number(st.subscriberCount),
      total_views: Number(st.viewCount),
      video_count: Number(st.videoCount),
    },
    ...(reach.note ? { reach_note: reach.note } : {}),
  });
  console.log('Tamam.');
};

/**
 * Reporting API toplu raporlari. CTR ve gosterim SADECE burada var;
 * interaktif Analytics API'si bu iki metrigi hic dondurmuyor.
 * Job'lar once setup-reach-jobs.mjs ile kaydedilmeli; ilk rapor 24-48 saat
 * sonra olusuyor, o yuzden ilk kosularda bos donmesi beklenen davranis.
 */
async function collectReach(token) {
  const { jobs } = await apiGet(token, `${REPORTING_API}/jobs`, {});
  const reachJobs = (jobs ?? []).filter((j) => j.reportTypeId?.includes('reach'));
  if (!reachJobs.length) {
    return { rows: 0, note: 'reach job kayitli degil — setup-reach-jobs.mjs kosulmali' };
  }

  let total = 0;
  for (const job of reachJobs) {
    const { reports } = await apiGet(token, `${REPORTING_API}/jobs/${job.id}/reports`, {});
    if (!reports?.length) {
      console.log(`  reach job ${job.reportTypeId}: henuz rapor yok`);
      continue;
    }
    // Her rapor bir gunu kapsiyor; son 10 tanesini al.
    const recent = reports
      .sort((a, b) => (a.startTime < b.startTime ? 1 : -1))
      .slice(0, 10);

    for (const rep of recent) {
      const res = await fetch(rep.downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.warn(`  ! rapor indirilemedi (${res.status})`);
        continue;
      }
      const csv = (await res.text()).trim();
      if (!csv) continue;

      const [head, ...lines] = csv.split('\n');
      const cols = head.split(',');
      const rows = lines
        .filter((l) => l.trim())
        .map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));
      if (!rows.length) continue;

      // Reach raporunun anahtari: date + video (+ varsa kirilim sutunlari).
      const keyFields = ['date', 'video_id'].filter((f) => cols.includes(f));
      const extraKeys = ['traffic_source_type', 'device_type'].filter((f) => cols.includes(f));
      const file = job.reportTypeId.includes('combined') ? 'reach_combined.csv' : 'reach_basic.csv';
      total += rows.length;
      upsertCsv(join(DATA, file), rows, [...keyFields, ...extraKeys]);
    }
    console.log(`  reach job ${job.reportTypeId}: ${recent.length} rapor islendi`);
  }
  return { rows: total };
}

main().catch((err) => {
  console.error(`\nHATA: ${err.message}`);
  process.exit(1);
});
