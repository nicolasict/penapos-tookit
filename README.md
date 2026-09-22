# PENAPRINT - TOOLKIT

Portal cetak KTP dari HP, dengan tampilan web mengikuti Windows 11 Settings. Portal komputer tidak menyediakan unggah file atau pengaturan cetak. Foto masuk hanya melalui kamera/unggahan HP yang dipasangkan.

## Menjalankan

1. Sambungkan komputer dan HP ke Wi-Fi yang sama.
2. Jalankan `python3 server.py`, atau klik dua kali `Jalankan.command` di Mac.
3. Buka tautan komputer dari terminal, termasuk bagian `#owner=…`.
4. Di portal, buka **Hubungkan HP**, klik **Hubungkan HP**, lalu pindai QR.
5. Di HP, aktifkan kamera dan paskan KTP ke bingkai. Periksa empat sudut atau gunakan Kirim otomatis, lalu kirim foto.
6. Foto otomatis masuk ke **Kartu & cetak**. Rapikan posisi melalui **Atur**, gandakan jika perlu, lalu klik **Cetak / PDF** atau **Unduh PNG**.

Untuk melihat pembaruan HTML/CSS/JS, refresh halaman. Simpan/cetak hasil yang diperlukan sebelum refresh: kartu dan penyesuaian belum disimpan permanen.

## Ukuran dan kualitas tetap

- Kertas A4 portrait, 210 × 297 mm.
- 10 kotak, 2 kolom × 5 baris.
- Setiap kotak 85,6 × 54 mm.
- Gambar ditampilkan utuh, proporsi tetap, dengan garis bantu potong.
- PNG 1200 DPI, 9921 × 14031 piksel, termasuk metadata DPI.
- Cetak/PDF menggunakan gambar sumber melalui SVG. Tidak memakai tangkapan layar pratinjau.

Saat dialog cetak muncul, gunakan **A4 portrait, skala 100% / Actual size, tanpa margin, header/footer nonaktif**. Browser tidak dapat memaksakan pengaturan driver printer. Tidak ada lagi pilihan ukuran, template, resolusi, atau penempatan pada portal.

1200 DPI adalah kerapatan piksel ekspor, bukan peningkatan detail foto yang sudah buram. Resolusi kamera langsung HP ditampilkan dalam Opsi kamera. Kamera bawaan dapat memberikan foto lebih besar, tetapi bingkai hanya tersedia setelah foto diambil.

## Tampilan foto

Menu **Tampilan foto** menyediakan:

- Grayscale: sakelar Ya/Tidak. Bawaan Ya, memakai grayscale penuh 100%; Tidak mempertahankan warna.
- Kecerahan: 25–300%; 100% adalah nilai asli.
- Kontras: 25–250%; 100% adalah nilai asli.
- Exposure: −2 sampai +2 EV; +1 EV menggandakan faktor pencahayaan.
- Input angka di samping slider untuk penyesuaian presisi.
- Pratinjau seluruh lembar; preset dan perbandingan asli/hasil tidak ditampilkan.

Urutan filter: grayscale → kecerahan × exposure → kontras. Semua kartu, termasuk foto baru, memakai pengaturan yang sama. Pratinjau, cetak/PDF, dan PNG memakai formula filter yang sama. Menggeser slider tidak membangun ulang daftar kartu sehingga pratinjau lebih lancar. Foto sumber tidak diubah.

## Kamera HP

Halaman HP terdiri dari Foto, Periksa, dan Terkirim. Bingkai mengikuti orientasi layar: tegak saat HP tegak, mendatar saat landscape. Koordinat bingkai diperhitungkan terhadap video yang memenuhi layar agar hasil potong sesuai pratinjau. Empat sudut dapat digeser, dengan bantuan kaca pembesar.

Bingkai adalah panduan, bukan deteksi tepi otomatis atau jaminan akurasi 100%. Gunakan pemeriksaan sudut jika foto miring. Koreksi perspektif selalu dihitung dari foto asli, menggunakan interpolasi bilinear dan keluaran maksimal sekitar 1200 DPI.

## HTTPS lokal

Kamera browser HP memerlukan HTTPS yang dipercaya perangkat. Server membuat sertifikat lokal di `.local-certs/server.crt` dan kunci privat di `.local-certs/server.key`. Sertifikat tidak dipercaya otomatis.

- Buka **Dapatkan bantuan** di portal untuk panduan `camera-help.html` dan unduhan sertifikat publik.
- iPhone/iPad: instal profil sertifikat, lalu aktifkan kepercayaan untuk **KTP Lokal** pada Settings → General → About → Certificate Trust Settings.
- Android: instal sertifikat CA melalui pengaturan keamanan/kredensial perangkat. Nama menu berbeda menurut perangkat.
- Mac: impor sertifikat ke Keychain Access dan atur kepercayaan SSL.
- Hanya percayai sertifikat komputer Anda sendiri. Bagikan hanya `server.crt`, jangan `server.key`.
- Setelah sertifikat dipercaya, muat ulang halaman HP dan izinkan kamera. Perubahan IP dapat membuat sertifikat lokal dibuat ulang, sehingga perlu dipercaya ulang.

