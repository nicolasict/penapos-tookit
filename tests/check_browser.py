"""Uji Chrome headless: kamera sintetis -> HP -> antrean -> lembar desktop -> PDF."""
import base64
import hashlib
import json
from pathlib import Path
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import make_server


class CDP:
    def __init__(self, url):
        parsed = urllib.parse.urlsplit(url)
        self.sock = socket.create_connection((parsed.hostname, parsed.port), timeout=30)
        key = base64.b64encode(b'ktp-browser-test!').decode()
        self.sock.sendall((f'GET {parsed.path} HTTP/1.1\r\nHost: {parsed.netloc}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n').encode())
        header = b''
        while not header.endswith(b'\r\n\r\n'):
            header += self.sock.recv(1)
        if not header.startswith(b'HTTP/1.1 101 '):
            raise RuntimeError(header.decode())
        self.seq = 0

    def read(self, n):
        result = b''
        while len(result) < n:
            part = self.sock.recv(n - len(result))
            if not part:
                raise RuntimeError('Chrome socket closed')
            result += part
        return result

    def call(self, method, params=None):
        self.seq += 1
        data = json.dumps({'id': self.seq, 'method': method, 'params': params or {}}).encode()
        size = len(data)
        header = bytes([0x81, 0x80 | size]) if size < 126 else bytes([0x81, 0xfe]) + struct.pack('>H', size) if size < 65536 else bytes([0x81, 0xff]) + struct.pack('>Q', size)
        mask = b'KTP!'
        self.sock.sendall(header + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))
        assembled = b''
        while True:
            a, b = self.read(2)
            n = b & 127
            if n == 126:
                n = struct.unpack('>H', self.read(2))[0]
            elif n == 127:
                n = struct.unpack('>Q', self.read(8))[0]
            payload = self.read(n)
            if a & 15 == 8:
                raise RuntimeError('WebSocket closed')
            assembled += payload
            if not a & 128:
                continue
            result = json.loads(assembled)
            assembled = b''
            if result.get('id') == self.seq:
                if 'error' in result:
                    raise RuntimeError(result['error'])
                return result['result']

    def evaluate(self, expression):
        result = self.call('Runtime.evaluate', {'expression': expression, 'awaitPromise': True, 'returnByValue': True, 'userGesture': True})
        if 'exceptionDetails' in result:
            raise RuntimeError(result['exceptionDetails'])
        return result.get('result', {}).get('value')

    def wait(self, expression, timeout=20):
        until = time.time() + timeout
        while time.time() < until:
            try:
                if self.evaluate(expression):
                    return
            except RuntimeError:
                pass
            time.sleep(.2)
        raise AssertionError('Timed out: ' + expression)


