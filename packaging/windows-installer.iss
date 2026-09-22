[Setup]
AppId={{6CC81A65-78ED-4870-A53A-97430BFAEF71}
AppName=PENAPRINT - TOOLKIT
AppVersion=1.0.0
DefaultDirName={autopf}\PENAPRINT-TOOLKIT
DefaultGroupName=PENAPRINT - TOOLKIT
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
DisableDirPage=yes
OutputDir=..\dist
OutputBaseFilename=PENAPRINT-TOOLKIT-Setup-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=PENAPRINT - TOOLKIT
SetupLogging=yes

[Files]
Source: "..\dist\PENAPRINT-TOOLKIT-Windows-x64\*"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\PENAPRINT - TOOLKIT"; Filename: "{app}\PENAPRINT-ControlPanel.exe"
Name: "{commondesktop}\PENAPRINT - TOOLKIT"; Filename: "{app}\PENAPRINT-ControlPanel.exe"
Name: "{group}\Kontrol service Windows"; Filename: "{sys}\mmc.exe"; Parameters: "services.msc"

[Code]
var NetworkPage: TInputQueryWizardPage;
    ServiceInstalled: Boolean;

procedure InitializeWizard;
begin
  NetworkPage := CreateInputQueryPage(wpWelcome, 'Sambungan HP', 'Alamat komputer pada jaringan Wi-Fi / LAN',
    'Kosongkan untuk mendeteksi otomatis. Jika ada beberapa adaptor jaringan, isi IPv4 komputer yang satu jaringan dengan HP.');
  NetworkPage.Add('Alamat IPv4 (opsional):', False);
  NetworkPage.Values[0] := ExpandConstant('{param:IP|}');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var I: Integer; Address: String;
begin
  Result := True;
  if CurPageID = NetworkPage.ID then begin
    Address := Trim(NetworkPage.Values[0]);
    for I := 1 to Length(Address) do
      if Pos(Copy(Address, I, 1), '0123456789.') = 0 then Result := False;
    if not Result then MsgBox('Isi alamat IPv4, contoh 192.168.1.10, atau kosongkan untuk otomatis.', mbError, MB_OK);
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if DirExists(ExpandConstant('{commonappdata}\KTPStudio')) then
    Result := 'Instalasi sebelumnya ditemukan di ProgramData\KTPStudio. Hapus service lama melalui uninstaller, lalu pindahkan folder tersebut sebagai cadangan sebelum memasang ulang. Sertifikat dan log tidak akan ditimpa.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var Code: Integer; Args: String;
begin
  if CurStep = ssPostInstall then begin
    ServiceInstalled := False;
    Log('Starting mandatory service installation');
    Args := '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\Setup-Service.ps1') + '"';
    if Trim(NetworkPage.Values[0]) <> '' then Args := Args + ' -IpAddress "' + Trim(NetworkPage.Values[0]) + '"';
    Args := '/D /S /C ""' + ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe') + '" ' + Args + ' > "' + ExpandConstant('{app}\setup-bootstrap.log') + '" 2>&1"';
    if not Exec(ExpandConstant('{cmd}'), Args, '', SW_HIDE, ewWaitUntilTerminated, Code) then
      RaiseException('Tidak dapat menjalankan pemasangan service.');
    Log('Service installer exit code: ' + IntToStr(Code));
    if Code <> 0 then RaiseException('Pemasangan service gagal. Lihat setup-service.log di folder aplikasi. Hapus instalasi melalui Settings sebelum mencoba ulang.');
    ServiceInstalled := True;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var Code: Integer;
begin
  if CurUninstallStep = usUninstall then begin
    if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\Uninstall-SetupService.ps1') + '"', '', SW_HIDE, ewWaitUntilTerminated, Code) then
      RaiseException('Tidak dapat menjalankan penghapusan service.');
    if Code <> 0 then RaiseException('Service gagal dihapus. Periksa service KTPStudio sebelum mencoba kembali.');
  end;
end;

function GetCustomSetupExitCode: Integer;
begin
  if ServiceInstalled then Result := 0 else Result := 1;
end;
