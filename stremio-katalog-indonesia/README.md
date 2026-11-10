# Katalog Film Indonesia — Stremio + TMDB

Addon Stremio untuk katalog film Indonesia berbasis metadata TMDB: populer, trending harian, rating terbaik, sedang tayang, upcoming, dan genre. Tidak menyediakan tautan streaming.

## Setup
1. Node.js 20+ dan API key TMDB dibutuhkan.
2. Salin `.env.example` menjadi `.env`, lalu set `TMDB_API_KEY`.
3. Jalankan `npm install` dan `npm start`.
4. Website / install page tersedia di `http://localhost:7000`; manifest di `/manifest.json`; health check di `/health`.

## Deploy ke Railway
Di repository ini addon ada dalam folder `stremio-katalog-indonesia`. Atur Railway service **Root Directory** menjadi `/stremio-katalog-indonesia`, lalu environment variable `TMDB_API_KEY` tambahkan sebagai secret. Railway akan memakai `npm start` dan satu port yang sama untuk landing page dan endpoint Stremio.

## Security
API key jangan commit ke GitHub, dan jangan masukkan ke frontend. Jika key pernah dibagikan di chat, pertimbangkan merotasinya di dashboard TMDB.

TMDB API usage subject to TMDB terms and attribution. This product uses the TMDB API but is not endorsed or certified by TMDB.