def run():
    root = Path(__file__).resolve().parents[1]
    server = make_server('127.0.0.1', 0, 'http://127.0.0.1')
    base = f'http://127.0.0.1:{server.server_port}'
    server.public_url = base
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    profile = tempfile.mkdtemp(prefix='ktp-browser-')
    logfile = open('/tmp/ktp-browser-check.log', 'w')
    process = subprocess.Popen(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '--headless', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--user-data-dir=' + profile, 'about:blank'], stdout=logfile, stderr=logfile)
    connections = []
    try:
        marker = Path(profile) / 'DevToolsActivePort'
        for _ in range(100):
            if marker.exists():
                break
            time.sleep(.1)
        port = int(marker.read_text().splitlines()[0])

        def tab(url):
            req = urllib.request.Request(f'http://127.0.0.1:{port}/json/new?' + urllib.parse.quote(url, safe=''), method='PUT')
            result = json.load(urllib.request.urlopen(req))
            client = CDP(result['webSocketDebuggerUrl'])
            connections.append(client)
            client.wait('location.href !== "about:blank" && document.readyState === "complete"')
            return client

        desktop = tab(f'{base}/#owner={server.state.owner}')
        desktop.wait('!!document.getElementById("pairPhone")')
        desktop.call('Emulation.setDeviceMetricsOverride', {'width':1440,'height':1000,'deviceScaleFactor':1,'mobile':False})
        desktop.evaluate('showPane("phone");document.getElementById("pairPhone").click()')
        desktop.wait('!document.getElementById("pairDetails").hidden')
        assert desktop.evaluate('!!document.querySelector("#pairQr canvas")'), 'QR not rendered'
        phone_url = desktop.evaluate('document.getElementById("phoneLink").href')
        phone = tab(phone_url)
        phone.wait('connected === true')
        for width, height in [(320,568),(390,844),(430,932),(844,390)]:
            phone.call('Emulation.setDeviceMetricsOverride', {'width':width,'height':height,'deviceScaleFactor':1,'mobile':True})
            phone.wait('window.innerWidth === '+str(width))
            assert phone.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Horizontal overflow'
            assert phone.evaluate('(()=>{const r=document.getElementById("startCamera").getBoundingClientRect();return r.height>=48&&r.bottom<=innerHeight&&r.top>=0})()'), 'Action out of reach'
        phone.call('Emulation.setDeviceMetricsOverride', {'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
        phone.wait('window.innerWidth === 390')
        def screenshot(name):
            data=phone.call('Page.captureScreenshot', {'format':'png'})
            Path('/tmp/ktp-phone-'+name+'.png').write_bytes(base64.b64decode(data['data']))
        screenshot('start')
        phone.evaluate('document.getElementById("startCamera").click()')
        phone.wait('!!stream && document.getElementById("video").videoWidth > 0 && !document.getElementById("shutter").disabled')
        assert phone.evaluate('getComputedStyle(document.getElementById("frame")).display !== "none"')
        assert phone.evaluate('(()=>{const v=document.getElementById("video"),s=document.getElementById("cameraStage"),f=document.getElementById("frame"),b=frameRect(v.videoWidth,v.videoHeight),k=Math.max(s.clientWidth/v.videoWidth,s.clientHeight/v.videoHeight);return Math.abs(parseFloat(f.style.width)-b.w*k)<.1&&Math.abs(parseFloat(f.style.top)-((s.clientHeight-v.videoHeight*k)/2+b.y*k))<.1})()'), 'Visible guide does not match crop'
        screenshot('camera')
        point = phone.evaluate('(()=>{const r=document.getElementById("shutter").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
        phone.call('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{**point,'id':1}]})
        phone.call('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
        phone.wait('!!original && !document.getElementById("review").hidden')
        assert phone.evaluate('points.length === 4 && points[0].x > 0'), 'Frame not mapped to image'
        assert phone.evaluate('document.getElementById("capturePanel").hidden'), 'Capture screen still visible'
        assert phone.evaluate('(()=>{const r=document.getElementById("send").getBoundingClientRect();return r.height>=48&&r.bottom<=innerHeight})()'), 'Send action out of reach'
        assert phone.evaluate('(()=>{const c=document.querySelector("#corners [data-index]"),r=c.getBoundingClientRect();return r.width>=44&&r.height>=44})()'), 'Corner touch targets too small'
        screenshot('review')
        point = phone.evaluate('(()=>{const r=document.getElementById("send").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
        phone.call('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{**point,'id':1}]})
        phone.call('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
        phone.wait('!document.getElementById("sent").hidden', 30)
        desktop.wait('cards.length === 1', 30)
        phone.wait('document.getElementById("receipt").textContent.includes("Sudah masuk")')
        screenshot('sent')
        assert phone.evaluate("""(()=>{
          const b=document.createElement('button');document.body.append(b);let n=0;
          bindMobileTap(b,()=>n++);const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
          b.setPointerCapture=()=>{};
          const pointer=(type,dx=0)=>b.dispatchEvent(new PointerEvent(type,{pointerId:99,pointerType:'touch',isPrimary:true,clientX:x+dx,clientY:y,bubbles:true,cancelable:true}));
          pointer('pointerdown');pointer('pointerup');b.dispatchEvent(new MouseEvent('click',{detail:1}));
          const once=n===1;pointer('pointerdown');pointer('pointercancel');pointer('pointerup');
          const cancelled=n===1;pointer('pointerdown');pointer('pointermove',30);pointer('pointerup');
          const dragged=n===1;b.click();b.remove();return once&&cancelled&&dragged&&n===2;
        })()"""), 'Touch duplicate/cancel/drag/keyboard handling'

        print('PASS: mobile 320/390/430 px dan landscape, tombol terjangkau, titik sentuh besar, bingkai sesuai hasil potong.', flush=True)
        assert desktop.evaluate('cards[0].img.naturalWidth > 100 && cards[0].adjust.turn === initialAdjust(cards[0].img).turn')
        print('PASS: QR, kamera sintetis dengan bingkai, koreksi sudut, transfer HP, penerimaan otomatis desktop, konfirmasi HP.', flush=True)
        desktop.evaluate('showPane("cards");document.getElementById("duplicateCount").value=9;document.getElementById("fill").click()')
        assert desktop.evaluate('cards.length === 10')
        desktop.evaluate('document.getElementById("grayscale").checked=true;document.getElementById("brightness").value=125;updateTone()')
        shot=desktop.call('Page.captureScreenshot', {'format':'png','captureBeyondViewport':True})
        Path('/tmp/ktp-dashboard-portrait.png').write_bytes(base64.b64decode(shot['data']))
        desktop.evaluate('showPane("tone")')
        tone_shot=desktop.call('Page.captureScreenshot', {'format':'png','captureBeyondViewport':True})
        Path('/tmp/ktp-settings-tone.png').write_bytes(base64.b64decode(tone_shot['data']))
        result = desktop.call('Page.printToPDF', {'preferCSSPageSize': True, 'printBackground': True, 'displayHeaderFooter': False})
        pdf = base64.b64decode(result['data'])
        Path('/tmp/ktp-mobile-a4-test.pdf').write_bytes(pdf)
        import re
        assert len(re.findall(rb'/Type\s*/Page\b', pdf)) == 1
        bounds=re.search(rb'/MediaBox\s*\[([^]]+)\]',pdf).group(1).split()
        width,height=float(bounds[2])*25.4/72,float(bounds[3])*25.4/72
        assert abs(width-210)<.3 and abs(height-297)<.3, (width,height)
        print('PASS: sepuluh kartu hasil HP dicetak dalam satu halaman PDF A4.', flush=True)
        assert desktop.evaluate('!document.getElementById("scanMode").disabled'), 'Mode locked while phone connected'
        desktop.evaluate('document.getElementById("scanMode").value="a4";document.getElementById("scanMode").dispatchEvent(new Event("change"))')
        desktop.wait('scanMode === "a4" && !busy')
        assert desktop.evaluate('new URL(document.getElementById("phoneLink").href).searchParams.get("mode") === "a4"'), 'QR mode not updated'
        assert desktop.evaluate('modeCards.ktp.length === 10 && capacity() === 1'), 'Mode switch lost cards'
        print('PASS: ganti A4 saat HP terhubung, QR diperbarui, kartu KTP tetap tersimpan.', flush=True)
        # Tes geometri/ekspor yang sudah ada, dalam tab terpisah.
        check = tab((root / 'tests/verify-browser.html').as_uri())
        check.wait('!!document.getElementById("test-results")', 45)
        outcome = json.loads(check.evaluate('document.getElementById("test-results").textContent'))
        assert outcome['ok'], outcome
        print('PASS: regresi editor, perspektif, duplikasi, ukuran tetap, PNG 1200 DPI, metadata, sakelar grayscale, kontrol warna, noise dan ketajaman.', flush=True)
    finally:
        for connection in connections:
            connection.sock.close()
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
        logfile.close()
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    run()
