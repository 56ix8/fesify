# Fesify

**Pemutar musik web gratis** bergaya modern Spotify & Apple Music, didukung jutaan katalog musik [YouTube Music](https://music.youtube.com). Tanpa login, tanpa iklan.

---

## Tentang Fesify

Fesify adalah pemutar musik web instan dan modern. Cari lagu favorit, dengarkan album dan artis populer, buat playlist pribadi, baca lirik tersinkronisasi per detik, buat **Instagram Story Card**, impor playlist dari **Spotify**, dan nikmati musik bersama teman melalui fitur **Listen Together (Live Sync Rooms)** — semuanya tanpa perlu registrasi akun.

Seluruh data library (favorit, playlist, riwayat putar, dan statistik) tersimpan aman di perangkat lokal pengguna.

---

## Fitur Unggulan

### 1. Instagram Story Card Generator (9:16 Visual Exporter)
Buat poster musik vertikal resolusi tinggi (1080×1920) dengan album art, lirik aktif, visualizer gelombang, dan logo Fesify siap bagikan ke Instagram Story.

### 2. Spotify Playlist Importer
Salin link playlist/album Spotify publik apa pun untuk langsung dipindahkan dan dicocokkan ke database Fesify dalam hitungan detik.

### 3. Listen Together (Live Sync Rooms)
Buat room siaran musik dan bagikan kode room ke teman untuk mendengarkan lagu dan detik pemutaran yang sama secara real-time.

### 4. PWA & Offline Caching
Didukung Service Worker (`sw.js`) untuk akses instan dan dapat di-install langsung di HP (Android/iOS) maupun laptop/PC.

---

## Menjalankan Secara Lokal

Memerlukan [Node.js](https://nodejs.org) versi 18+.

```bash
git clone https://github.com/56ix8/fesify.git
cd fesify
npm install
npm start
```

Buka **http://localhost:3000** di browser.

---

## Deploy ke Vercel

1. Buka [vercel.com/new](https://vercel.com/new).
2. Import repository **`56ix8/fesify`**.
3. Klik **Deploy** (konfigurasi sudah otomatis melalui `vercel.json`).

---

## Struktur Folder

```
fesify/
├── public/           # Frontend Web (HTML, CSS, Vanilla JS, Logos, SW)
├── lib/api.js        # Inti API: YouTube Music Proxy, Lirik, Spotify Matcher, Download (dipakai Express & Cloudflare)
├── server.js         # Adapter Express (lokal & Vercel) + Rooms
├── api/index.js      # Serverless entry point untuk Vercel
├── vercel.json       # Konfigurasi routing Vercel
├── _worker.js        # Adapter Cloudflare Workers
├── wrangler.toml     # Konfigurasi Cloudflare Workers
├── package.json
└── README.md
```
