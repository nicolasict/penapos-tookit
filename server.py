#!/usr/bin/env python3
"""Server lokal KTP: HTTPS, pairing QR, antrean foto dalam RAM saja."""
import argparse
import hashlib
import ipaddress
import json
import mimetypes
import os
from pathlib import Path
import secrets
import socket
import ssl
import sys
import struct
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

ROOT = Path(__file__).resolve().parent
DATA_ROOT = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else ROOT
MAX_IMAGE = 20 * 1024 * 1024
MAX_PIXELS = 40_000_000
STATIC = {'/': 'index.html', '/index.html': 'index.html', '/phone': 'phone.html',
          '/phone.html': 'phone.html', '/camera-help.html': 'camera-help.html', '/app.js': 'app.js', '/style.css': 'style.css',
          '/template-data.js': 'template-data.js', '/pairing.js': 'pairing.js',
          '/phone.js': 'phone.js', '/phone.css': 'phone.css', '/perspective.js': 'perspective.js',
          '/vendor/qrcode.min.js': 'vendor/qrcode.min.js'}


def image_type(data):
    """Valide signature + dimensi sebelum meneruskan data ke browser."""
    if data.startswith(b'\x89PNG\r\n\x1a\n') and len(data) >= 24:
        w, h = struct.unpack('>II', data[16:24])
        if not 0 < w * h <= MAX_PIXELS:
            raise ValueError('Resolusi gambar terlalu besar (maksimal 40 megapiksel).')
        return 'image/png'
    if data.startswith(b'\xff\xd8\xff'):
        i = 2
        while i + 4 < len(data):
            if data[i] != 255:
                break
            marker = data[i + 1]
            if marker == 255:
                i += 1
                continue
            if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
                i += 2
                continue
            size = int.from_bytes(data[i + 2:i + 4], 'big')
            if size < 2 or i + 2 + size > len(data):
                break
            if marker in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack('>HH', data[i + 5:i + 9])
                if not 0 < w * h <= MAX_PIXELS:
                    raise ValueError('Resolusi gambar terlalu besar (maksimal 40 megapiksel).')
                return 'image/jpeg'
            i += 2 + size
    raise ValueError('Kirim gambar JPEG atau PNG yang valid.')


