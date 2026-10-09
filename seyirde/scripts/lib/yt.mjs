// YouTube API yardimcilari. Bagimlilik yok, Node 18+ fetch kullanir.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

export function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    throw new Error(
      `Eksik ortam degiskeni: ${missing.join(', ')}\n` +
        `Yerelde seyirde/.env dosyasina yaz, CI icin GitHub repo Secrets'a ekle.`
    );
  }
  return names.map((n) => process.env[n]);
}

/** Refresh token'i kisa omurlu access token'a cevirir. */
export async function getAccessToken() {
  const [clientId, clientSecret, refreshToken] = requireEnv(
    'YT_CLIENT_ID',
    'YT_CLIENT_SECRET',
    'YT_REFRESH_TOKEN'
  );
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    // invalid_grant = token iptal edilmis ya da OAuth ekrani "Testing"de kalip
    // 7 gunluk omrunu doldurmus. README'deki 6. adima bak.
    throw new Error(`Access token alinamadi (${res.status}): ${body}`);
  }
  return JSON.parse(body).access_token;
}

/** Tek GET. ok=false ise hatayi govdesiyle firlatir. */
export async function apiGet(token, base, params) {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.text();
  if (!res.ok) {
    const err = new Error(`${res.status} ${url.pathname}: ${body}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body ? JSON.parse(body) : null;
}

/** pageToken ile donen uc noktalari sonuna kadar gezer. */
export async function apiGetAll(token, base, params, itemsKey = 'items') {
  const out = [];
  let pageToken;
  do {
    const page = await apiGet(token, base, { ...params, pageToken });
    out.push(...(page?.[itemsKey] ?? []));
    pageToken = page?.nextPageToken;
  } while (pageToken);
  return out;
}

export const DATA_API = 'https://www.googleapis.com/youtube/v3';
export const ANALYTICS_API = 'https://youtubeanalytics.googleapis.com/v2/reports';
export const REPORTING_API = 'https://youtubereporting.googleapis.com/v1';

/**
 * Analytics sorgusu. Bazi metrikler kanal tipine gore reddedilebiliyor ve tek
 * kotu metrik tum sorguyu 400'e dusuruyor; o yuzden `fallbackMetrics` ile
 * daraltilmis bir ikinci deneme yapiyoruz.
 */
export async function analyticsQuery(token, params, fallbackMetrics) {
  try {
    return await apiGet(token, ANALYTICS_API, { ids: 'channel==MINE', ...params });
  } catch (err) {
    if (err.status === 400 && fallbackMetrics) {
      console.warn(`  ! metrik reddedildi, daraltilmis sete dusuluyor: ${err.body?.slice(0, 200)}`);
      return await apiGet(token, ANALYTICS_API, {
        ids: 'channel==MINE',
        ...params,
        metrics: fallbackMetrics,
      });
    }
    throw err;
  }
}

/** Analytics'in satir+sutun formatini nesne dizisine cevirir. */
export function rowsToObjects(report) {
  const cols = (report?.columnHeaders ?? []).map((h) => h.name);
  return (report?.rows ?? []).map((row) =>
    Object.fromEntries(cols.map((c, i) => [c, row[i]]))
  );
}

export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export function daysAgo(n, from = new Date()) {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
