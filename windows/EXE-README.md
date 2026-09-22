# PENAPRINT - TOOLKIT — Windows x64

Paket ini dibangun oleh GitHub Actions. Tidak perlu memasang Python atau OpenSSL.

## Pasang sebagai Windows Service

1. Ekstrak ZIP ke folder lokal. Buka PowerShell **Run as administrator** di folder hasil ekstraksi.
2. Cari IPv4 Wi-Fi/LAN komputer menggunakan `ipconfig`. Gunakan IP tetap/reservasi DHCP supaya alamat HP tidak berubah.
3. Jalankan (ganti contoh IP dengan IP komputer):

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-Service.ps1 -IpAddress "192.168.1.10"
```

Service `KTPStudio` otomatis berjalan setelah Windows menyala. Lokasi instalasi default: `C:\ProgramData\KTPStudio`. Port default: `8443`; gunakan `-Port 9443` jika perlu. Installer menolak folder tujuan yang sudah ada.

4. Buka portal:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\ProgramData\KTPStudio\Open-Portal.ps1"
```

Komputer dan HP harus berada di jaringan yang sama. Aturan firewall hanya mengizinkan subnet lokal pada profil jaringan **Private**. Ikuti panduan kamera di portal untuk mempercayai sertifikat HTTPS lokal pada komputer dan HP. Sertifikat disimpan di `.local-certs`, bukan di dalam EXE.

## Kelola service

Jalankan PowerShell Administrator:

```powershell
Get-Service KTPStudio
Restart-Service KTPStudio
Stop-Service KTPStudio
```

Foto antrean disimpan di RAM dan hilang ketika service berhenti/restart. Buka portal kembali dengan `Open-Portal.ps1` setelah restart karena token akses berubah. Log tersimpan di `C:\ProgramData\KTPStudio\logs`; jangan bagikan log karena mengandung tautan akses portal.

Untuk memperbarui EXE: hentikan service, ganti **hanya** `KTPStudioServer.exe` di folder instalasi dengan versi baru, lalu jalankan `Start-Service KTPStudio`. Simpan folder `.local-certs` agar sertifikat tetap sama. Jika IP berubah, hentikan service dan ubah `--ip` di `KTPStudio.xml`, lalu jalankan kembali; sertifikat baru perlu dipercaya ulang pada HP.

Hapus service dan aturan firewall (file tetap disimpan):

```powershell
powershell -ExecutionPolicy Bypass -File "C:\ProgramData\KTPStudio\Remove-Service.ps1"
```

## Jalankan manual

Untuk mencoba tanpa memasang service, jalankan `./KTPStudioServer.exe --ip 192.168.1.10` dari PowerShell di folder yang dapat ditulis. Buka tautan yang muncul. Hentikan dengan Ctrl+C sebelum memasang service pada port yang sama.

`KTPStudio.exe` adalah wrapper service WinSW, sedangkan aplikasi server adalah `KTPStudioServer.exe`. EXE belum ditandatangani dengan sertifikat penerbit. `SHA256SUMS.txt` berisi checksum paket; verifikasi asal unduhan dari repository Anda.

## Panel kontrol

Buka `PENAPRINT-ControlPanel.exe` untuk melihat status, Mulai, Hentikan, Mulai ulang, dan Buka aplikasi. Panel membutuhkan service yang sudah terpasang; perintah start/stop meminta izin Administrator melalui UAC. Shortcut installer membuka panel ini. Jika service belum terpasang, pasang melalui installer atau skrip instalasi terlebih dahulu.
