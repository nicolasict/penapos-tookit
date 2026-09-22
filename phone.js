'use strict';
const $=id=>document.getElementById(id);
const scanMode=new URLSearchParams(location.search).get('mode')==='a4'?'a4':'ktp';
const fragment=new URLSearchParams(location.hash.slice(1));
const token=fragment.get('token')||sessionStorage.getItem('ktp-phone')||'';
if(fragment.has('token')){sessionStorage.setItem('ktp-phone',token);history.replaceState(null,'',location.pathname+location.search);}
let stream=null,original=null,points=[],drag=-1,sending=false,pending=null,receiptId='',connected=false,capturing=false,openingCamera=false;
const NS='http://www.w3.org/2000/svg';
function node(tag,attrs){const el=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;}
function paintFeedback(){return new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));}
function encodePhoto(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>{
  if(!blob){reject(new Error('Gagal memproses foto. Coba lagi.'));return;}
  const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Gagal membaca foto.'));reader.readAsDataURL(blob);
},'image/png'));}
function status(text){$('status').textContent=text;}
function screen(name){
  document.body.dataset.screen=name;
  $('capturePanel').hidden=name!=='capture';$('review').hidden=name!=='review';$('sent').hidden=name!=='sent';
  document.querySelectorAll('[data-step]').forEach(el=>{if(el.dataset.step===name)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
  window.scrollTo({top:0,behavior:'instant'});
}
function cameraButtons(active){$('startCamera').hidden=active;$('shutter').hidden=!active;$('cameraBadge').hidden=!active;}

function uploadId(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');}
async function request(path,options={}){
  const response=await fetch(path,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers},signal:AbortSignal.timeout(45000)});
  if(!response.ok){let message;try{message=(await response.json()).error;}catch{};throw new Error(message||'Koneksi terputus. Foto masih tersedia; coba kirim kembali.');}
  return response;
}
async function heartbeat(){
  try{
    if(!token)throw new Error('Pindai QR dari komputer untuk menghubungkan HP.');
    const state=await(await request('/api/status')).json();connected=true;$('connection').textContent='Komputer terhubung';$('connection').classList.add('online');
    if(receiptId){
      const receipt=await(await request(`/api/receipt?id=${receiptId}`)).json();
      $('receipt').textContent=receipt.state==='received'?'Sudah masuk ke lembar A4 di komputer.':receipt.state==='rejected'?'Komputer tidak bisa membaca foto ini. Silakan foto ulang.':receipt.state==='unknown'?'Sesi sudah berubah; periksa lembar di komputer.':'Menunggu komputer menerima foto. Jika lembar penuh, cetak dan kosongkan lembar terlebih dahulu.';
    }
    if(!original&&!receiptId&&!stream&&!sending)status(state.queued>=10?'Antrean penuh. Cetak dan kosongkan lembar di komputer terlebih dahulu.':`Terhubung. Aktifkan kamera dan paskan ${scanMode==='a4'?'dokumen A4':'KTP'} ke bingkai.`);
  }catch(error){connected=false;$('connection').textContent='Terputus';$('connection').classList.remove('online');if(!sending)status(error.message);}
  finally{setTimeout(heartbeat,5000);}
}
// Bingkai pada area kamera terlihat dipetakan kembali ke piksel foto asli.
function frameRect(w,h){
  const stage=$('cameraStage'),sw=stage.clientWidth||w,sh=stage.clientHeight||h;
  const portrait=window.innerHeight>=window.innerWidth,ratio=scanMode==='a4'?(portrait?210/297:297/210):(portrait?54/85.6:85.6/54);
  const scale=Math.max(sw/w,sh/h);
  const width=Math.min(sw*.90,sh*.86*ratio)/scale,height=width/ratio;
  return{x:(w-width)/2,y:(h-height)/2,w:width,h:height};
}
function positionFrame(){
  const video=$('video');$('frameInstruction').textContent=scanMode==='a4'?'Paskan seluruh dokumen A4 ke bingkai.':innerHeight>=innerWidth?'Posisikan kartu tegak, sejajar dengan HP.':'Posisikan kartu mendatar, sejajar dengan HP.';if(!video.videoWidth)return;
  const b=frameRect(video.videoWidth,video.videoHeight);
  const stage=$('cameraStage'),scale=Math.max(stage.clientWidth/video.videoWidth,stage.clientHeight/video.videoHeight);
  const left=(stage.clientWidth-video.videoWidth*scale)/2+b.x*scale;
  const top=(stage.clientHeight-video.videoHeight*scale)/2+b.y*scale;
  Object.assign($('frame').style,{left:`${left}px`,top:`${top}px`,width:`${b.w*scale}px`,height:`${b.h*scale}px`,display:'block'});
}
function stopCamera(){if(stream)stream.getTracks().forEach(track=>track.stop());stream=null;$('shutter').disabled=true;cameraButtons(false);}
async function startCamera(){
  if(sending||capturing||openingCamera)return;
  openingCamera=true;
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Kamera dengan bingkai memerlukan HTTPS yang dipercaya HP. Ikuti panduan sertifikat di komputer, atau gunakan kamera bawaan di bawah.');
    screen('capture');$('startCamera').disabled=true;stopCamera();status('Membuka kamera…');
    stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:3840},height:{ideal:2160}}});
    const video=$('video');video.srcObject=stream;await video.play();video.classList.add('ready');$('cameraPlaceholder').style.display='none';$('shutter').disabled=false;
    cameraButtons(true);positionFrame();
    const b=frameRect(video.videoWidth,video.videoHeight),dpi=b.w/(scanMode==='a4'?(b.w>b.h?297:210):(b.w>b.h?85.6:54))*25.4;
    $('resolution').textContent=`Kamera ${video.videoWidth} × ${video.videoHeight} px · area bingkai sekitar ${Math.round(dpi)} DPI pada ukuran cetak.${dpi<250?' Untuk detail lebih tinggi, coba kamera bawaan.':''}`;
    status('Paskan seluruh tepi KTP dengan bingkai, tahan HP agar tidak goyang, lalu ambil foto.');
  }catch(error){stopCamera();status(error.name==='NotAllowedError'?'Izin kamera belum diberikan. Izinkan kamera di pengaturan situs HP, lalu coba lagi.':error.message);}
  finally{openingCamera=false;$('startCamera').disabled=false;}
}
$('startCamera').onclick=startCamera;
$('video').addEventListener('resize',positionFrame);
new ResizeObserver(()=>{positionFrame();if(original&&document.body.dataset.screen==='review')drawPoints();}).observe($('cameraStage'));
window.addEventListener('resize',()=>{positionFrame();if(original&&document.body.dataset.screen==='review')drawPoints();});
function drawPoints(){
  const svg=$('corners'),w=original.naturalWidth,h=original.naturalHeight;
  const pad=Math.max(w,h)*.065;svg.setAttribute('viewBox',`${-pad} ${-pad} ${w+2*pad} ${h+2*pad}`);svg.replaceChildren(node('image',{href:original.src,width:w,height:h}));
  svg.append(node('polygon',{points:points.map(p=>`${p.x},${p.y}`).join(' '),fill:'#0067c022',stroke:'#75caff','stroke-width':Math.max(w,h)/250}));
  const unit=Math.max((w+2*pad)/Math.max(svg.clientWidth,100),(h+2*pad)/Math.max(svg.clientHeight,100));
  points.forEach((p,i)=>{
    const circle=node('circle',{cx:p.x,cy:p.y,r:24*unit,fill:'transparent',stroke:'none','data-index':i,tabindex:0,role:'slider','aria-label':`Sudut ${i+1}; geser atau gunakan tombol panah`});
    circle.addEventListener('keydown',e=>{
      const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta||sending)return;e.preventDefault();
      const step=e.shiftKey?10:1;p.x=Math.max(0,Math.min(w-1,p.x+delta[0]*step));p.y=Math.max(0,Math.min(h-1,p.y+delta[1]*step));pending=null;drawPoints();svg.querySelector(`[data-index="${i}"]`).focus();
    });svg.append(circle);
    svg.append(node('circle',{cx:p.x,cy:p.y,r:13*unit,fill:'#fff',stroke:'#0067c0','stroke-width':2*unit,'pointer-events':'none'}));
    const label=node('text',{x:p.x,y:p.y,'text-anchor':'middle','dominant-baseline':'central','font-size':12*unit,fill:'#127860','pointer-events':'none'});label.textContent=i+1;svg.append(label);
  });
}
$('corners').addEventListener('pointerdown',e=>{const idx=e.target.getAttribute('data-index');if(idx===null||sending)return;drag=Number(idx);$('corners').setPointerCapture(e.pointerId);e.preventDefault();});
$('corners').addEventListener('pointermove',e=>{
  if(drag<0||sending)return;const pos=new DOMPoint(e.clientX,e.clientY).matrixTransform($('corners').getScreenCTM().inverse());
  points[drag]={x:Math.max(0,Math.min(original.naturalWidth-1,pos.x)),y:Math.max(0,Math.min(original.naturalHeight-1,pos.y))};pending=null;drawPoints();magnify(points[drag]);
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('corners').addEventListener(event,()=>{drag=-1;$('loupe').hidden=true;});
function magnify(p){
  const canvas=$('loupe'),ctx=canvas.getContext('2d'),size=Math.max(original.naturalWidth,original.naturalHeight)/7;
  canvas.hidden=false;ctx.fillStyle='#e6e6e6';ctx.fillRect(0,0,180,180);ctx.drawImage(original,p.x-size/2,p.y-size/2,size,size,0,0,180,180);
  ctx.strokeStyle='#75caff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(75,90);ctx.lineTo(105,90);ctx.moveTo(90,75);ctx.lineTo(90,105);ctx.stroke();
}

async function loadPhoto(src,bounds){
  const img=new Image();img.src=src;await img.decode();
  if(img.naturalWidth*img.naturalHeight>40000000)throw new Error('Foto terlalu besar. Pilih resolusi kamera paling tinggi 40 megapiksel.');
  original=img;pending=null;receiptId='';
  const b=bounds||{x:img.naturalWidth*.05,y:img.naturalHeight*.05,w:img.naturalWidth*.9,h:img.naturalHeight*.9};
  points=[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h}];
  screen('review');drawPoints();stopCamera();
  status('Periksa tepi dokumen. Geser empat titik bila perlu, lalu kirim ke komputer.');
}
$('shutter').onclick=async()=>{
  if(sending||capturing||!stream)return;
  capturing=true;
  const button=$('shutter'),label=button.innerHTML;
  const controls=[$('nativeCamera'),$('autoSend')];const disabled=controls.map(el=>el.disabled);
  controls.forEach(el=>el.disabled=true);button.disabled=true;button.textContent='Mengambil foto…';button.setAttribute('aria-busy','true');
  status('Mengambil foto… Tunggu sebentar.');
  try{
    await paintFeedback();
    const video=$('video');if(video.readyState<2||!video.videoWidth)throw new Error('Kamera belum siap. Tunggu gambar kamera tampil.');
    const bounds=frameRect(video.videoWidth,video.videoHeight);
    const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);
    await loadPhoto(await encodePhoto(canvas),bounds);
    if($('autoSend').checked)await sendPhoto();
  }catch(error){status(error.message);}
  finally{capturing=false;button.innerHTML=label;button.removeAttribute('aria-busy');button.disabled=!stream;controls.forEach((el,i)=>el.disabled=disabled[i]);}
};
$('nativeCamera').onchange=async e=>{
  const file=e.target.files[0];if(!file||sending||capturing||openingCamera)return;
  if(file.size>20*1024*1024){status('Foto maksimal 20 MB. Pilih resolusi lebih kecil.');e.target.value='';return;}
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();img.src=url;await img.decode();
    if(img.naturalWidth*img.naturalHeight>40000000)throw new Error('Foto maksimal 40 megapiksel.');
    const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.getContext('2d').drawImage(img,0,0);
    await loadPhoto(await encodePhoto(canvas));
  }catch(error){status(`Foto tidak dapat dibuka. Gunakan JPEG/PNG. ${error.message}`);}
  finally{URL.revokeObjectURL(url);e.target.value='';}
};
async function sendPhoto(){
  if(!original||sending||receiptId)return;
  sending=true;$('send').textContent='Memproses foto…';$('send').setAttribute('aria-busy','true');
  const controls=Array.from(document.querySelectorAll('button,input')),disabled=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);
  try{
    await paintFeedback();
    if(!pending){
      status('Meluruskan dokumen… Tidak perlu menekan kirim lagi.');
      const corrected=await rectifyPhoto(original,points.map(p=>({...p})),scanMode);
      const bytes=Uint8Array.from(atob(corrected.src.split(',')[1]),c=>c.charCodeAt(0));
      const blob=new Blob([bytes],{type:'image/png'});pending={id:uploadId(),blob,src:corrected.src};
    }
    $('send').textContent='Mengirim ke komputer…';status('Mengirim foto ke komputer…');
    await paintFeedback();
    await request('/api/upload',{method:'POST',headers:{'Content-Type':'image/png','X-Upload-ID':pending.id},body:pending.blob});
    receiptId=pending.id;$('result').src=pending.src;screen('sent');
    $('receipt').textContent='Foto diterima server komputer. Menunggu masuk ke lembar A4…';status('Foto terkirim. Anda dapat memotret kartu berikutnya.');

  }catch(error){status(`${error.message} Foto tetap tersedia di HP. Tekan kirim untuk mencoba lagi.`);screen('review');drawPoints();}
  finally{sending=false;$('send').textContent='Kirim ke komputer →';$('send').removeAttribute('aria-busy');controls.forEach((el,i)=>el.disabled=disabled[i]);$('shutter').disabled=!stream;}
}
$('send').onclick=sendPhoto;
function resetPhoto(){original=null;pending=null;receiptId='';screen('capture');startCamera();}
$('retake').onclick=resetPhoto;$('next').onclick=resetPhoto;
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();else if(document.body.dataset.screen==='capture'&&!stream)status('Kamera dijeda. Tekan Buka kamera untuk melanjutkan.');});
window.addEventListener('pagehide',stopCamera);
heartbeat();