class Inbox:
    def __init__(self):
        self.lock = threading.RLock()
        self.owner = secrets.token_urlsafe(32)
        self.phone = ''
        self.expires = 0
        self.queue = {}
        self.receipts = {}
        self.last_phone = 0

    def rotate(self):
        self.phone = secrets.token_urlsafe(24)
        self.expires = time.time() + 8 * 3600
        self.queue.clear()
        self.receipts.clear()
        self.last_phone = 0
        return self.phone

    def expire(self):
        if self.phone and time.time() > self.expires:
            self.phone = ''
            self.queue.clear()
            self.receipts.clear()


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *args):
        pass  # Jangan mencatat foto, token pairing, atau URL pengguna.

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def reply(self, status, payload=b'', content_type='application/json'):
        if isinstance(payload, (dict, list)):
            payload = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Permissions-Policy', 'camera=(self), microphone=()')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(payload)

    def error(self, code, text):
        self.reply(code, {'error': text})

    def token(self):
        return self.headers.get('Authorization', '').removeprefix('Bearer ')

    def authorized(self, role):
        state = self.server.state
        state.expire()
        expected = state.owner if role == 'owner' else state.phone
        return bool(expected) and secrets.compare_digest(self.token(), expected)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/local-certificate.crt':
            if self.server.public_certificate:
                self.reply(200, self.server.public_certificate, 'application/x-x509-ca-cert')
            else:
                self.error(404, 'Sertifikat lokal tidak tersedia pada server ini.')
            return
        if path in STATIC:
            file = ROOT / STATIC[path]
            self.reply(200, file.read_bytes(), mimetypes.guess_type(str(file))[0] or 'application/octet-stream')
            return
        with self.server.state.lock:
            state = self.server.state
            if path in ('/api/config', '/api/inbox', '/api/photo'):
                if not self.authorized('owner'):
                    self.error(401, 'Buka tautan komputer dari terminal untuk menghubungkan HP.')
                    return
                if path == '/api/config':
                    self.reply(200, {'baseUrl': self.server.public_url, 'active': bool(state.phone)})
                elif path == '/api/inbox':
                    self.reply(200, {'items': [{'id': key, 'type': item['type']} for key, item in state.queue.items()],
                                     'connected': time.time() - state.last_phone < 20, 'active': bool(state.phone)})
                else:
                    key = parse_qs(urlsplit(self.path).query).get('id', [''])[0]
                    item = state.queue.get(key)
                    if item:
                        self.reply(200, item['data'], item['type'])
                    else:
                        self.error(404, 'Foto tidak lagi ada dalam antrean.')
                return
            if path in ('/api/status', '/api/receipt'):
                if not self.authorized('phone'):
                    self.error(401, 'Tautan HP kedaluwarsa. Pindai QR baru di komputer.')
                    return
                state.last_phone = time.time()
                if path == '/api/status':
                    self.reply(200, {'queued': len(state.queue), 'capacity': 10})
                else:
                    key = parse_qs(urlsplit(self.path).query).get('id', [''])[0]
                    self.reply(200, {'state': state.receipts.get(key, {}).get('state', 'unknown')})
                return
        self.error(404, 'Tidak ditemukan.')

    def do_POST(self):
        path = urlsplit(self.path).path
        role = 'phone' if path == '/api/upload' else 'owner'
        # Tolak cross-origin sebelum membaca body.
        origin = self.headers.get('Origin')
        expected = f'{self.server.scheme}://{self.headers.get("Host", "")}'
        if origin and origin != expected:
            self.close_connection = True
            self.error(403, 'Origin tidak diizinkan.')
            return
        with self.server.state.lock:
            if not self.authorized(role):
                self.close_connection = True
                self.error(401, 'Sesi tidak valid. Hubungkan ulang melalui QR komputer.')
                return
        try:
            length = int(self.headers.get('Content-Length', '-1'))
            limit = MAX_IMAGE if path == '/api/upload' else 4096
            if not 0 <= length <= limit:
                self.close_connection = True
                self.error(413, 'Ukuran file maksimal 20 MB.')
                return
            data = self.rfile.read(length)
            if len(data) != length:
                self.close_connection = True
                self.error(400, 'Unggahan terputus. Coba kirim lagi.')
                return
            with self.server.state.lock:
                state = self.server.state
                if not self.authorized(role):
                    self.error(401, 'Sesi telah berakhir.')
                    return
                if path == '/api/session':
                    if state.queue:
                        self.error(409, 'Masih ada foto menunggu. Terima foto terlebih dahulu sebelum membuat QR baru.')
                        return
                    token = state.rotate()
                    self.reply(200, {'url': f'{self.server.public_url}/phone#token={token}'})
                elif path == '/api/close':
                    state.phone = ''
                    state.queue.clear()
                    state.receipts.clear()
                    self.reply(200, {'ok': True})
                elif path == '/api/ack':
                    obj = json.loads(data)
                    if not isinstance(obj, dict):
                        raise ValueError('Data konfirmasi tidak valid.')
                    key = obj.get('id')
                    if key in state.queue:
                        state.queue.pop(key)
                        state.receipts[key]['state'] = 'received' if obj.get('accepted', True) else 'rejected'
                    self.reply(200, {'ok': True})
                elif path == '/api/upload':
                    key = self.headers.get('X-Upload-ID', '')
                    if not 8 <= len(key) <= 100 or not all(c.isalnum() or c == '-' for c in key):
                        self.error(400, 'ID unggahan tidak valid.')
                        return
                    digest = hashlib.sha256(data).hexdigest()
                    if key in state.receipts:
                        if state.receipts[key]['digest'] != digest:
                            self.error(409, 'ID foto sudah digunakan untuk gambar berbeda.')
                            return
                        self.reply(200, {'id': key, 'state': state.receipts[key]['state']})
                        return
                    if len(state.queue) >= 10 or sum(len(v['data']) for v in state.queue.values()) + len(data) > 100 * 1024 * 1024:
                        self.error(409, 'Antrean penuh. Cetak dan kosongkan lembar di komputer terlebih dahulu.')
                        return
                    if len(state.receipts) >= 1000:
                        self.error(409, 'Buat sesi QR baru di komputer untuk melanjutkan.')
                        return
                    mime = image_type(data)
                    state.queue[key] = {'data': data, 'type': mime}
                    state.receipts[key] = {'state': 'queued', 'digest': digest}
                    state.last_phone = time.time()
                    self.reply(201, {'id': key, 'state': 'queued'})
                else:
                    self.error(404, 'Tidak ditemukan.')
        except (ValueError, KeyError, TypeError, struct.error) as exc:
            self.error(400, str(exc) or 'Permintaan tidak valid.')
        except (TimeoutError, ConnectionError, OSError):
            self.close_connection = True


