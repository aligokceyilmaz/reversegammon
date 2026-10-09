#!/usr/bin/env node
// TEK SEFERLIK. Reporting API'de reach (gosterim + CTR) job'larini kaydeder.
//
// Neden ayri: CTR ve gosterim interaktif Analytics API'sinde YOK. Sadece
// Reporting API'nin toplu raporlarinda var, ve o raporlar ancak bir job
// kaydedildikten sonra uretilmeye basliyor. Ilk rapor 24-48 saat sonra dusuyor,
// ve job kaydindan ONCESI icin veri gelmiyor — yani bunu ne kadar erken
// kosarsan o kadar uzun gecmise sahip olursun.

import { getAccessToken, apiGet, REPORTING_API } from './lib/yt.mjs';

const token = await getAccessToken();

const { reportTypes } = await apiGet(token, `${REPORTING_API}/reportTypes`, {});
const available = reportTypes ?? [];

const wanted = available.filter(
  (t) => t.id?.includes('reach') && !t.deprecateTime
);

if (!wanted.length) {
  console.error('Bu hesapta reach rapor tipi gorunmuyor. Mevcut tipler:');
  for (const t of available) console.error(`  ${t.id}${t.deprecateTime ? ' (deprecated)' : ''}`);
  process.exit(1);
}

const { jobs } = await apiGet(token, `${REPORTING_API}/jobs`, {});
const existing = new Set((jobs ?? []).map((j) => j.reportTypeId));

for (const type of wanted) {
  if (existing.has(type.id)) {
    console.log(`zaten kayitli: ${type.id}`);
    continue;
  }
  const res = await fetch(`${REPORTING_API}/jobs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportTypeId: type.id, name: `seyirde-${type.id}` }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`job kurulamadi ${type.id} (${res.status}): ${body}`);
    continue;
  }
  console.log(`kuruldu: ${type.id} -> job ${JSON.parse(body).id}`);
}

console.log('\nIlk raporlar 24-48 saat icinde dusecek. collect.mjs o zamana kadar');
console.log('bu bolumu "henuz rapor yok" diye atlayacak, bu normal.');
