# Hanya aset runtime yang disertakan. Jangan bundel workspace secara rekursif.
from pathlib import Path
project = Path(SPECPATH).parent
assets = ['index.html', 'app.js', 'style.css', 'pairing.js', 'phone.html',
          'phone.js', 'phone.css', 'perspective.js', 'camera-help.html', 'template-data.js',
          'vendor/qrcode.min.js', 'vendor/qrcode.LICENSE']
a = Analysis([str(project / 'server.py')], pathex=[str(project)],
             binaries=[], datas=[(str(project / p), str(Path(p).parent)) for p in assets],
             hiddenimports=['cryptography'], hookspath=[], runtime_hooks=[], excludes=[])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name='KTPStudioServer',
          debug=False, strip=False, upx=False, console=True)
