'use strict';
// Tunggu app.js selesai agar daftar kartu dan editor siap digunakan.
window.addEventListener('DOMContentLoaded',()=>{
  const get=id=>document.getElementById(id);
  const status=text=>get('connectionStatus').textContent=text;
  const fragment=new URLSearchParams(location.hash.slice(1));
  let owner=fragment.get('owner')||sessionStorage.getItem('ktp-owner')||'';
  if(fragment.has('owner')){sessionStorage.setItem('ktp-owner',owner);history.replaceState(null,'',location.pathname+location.search);}
  let polling=false,stopped=false;
  const accepted=new Set();
  async function api(path,body){
    const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${owner}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    if(!response.ok){let error;try{error=(await response.json()).error;}catch{};throw new Error(error||'Server tidak terhubung.');}
    return response;
  }
  async function poll(){
    if(polling||stopped)return;polling=true;
    try{
      const inbox=await (await api('/api/inbox')).json();
      sessionModeLocked=!!inbox.active;get('scanMode').disabled=busy;
      if(!inbox.active){status('Belum ada sesi HP aktif. Klik Hubungkan HP.');get('closePair').hidden=true;return;}
      get('closePair').hidden=false;
      status(inbox.items.length&&cards.length>=capacity()?`${inbox.items.length} foto menunggu. Cetak lalu kosongkan lembar untuk menerima berikutnya.`:inbox.connected?'HP terhubung · menunggu foto berikutnya.':'Sesi siap · buka tautan kamera di HP.');
      if(busy||get('editor').open)return;
      for(const item of inbox.items){
        if(accepted.has(item.id)){await api('/api/ack',{id:item.id});continue;}
        if(cards.length>=capacity()||busy||get('editor').open)break;
        busy=true;render();
        try{
          const blob=await (await api(`/api/photo?id=${encodeURIComponent(item.id)}`)).blob();
          const file=new File([blob],`${scanMode==='a4'?'Dokumen':'KTP'} HP ${cards.length+1}.${item.type==='image/png'?'png':'jpg'}`,{type:item.type});
          let card;
          try{card=await readImage(file);}catch{await api('/api/ack',{id:item.id,accepted:false});message('Foto HP tidak dapat dibaca. Ambil ulang foto di HP.');continue;}
          cards.push(card);accepted.add(item.id);render();
          message(scanMode==='a4'?'Dokumen dari HP siap dicetak satu lembar A4.':`Foto dari HP masuk ke kotak ${cards.length}. Siap dicetak.`);
          await api('/api/ack',{id:item.id});
        }finally{busy=false;render();}
      }
    }catch(error){status(`${error.message} Mencoba terhubung kembali…`);}
    finally{polling=false;if(!stopped)setTimeout(poll,1800);}
  }
  window.prepareScanMode=async mode=>{
    const result=await (await api('/api/session',{})).json();
    const url=new URL(result.url);url.searchParams.set('mode',mode);
    accepted.clear();get('pairQr').replaceChildren();
    new QRCode(get('pairQr'),{text:url.href,width:200,height:200,correctLevel:QRCode.CorrectLevel.M});
    get('phoneLink').href=url.href;get('pairDetails').hidden=false;get('closePair').hidden=false;
    status('Mode berubah. Pindai QR terbaru untuk menyesuaikan bingkai HP.');
  };
  get('pairPhone').onclick=async()=>{
    if(location.protocol==='file:'||!owner){status('Jalankan python3 server.py, lalu buka tautan komputer yang ditampilkan di terminal.');return;}
    get('pairPhone').disabled=true;sessionModeLocked=true;get('scanMode').disabled=true;
    try{
      const result=await (await api('/api/session',{})).json();
      const phoneUrl=new URL(result.url);phoneUrl.searchParams.set('mode',scanMode);result.url=phoneUrl.href;
      accepted.clear();get('pairQr').replaceChildren();
      new QRCode(get('pairQr'),{text:result.url,width:200,height:200,correctLevel:QRCode.CorrectLevel.M});
      get('phoneLink').href=result.url;get('phoneLink').textContent='Buka kamera HP ↗';
      get('pairDetails').hidden=false;get('closePair').hidden=false;
      status('Pindai QR dari HP. Jika ada peringatan HTTPS lokal, ikuti panduan sertifikat di README.');
    }catch(error){status(error.message);}
    finally{get('pairPhone').disabled=false;}
  };
  get('closePair').onclick=async()=>{
    if(!confirm('Putuskan HP dan hapus foto yang masih menunggu di antrean? Kartu yang sudah tampil tetap ada.'))return;
    try{await api('/api/close',{});get('pairDetails').hidden=true;get('closePair').hidden=true;sessionModeLocked=false;render();status('HP diputuskan.');}catch(error){status(error.message);}
  };
  if(location.protocol!=='file:'&&owner)poll();
  window.addEventListener('pagehide',()=>stopped=true);
  window.addEventListener('pageshow',()=>{if(stopped&&owner){stopped=false;poll();}});
});
