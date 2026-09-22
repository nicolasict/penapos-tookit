import concurrent.futures
import http.client
import json
from pathlib import Path
import struct
import sys
import threading
import time
import unittest
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import make_server, image_type


def png():
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2, 2, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b'\x00\xff\x00\x00\x00\xff\x00' * 2)) + chunk(b'IEND', b'')


class TransferTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = make_server('127.0.0.1', 0, 'http://127.0.0.1')
        cls.port = cls.server.server_port
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.owner = self.server.state.owner
        with self.server.state.lock:
            self.phone = self.server.state.rotate()

    def request(self, method, path, token='', body=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        h = {'Authorization': 'Bearer ' + token, **(headers or {})}
        if isinstance(body, dict):
            body = json.dumps(body)
            h['Content-Type'] = 'application/json'
        connection.request(method, path, body=body, headers=h)
        response = connection.getresponse()
        code, data, mime = response.status, response.read(), response.getheader('Content-Type')
        connection.close()
        return code, json.loads(data) if mime == 'application/json' else data

    def upload(self, key='test-photo-1', data=None):
        return self.request('POST', '/api/upload', self.phone, data if data is not None else png(), {'X-Upload-ID': key})

    def test_authorization_and_private_files(self):
        for path in ['/api/config', '/api/inbox', '/api/photo?id=test-photo-1']:
            self.assertEqual(self.request('GET', path)[0], 401)
            self.assertEqual(self.request('GET', path, self.phone)[0], 401)
        for path in ['/server.py', '/.local-certs/server.key', '/README.md', '/../server.py']:
            self.assertEqual(self.request('GET', path)[0], 404)
        self.assertEqual(self.request('GET', '/phone')[0], 200)

    def test_transfer_ack_and_retry(self):
        self.assertEqual(self.upload()[0], 201)
        self.assertEqual(self.upload()[0], 200)
        items = self.request('GET', '/api/inbox', self.owner)[1]['items']
        self.assertEqual(len(items), 1)
        self.assertEqual(self.request('GET', '/api/photo?id=test-photo-1', self.owner)[1], png())
        self.assertEqual(self.request('POST', '/api/ack', self.owner, {'id': 'test-photo-1'})[0], 200)
        self.assertEqual(self.request('GET', '/api/inbox', self.owner)[1]['items'], [])
        self.assertEqual(self.upload()[1]['state'], 'received')
        self.assertEqual(self.request('GET', '/api/receipt?id=test-photo-1', self.phone)[1]['state'], 'received')

    def test_concurrent_retry_once(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            results = list(pool.map(lambda _: self.upload(), range(5)))
        self.assertEqual(sum(code == 201 for code, _ in results), 1)
        self.assertEqual(len(self.server.state.queue), 1)

    def test_backpressure_and_close(self):
        for i in range(10):
            self.assertEqual(self.upload(f'test-photo-{i}')[0], 201)
        self.assertEqual(self.upload('test-overflow')[0], 409)
        self.assertEqual(self.request('POST', '/api/session', self.owner, {})[0], 409)
        self.assertEqual(self.request('POST', '/api/close', self.owner, {})[0], 200)
        self.assertEqual(self.server.state.queue, {})
        self.assertEqual(self.request('GET', '/api/status', self.phone)[0], 401)

    def test_session_expiry_and_rotation(self):
        self.upload()
        self.server.state.expires = time.time() - 1
        self.assertEqual(self.request('GET', '/api/status', self.phone)[0], 401)
        self.assertFalse(self.server.state.queue)
        result = self.request('POST', '/api/session', self.owner, {})
        self.assertEqual(result[0], 200)
        self.assertIn('/phone#token=', result[1]['url'])
        self.assertNotIn(self.owner, result[1]['url'])

    def test_bad_uploads_and_cross_origin(self):
        self.assertEqual(self.upload(data=b'invalid')[0], 400)
        oversized = b'\x89PNG\r\n\x1a\n' + b'\x00' * 8 + struct.pack('>II', 100000, 100000)
        self.assertEqual(self.upload(data=oversized)[0], 400)
        self.assertEqual(self.request('POST', '/api/session', self.owner, {}, {'Origin': 'https://other.example'})[0], 403)
        self.assertEqual(self.request('POST', '/api/ack', self.owner, '[]')[0], 400)
        self.assertEqual(image_type(png()), 'image/png')


if __name__ == '__main__':
    unittest.main()