Sertifikat terpercaya yang sudah tersedia dapat dipakai melalui `python3 server.py --cert /path/server.crt --key /path/server.key`. Gunakan `--ip 192.168.x.x` untuk menentukan alamat QR.

Melewati peringatan sertifikat saja tidak selalu mengaktifkan kamera. Jika kamera langsung belum tersedia, HP dapat menggunakan **Pilih foto** untuk kamera bawaan, lalu mengatur sudut sebelum mengirim.

`python3 server.py --http --port 8080` tersedia untuk pengujian jaringan lokal. Mode ini tidak mengenkripsi foto dan biasanya tidak mendukung kamera browser HP; gunakan HTTPS untuk pemakaian foto KTP. Server ini ditujukan untuk Wi-Fi lokal, bukan deployment publik/internet.

Referensi: [kamera browser](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [sertifikat Apple](https://support.apple.com/102390), [sertifikat Android](https://support.google.com/pixelphone/answer/2844832?hl=en).

## Antrean dan data

Foto ditampung di RAM komputer (maksimal 10 foto antrean dan 100 MB), lalu dihapus dari antrean setelah diterima portal. Jika 10 kotak sudah penuh, cetak dan kosongkan lembar untuk menerima antrean berikutnya. Penerimaan ditunda saat editor terbuka atau ekspor berlangsung.

Sesi QR berlaku 8 jam. QR baru membatalkan tautan lama. Pengiriman ulang ID foto yang sama tidak menggandakan foto. Menutup sesi, kedaluwarsa, atau menghentikan server menghapus antrean. Foto yang sudah diterima berada di memori browser sampai halaman ditutup/dimuat ulang.

## Desain

Portal dan halaman HP memakai aksen biru, kartu pengaturan, sakelar, dan tipografi yang mengikuti Windows 11 Settings. Halaman HP tetap memakai bingkai kamera besar dan tombol sentuh di bawah. Font utama adalah Segoe UI Variable/Segoe UI jika tersedia; perangkat lain memakai font sistem. Efek latar web mendekati Mica, bukan material native Windows; hasil tidak identik piksel demi piksel pada semua OS/browser.

Referensi Microsoft: [tipografi Windows](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/typography), [material Windows](https://learn.microsoft.com/en-us/windows/apps/develop/ui/materials).

QR memakai [QRCode.js](https://github.com/davidshimjs/qrcodejs), lisensi MIT di `vendor/qrcode.LICENSE`. Foto dan URL QR tidak dikirim ke layanan eksternal. File template lama tetap disimpan sebagai aset, tetapi tidak lagi digunakan portal.

## Verifikasi

- Server: `python3 -m unittest discover -s tests -p 'test_*.py' -v`.
- Chrome Mac dengan kamera sintetis: `python3 tests/check_browser.py`.
- Fixture `tests/verify-browser.html` menguji editor, perspektif, ukuran tetap, ketiadaan unggah desktop/pengaturan cetak, duplikasi, PNG 1200 DPI, metadata DPI, kesamaan piksel pratinjau/PNG, sakelar grayscale dan kontrol warna.
- PDF diperiksa satu halaman A4 portrait dengan toleransi pembulatan browser 0,3 mm. Presisi printer fisik belum diuji.

## Jumlah salinan dinamis

Di **Kartu & cetak**, pilih **Kartu yang digandakan**, isi **Salinan tambahan**, lalu klik **Gandakan**. Contoh: satu kartu + dua salinan tambahan menghasilkan tiga kartu. Salinan ditempatkan di akhir lembar dan membawa pengaturan posisi kartu sumber, tetapi setiap salinan tetap bisa diedit sendiri. Jumlah maksimal mengikuti sisa dari 10 kotak A4; nilai kosong, pecahan, nol, negatif, dan melebihi kapasitas ditolak.

Tombol Reset pada Tampilan foto mengembalikan grayscale ke Ya (100%), kecerahan dan kontras 100%, serta exposure 0 EV.

## Windows Service

Panduan dan skrip pemasangan tersedia di [windows/README.md](windows/README.md). Server dapat dijalankan otomatis saat Windows menyala melalui WinSW. Instalasi dilakukan pada komputer Windows sebagai Administrator; belum diuji langsung di Windows.

## Build EXE melalui GitHub Actions

Build Windows dilakukan di GitHub Actions, bukan di komputer lokal:

1. Push proyek beserta `.github/workflows/build-windows.yml` ke repository GitHub.
2. Buka **Actions → Build Windows EXE → Run workflow**. Workflow juga berjalan ketika push/PR ke `main` atau `master`, dan ketika push tag `v*`.
3. Setelah berhasil, unduh artifact **PENAPRINT-TOOLKIT-Windows-x64** di halaman run, kemudian ekstrak ZIP paket di dalamnya.
4. Ikuti `README.md` di paket atau [panduan paket EXE](windows/EXE-README.md) untuk memasang Windows Service.

Paket berisi server EXE mandiri, wrapper WinSW, dan skrip instalasi/penghapusan service. Komputer Windows tujuan tidak membutuhkan Python/OpenSSL. Workflow menjalankan tes server dan uji EXE (HTTPS, aset bawaan, sertifikat tetap setelah restart), lalu mengunggah ZIP sebagai artifact selama 30 hari. Workflow ini tidak otomatis menerbitkan GitHub Release. Build dan instalasi Windows perlu diverifikasi melalui hasil run Actions dan komputer Windows tujuan.

Pengaturan **Tampilan foto** menyediakan **Kurangi noise** dan **Ketajaman** (0–100%, bawaan 0). Hasil diterapkan pada pratinjau, cetak, dan PNG tanpa menimpa foto sumber. Mulai dengan noise 30% dan ketajaman 25%; foto yang sangat buram tidak dapat dipulihkan sepenuhnya. Ekspor A4 1200 DPI menghasilkan 9921 × 14031 piksel dan membutuhkan memori lebih besar.

**Perjelas otomatis** di Tampilan foto meratakan pencahayaan lokal, mencerahkan latar, dan menambahkan pengurangan noise serta ketajaman ringan. Efek berlaku untuk semua kartu, pratinjau, cetak, dan PNG. Matikan sakelar untuk kembali ke pengaturan manual atau gunakan Reset. Periksa foto wajah dan latar berwarna karena efek dokumen dapat mengubah tampilannya; foto sumber tidak ditimpa.

## Scan dokumen A4

Pilih **Mode scan → Dokumen · Full A4** sebelum menghubungkan HP, lalu pindai QR baru. Bingkai HP dan koreksi empat sudut memakai rasio A4. Satu foto ditampilkan pada satu lembar 210 × 297 mm tanpa garis kotak. Gunakan **Atur → Luruskan 4 sudut** untuk memenuhi halaman sesuai dokumen, lalu aktifkan **Perjelas otomatis** bila diperlukan. Cetak/PDF dan PNG 1200 DPI tersedia. Mode dapat diganti saat HP terhubung; pindai QR baru setelah berganti mode. Jika ada foto dalam antrean, terima dan cetak terlebih dahulu. foto yang sudah diterima disimpan terpisah pada tiap mode selama halaman terbuka. Dokumen berikutnya menunggu di antrean sampai lembar dikosongkan. Printer tanpa dukungan borderless dapat menyisakan margin fisik.

Mode A4 menggunakan isi penuh (cover) tanpa border/margin aplikasi. Jika rasio foto berbeda, tepi foto dapat terpotong; luruskan empat sudut terlebih dahulu. Cetak tepi-ke-tepi membutuhkan opsi A4 borderless pada driver printer yang mendukungnya.

## Installer Windows siap pasang

Buka GitHub **Actions → Build Windows EXE → Run workflow**. Setelah berhasil, unduh artifact **PENAPRINT-TOOLKIT-Installer**, ekstrak, lalu jalankan **PENAPRINT-TOOLKIT-Setup-x64.exe** di Windows 10/11 x64.

Installer meminta hak Administrator, memasang service otomatis, dan membuat shortcut desktop/Start Menu. Tidak perlu Python atau OpenSSL. Kolom IPv4 boleh dikosongkan untuk deteksi otomatis; isi IP Wi-Fi/LAN secara manual bila komputer mempunyai beberapa adaptor. Buka aplikasi melalui shortcut setelah instalasi. Gunakan jaringan Private dan ikuti panduan sertifikat di aplikasi agar kamera HP dapat berjalan.

Hapus aplikasi melalui Settings → Apps. Service dan aturan firewall dihapus; folder `C:\ProgramData\KTPStudio` berisi sertifikat/log tetap disimpan. Installer menolak menimpa instalasi lama: uninstall terlebih dahulu dan pindahkan folder tersebut sebagai cadangan sebelum memasang ulang. Build ini belum mendukung upgrade otomatis.

Installer dibangun dengan Inno Setup di runner Windows. Workflow menguji pemasangan diam-diam, status service, dan uninstall. File belum ditandatangani dengan sertifikat penerbit. Hasil EXE hanya tersedia setelah workflow berhasil; build Windows tidak dijalankan di macOS.
