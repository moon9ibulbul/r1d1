# RidiHook - Modul LSPatch / Xposed untuk Ridibooks Android

Modul LSPatch / Xposed untuk menginjeksi fungsionalitas viewer downloader (EPUB & Comic Archive) ke dalam aplikasi Ridibooks Android, diadaptasi dari repositori [qpsg4ojf8tnuf3td9tp97prb/r1d18ook5](https://github.com/qpsg4ojf8tnuf3td9tp97prb/r1d18ook5).

## 🚀 Fitur

- **Hook WebView Ridibooks**: Mengaktifkan `setWebContentsDebuggingEnabled(true)`, `javaScriptEnabled`, dan `domStorageEnabled`.
- **Injeksi Skrip Otomatis**: Menginjeksi library `jszip.js` dan skrip `inject.js` ke WebView saat halaman viewer selesai dimuat.
- **Native Android Download Bridge**: Menggunakan `@JavascriptInterface` (`RidiNativeBridge`) untuk menerima data hasil ekstraksi (EPUB / ZIP) dan menyimpannya langsung ke folder `Downloads/RidiBooks` perangkat via MediaStore / File API Android tanpa kendala pembatasan Blob browser.
- **Dukungan UI Mobile**: Menyediakan tombol floating download yang responsif pada layar sentuh mobile serta integrasi notifikasi Toast Android.
- **GitHub Actions Workflow**: Otomatisasi kompilasi APK Debug & Release dan deploy artifact/release pada setiap push, tag, atau via `workflow_dispatch`.

## 📦 Cara Memasang lewat LSPatch

1. Unduh APK modul `RidiHook` dari tab **Actions / Releases** di GitHub.
2. Unduh dan buka aplikasi **LSPatch** di perangkat Android Anda.
3. Pilih aplikasi **Ridibooks** (`com.initialcoms.ridi`).
4. Tambahkan modul **RidiHook** yang telah diinstal / diunduh.
5. Jalankan patch dan instal APK hasil patch LSPatch.
6. Buka buku atau komik di Ridibooks; tombol unduh akan muncul di layar viewer.

## 🛠️ Build Mandiri

```bash
# Clone repositori
git clone https://github.com/moon9ibulbul/r1d1.git
cd r1d1

# Build debug dan release APK
./gradlew assembleDebug assembleRelease
```

File APK akan tersedia di:
- `app/build/outputs/apk/debug/app-debug.apk`
- `app/build/outputs/apk/release/app-release-unsigned.apk`