def make_server(host, port, public_url, context=None):
    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    server.state = Inbox()
    server.public_certificate = None
    server.public_url = public_url.rstrip('/')
    server.scheme = 'https' if context else 'http'
    if context:
        server.socket = context.wrap_socket(server.socket, server_side=True)
    return server


def local_ip():
    for interface in ('en0', 'en1'):
        try:
            value = subprocess.check_output(['ipconfig', 'getifaddr', interface], stderr=subprocess.DEVNULL).decode().strip()
            ipaddress.ip_address(value)
            return value
        except (OSError, subprocess.CalledProcessError, ValueError):
            pass
    try:
        return socket.gethostbyname(socket.gethostname())
    except OSError:
        return '127.0.0.1'


def create_bundled_certificate(ip, cert_path, key_path):
    """EXE membawa cryptography; tidak memerlukan openssl.exe di komputer pengguna."""
    from datetime import datetime, timedelta, timezone
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'KTP Lokal')])
    now = datetime.now(timezone.utc)
    addresses = list(dict.fromkeys([ipaddress.ip_address(ip), ipaddress.ip_address('127.0.0.1')]))
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
            .public_key(private_key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(minutes=5)).not_valid_after(now + timedelta(days=365))
            .add_extension(x509.SubjectAlternativeName([x509.IPAddress(a) for a in addresses] + [x509.DNSName('localhost')]), critical=False)
            .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
            .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False,
                key_encipherment=True, data_encipherment=False, key_agreement=False,
                key_cert_sign=True, crl_sign=True, encipher_only=False, decipher_only=False), critical=True)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
            .sign(private_key, hashes.SHA256()))
    key_path.write_bytes(private_key.private_bytes(serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))


def tls_context(ip, cert=None, key=None):
    if not cert:
        directory = DATA_ROOT / '.local-certs'
        directory.mkdir(mode=0o700, exist_ok=True)
        cert, key = directory / 'server.crt', directory / 'server.key'
        marker = directory / 'address.txt'
        if not cert.exists() or not key.exists() or not marker.exists() or marker.read_text() != ip:
            config = directory / 'openssl.cnf'
            config.write_text(f'[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=KTP Lokal\n[ext]\nsubjectAltName=IP:{ip},IP:127.0.0.1,DNS:localhost\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n')
            if getattr(sys, 'frozen', False):
                create_bundled_certificate(ip, cert, key)
            else:
                subprocess.run(['openssl', 'req', '-x509', '-nodes', '-newkey', 'rsa:2048', '-days', '365', '-keyout', str(key), '-out', str(cert), '-config', str(config)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            key.chmod(0o600)
            marker.write_text(ip)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(str(cert), str(key))
    return context


def main():
    parser = argparse.ArgumentParser(description='Hubungkan kamera HP ke lembar KTP A4 di komputer.')
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=8443)
    parser.add_argument('--ip', help='Alamat IP LAN komputer untuk QR')
    parser.add_argument('--http', action='store_true', help='Tanpa HTTPS: kamera langsung HP mungkin tidak tersedia')
    parser.add_argument('--cert', help='Sertifikat HTTPS terpercaya (PEM)')
    parser.add_argument('--key', help='Kunci privat sertifikat (PEM)')
    args = parser.parse_args()
    if bool(args.cert) != bool(args.key):
        parser.error('--cert dan --key harus digunakan bersama.')
    ip = args.ip or local_ip()
    ipaddress.ip_address(ip)
    context = None if args.http else tls_context(ip, args.cert, args.key)
    scheme = 'https' if context else 'http'
    base = f'{scheme}://{ip}:{args.port}'
    server = make_server(args.host, args.port, base, context)
    if context and not args.cert:
        server.public_certificate = (DATA_ROOT / '.local-certs/server.crt').read_bytes()
    print(f'\nBuka di komputer: {base}/#owner={server.state.owner}', flush=True)
    print('Klik Hubungkan HP, lalu pindai QR dengan HP pada Wi-Fi yang sama.', flush=True)
    if context and not args.cert:
        print('HTTPS lokal memakai sertifikat sendiri. Kamera HP memerlukan sertifikat ini dipercaya oleh perangkat; panduan: README.md.', flush=True)
    print('Foto hanya ditampung di RAM. Ctrl+C untuk menghentikan server.\n', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
