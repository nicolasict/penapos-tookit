# Menjalankan PENAPRINT - TOOLKIT sebagai Windows Service

Server bisa otomatis hidup saat Windows menyala, tanpa terminal yang terus terbuka. Portal dan dialog cetak tetap dibuka melalui browser pengguna; service tidak membuka browser atau mencetak sendiri.

Skrip disiapkan untuk Windows 10/11 x64 dengan Windows PowerShell 5.1. Pemasangan membutuhkan Administrator. Paket ini belum diuji langsung di Windows; workspace pengembangan berada di macOS.

## 1. Siapkan komputer Windows

- Pasang Python 3.12 atau lebih baru **untuk semua pengguna**. Gunakan `python.exe` sungguhan di direktori instalasi, bukan alias Microsoft Store/WindowsApps atau Python di AppData.
- Sediakan OpenSSL untuk Windows yang dapat dijalankan semua pengguna. Catat lokasi `openssl.exe`.
- Unduh **WinSW-x64.exe versi 2.12.0** dari [rilis resmi WinSW](https://github.com/winsw/winsw/releases/tag/v2.12.0). Skrip tidak mengunduh atau menjalankan installer pihak ketiga secara otomatis.
- Pindahkan folder proyek ke komputer Windows, misalnya `C:\KTP-Source`. Tidak perlu menyalin file kunci/API pribadi untuk deployment. Installer memakai daftar file aplikasi yang ditentukan secara eksplisit, bukan seluruh workspace.
- Hubungkan HP dan komputer pada Wi-Fi yang sama. Gunakan profil jaringan Windows **Private**. Catat IPv4 komputer melalui `ipconfig`, misalnya `192.168.0.52`. Sebaiknya alamat ini tetap melalui reservasi DHCP router.
- Jika server manual sedang berjalan di port 8443, hentikan dulu.

## 2. Pasang service

Buka **Windows PowerShell → Run as administrator**, lalu jalankan dari folder proyek:

```powershell
cd C:\KTP-Source

powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\Install-Service.ps1 `
  -IpAddress "192.168.0.52" `
  -PythonPath "C:\Program Files\Python312\python.exe" `
  -OpenSSLPath "C:\Program Files\OpenSSL-Win64\bin\openssl.exe" `
  -WinSWPath "C:\Users\NamaAnda\Downloads\WinSW-x64.exe"
```

**Ganti IP dan ketiga lokasi program sesuai komputer Anda.** Lokasi di atas adalah contoh. `ExecutionPolicy Bypass` hanya berlaku untuk proses PowerShell tersebut, tidak mengubah kebijakan komputer secara permanen.

Installer akan:

1. Memeriksa program, IP, file aplikasi, port, dan service yang sudah ada.
2. Menyalin file aplikasi ke `C:\ProgramData\KTPStudio`.
3. Membuat service **KTPStudio** dengan akun **LocalService** dan startup **Automatic (Delayed Start)**.
4. Mengizinkan LocalService menulis hanya pada folder log dan sertifikat aplikasi. Pengguna yang menjalankan instalasi memperoleh akses baca ke folder portal/log.
5. Membuat aturan firewall untuk TCP 8443, hanya profil Private dan sumber LocalSubnet.
6. Menjalankan service. Kegagalan proses dikonfigurasi untuk mencoba restart setelah 15 detik.

Skrip menolak folder tujuan yang sudah ada agar tidak menimpa instalasi lama. Untuk lokasi atau port lain, tambahkan `-InstallDir "C:\ProgramData\KTPStudioBaru"` atau `-Port 9443`. Hanya satu service bernama KTPStudio yang didukung.

## 3. Buka portal

Setelah pemasangan, jalankan sebagai pengguna Windows yang melakukan instalasi:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\ProgramData\KTPStudio\Open-Portal.ps1"
```

Bisa dibuat shortcut dengan perintah ini sebagai **Target**. Pembuka portal membaca tautan terbaru dari log, termasuk token akses komputer. Jangan memakai bookmark tautan lama setelah service restart: token server berubah setiap kali dimulai ulang.

Sertifikat HTTPS lokal dibuat di `C:\ProgramData\KTPStudio\.local-certs`. Percayai **server.crt** pada Windows dan HP mengikuti panduan kamera. Jangan membagikan **server.key** atau log berisi tautan owner. Installer tidak otomatis mengubah kepercayaan sertifikat perangkat.

Pengguna Windows lain belum otomatis diberi akses ke log/token portal. Administrator dapat menentukan akun operator tambahan dan hak bacanya bila diperlukan.

## 4. Mengelola service

Jalankan sebagai Administrator:

```powershell
Get-Service KTPStudio
Start-Service KTPStudio
Stop-Service KTPStudio
Restart-Service KTPStudio
```

Service juga terlihat pada `services.msc` dengan nama **PENAPRINT - TOOLKIT**.

Restart/stop menghapus foto yang masih mengantre di RAM server dan membatalkan QR lama. Setelah restart, buka portal melalui Open-Portal.ps1 dan buat QR baru. Simpan/cetak hasil browser yang diperlukan sebelum menutup atau refresh halaman.

## Pembaruan aplikasi

Stop service, lalu salin hanya file aplikasi yang berubah dari source ke folder instalasi sebagai Administrator, dan start service lagi. Jangan menimpa `KTPStudio.xml`, folder `logs`, atau `.local-certs` saat hanya memperbarui tampilan. HTML/CSS/JS yang diganti cukup di-refresh pada browser; perubahan Python membutuhkan restart service.

Jangan salin seluruh folder source secara rekursif karena dapat berisi file pribadi atau konfigurasi pengembangan. Daftar file runtime tercantum dalam `$appFiles` pada Install-Service.ps1.

Jika IP berubah, stop service dan ubah argumen `--ip` di `KTPStudio.xml`, lalu start lagi. Server membuat ulang sertifikat untuk IP baru, sehingga kepercayaan sertifikat HP/Windows perlu diperbarui.

## Menghapus service

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\KTP-Source\windows\Remove-Service.ps1
```

Penghapusan meminta konfirmasi, menghentikan service, dan menghapus aturan firewall KTPStudio-LAN. File aplikasi, log, dan sertifikat tetap disimpan. Untuk instalasi di lokasi khusus, berikan `-InstallDir` yang sama.

## Jika tidak berjalan

- Periksa `C:\ProgramData\KTPStudio\logs\KTPStudio.err.log`, `KTPStudio.out.log`, dan `KTPStudio.wrapper.log`.
- Service berstatus Running belum tentu berarti Python siap. Open-Portal.ps1 menunggu tautan startup hingga 20 detik; jika gagal, lihat log.
- `Access denied`: pastikan Python/OpenSSL terpasang untuk semua pengguna dan dapat dibaca/dijalankan oleh LocalService. Tidak cukup hanya bisa dijalankan dari akun Anda.
- `Address already in use`: server manual/aplikasi lain memakai port yang sama.
- HP tidak terhubung: cek IP, profil jaringan Private, firewall, dan isolasi perangkat pada Wi-Fi tamu.
- Kamera tidak muncul: periksa kepercayaan HTTPS dan izin kamera HP. Service tidak menghilangkan persyaratan HTTPS.
- Jika instalasi berhenti setelah service terdaftar, periksa log dan gunakan Remove-Service.ps1 sebelum mencoba ulang; folder tujuan tidak dibersihkan otomatis.

Referensi: [WinSW 2.12.0](https://github.com/winsw/winsw/releases/tag/v2.12.0), [konfigurasi XML versi 2.12.0](https://github.com/winsw/winsw/blob/v2.12.0/doc/xmlConfigFile.md).