if(scanMode==='a4'){document.querySelector('.capture-heading h1').textContent='Paskan dokumen A4 ke bingkai';$('frameInstruction').textContent='Foto seluruh halaman, lalu rapikan empat sudut.';}

// Jalankan ketukan langsung dari pointerup: beberapa browser HP menunda klik
// atau membatalkannya saat bilah browser berubah ukuran. Tetap dukung keyboard.
function bindMobileTap(button,action){
  let touch=null,lastTouch=-Infinity;
  button.onclick=null;
  button.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'||!event.isPrimary||button.disabled)return;
    touch={id:event.pointerId,x:event.clientX,y:event.clientY};
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointermove',event=>{
    if(touch&&event.pointerId===touch.id&&Math.hypot(event.clientX-touch.x,event.clientY-touch.y)>12)touch=null;
  });
  button.addEventListener('pointercancel',()=>{touch=null;});
  button.addEventListener('lostpointercapture',()=>{touch=null;});
  button.addEventListener('pointerup',event=>{
    if(!touch||event.pointerId!==touch.id)return;
    touch=null;
    const bounds=button.getBoundingClientRect();
    if(button.disabled||event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)return;
    event.preventDefault();lastTouch=performance.now();action(event);
  });
  button.addEventListener('click',event=>{
    if(button.disabled)return;
    if(event.detail!==0&&performance.now()-lastTouch<800){event.preventDefault();return;}
    action(event);
  });
}
for(const id of ['startCamera','shutter','send','retake','next']){
  const button=$(id),action=button.onclick;
  bindMobileTap(button,action);
}
