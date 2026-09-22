"""Verify a running installed service, including TLS and packaged web assets."""
from pathlib import Path
import argparse
import ssl
import time
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--expected-cert')
    args = parser.parse_args()
    root = Path(args.root)
    deadline = time.monotonic() + 60
    last_error = None
    while time.monotonic() < deadline:
        try:
            cert = root / '.local-certs/server.crt'
            if args.expected_cert:
                assert cert.read_bytes() == Path(args.expected_cert).read_bytes(), 'Certificate changed on restart'
            context = ssl.create_default_context(cafile=str(cert))
            for path in ('/', '/phone.html', '/app.js', '/phone.js', '/perspective.js'):
                with urllib.request.urlopen('https://127.0.0.1:8443' + path, context=context, timeout=5) as response:
                    assert response.status == 200 and response.read(), path
            print('Installed service HTTPS and application assets verified.')
            return
        except (OSError, AssertionError) as error:
            last_error = error
            time.sleep(.5)
    raise RuntimeError(f'Installed service failed readiness check: {last_error}')


if __name__ == '__main__':
    main()
