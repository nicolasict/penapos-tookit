"""Exercise the standalone Windows executable without external Python/OpenSSL."""
import os
from pathlib import Path
import re
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.request


def main():
    source = Path(sys.argv[1]).resolve()
    with tempfile.TemporaryDirectory(prefix='ktp-exe-') as directory:
        root = Path(directory)
        exe = root / source.name
        shutil.copy2(source, exe)
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        env = os.environ.copy()
        env['PATH'] = str(Path(env['SystemRoot']) / 'System32')
        certificate = None
        for attempt in range(2):
            log = root / f'run-{attempt}.log'
            with log.open('wb') as output:
                process = subprocess.Popen([str(exe), '--host', '127.0.0.1', '--ip', '127.0.0.1', '--port', str(port)], cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
                try:
                    deadline = time.monotonic() + 60
                    owner = None
                    while time.monotonic() < deadline:
                        content = log.read_text(errors='replace')
                        match = re.search(r'#owner=([A-Za-z0-9_-]+)', content)
                        if match:
                            owner = match.group(1)
                            break
                        if process.poll() is not None:
                            raise RuntimeError(content)
                        time.sleep(0.25)
                    if not owner:
                        raise RuntimeError('Executable startup timed out: ' + log.read_text(errors='replace'))
                    cert_path = root / '.local-certs/server.crt'
                    current = cert_path.read_bytes()
                    if certificate is not None:
                        assert certificate == current, 'Certificate changed on restart'
                    certificate = current
                    context = ssl.create_default_context(cafile=str(cert_path))
                    for path in ['/', '/phone.html', '/app.js', '/phone.js', '/style.css', '/phone.css', '/perspective.js', '/pairing.js', '/template-data.js', '/vendor/qrcode.min.js', '/camera-help.html']:
                        with urllib.request.urlopen(f'https://127.0.0.1:{port}{path}', context=context, timeout=10) as response:
                            assert response.status == 200 and response.read(), path
                finally:
                    subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    process.wait(timeout=15)
        print('EXE smoke test passed: HTTPS, bundled assets, persistent certificate, isolated PATH.')


if __name__ == '__main__':
    main()
