#!/usr/bin/env node
// TEK SEFERLIK, KENDI BILGISAYARINDA kosulur. Refresh token uretir.
// Bu token'i commit ETME; GitHub repo Secrets'a YT_REFRESH_TOKEN olarak gir.
//
//   YT_CLIENT_ID=... YT_CLIENT_SECRET=... node seyirde/scripts/get-refresh-token.mjs

import { createServer } from 'node:http';
import { requireEnv, SCOPES } from './lib/yt.mjs';

const PORT = Number(process.env.PORT ?? 8719);
const REDIRECT = `http://localhost:${PORT}/callback`;
const [clientId, clientSecret] = requireEnv('YT_CLIENT_ID', 'YT_CLIENT_SECRET');

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: SCOPES.join(' '),
  access_type: 'offline', // refresh token almak icin zorunlu
  prompt: 'consent',      // her seferinde yeni refresh token garantiler
}).toString();

console.log('\n1) Bu adresi tarayicida ac:\n');
console.log(authUrl.toString());
console.log('\n2) Kanalin sahibi Google hesabiyla giris yap.');
console.log('   "Google bu uygulamayi dogrulamadi" uyarisi cikarsa:');
console.log('   Advanced / Gelismis -> Go to ... (unsafe) ile devam et.');
console.log(`\n3) Izin verdikten sonra buraya donecek. Dinleniyor: ${REDIRECT}\n`);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/callback') {
    res.writeHead(404).end();
    return;
  }

  const err = url.searchParams.get('error');
  if (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`Hata: ${err}`);
    console.error(`\nIzin verilmedi: ${err}`);
    server.close();
    process.exitCode = 1;
    return;
  }

  const code = url.searchParams.get('code');
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    }),
  });
  const data = await tokenRes.json();

  if (!tokenRes.ok || !data.refresh_token) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      .end('Token alinamadi, terminale bak.');
    console.error('\nToken alinamadi:', JSON.stringify(data, null, 2));
    if (tokenRes.ok && !data.refresh_token) {
      console.error('\nAccess token geldi ama refresh token gelmedi. Genelde bu hesaba');
      console.error('daha once izin verilmis olmasindan olur. Su adresten uygulamanin');
      console.error('erisimini kaldirip tekrar dene: https://myaccount.google.com/permissions');
    }
    server.close();
    process.exitCode = 1;
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(
    '<h2>Tamam.</h2><p>Terminale don, refresh token orada. Bu sekmeyi kapatabilirsin.</p>'
  );

  console.log('\n=== REFRESH TOKEN (bir kez gosterilir) ===\n');
  console.log(data.refresh_token);
  console.log('\n=== Simdi ne yapacaksin ===');
  console.log('GitHub repo -> Settings -> Secrets and variables -> Actions -> New secret');
  console.log('  YT_REFRESH_TOKEN = yukaridaki deger');
  console.log('\nBu degeri dosyaya yazip commit ETME.\n');
  server.close();
});

server.listen(PORT);
