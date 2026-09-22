'use strict';
// Koordinat internal memakai milimeter A4 portrait (210 × 297).
const PAGE = {w:210,h:297};
const EXPORT_DPI = 1200;
let scanMode=sessionStorage.getItem("penaprint-mode")==="a4"?"a4":"ktp", sessionModeLocked=false;
const modeCards={ktp:[],a4:[]};
function capacity(){return scanMode==='a4'?1:10;}
function boxes() {
  if(scanMode==='a4')return [{x:0,y:0,w:210,h:297}];
  return Array.from({length:10},(_,i)=>({x:12.4+(i%2)*99.6,y:7.5+Math.floor(i/2)*57,w:85.6,h:54}));
}
const cloneCard = card => ({...card,adjust:{...card.adjust}});
function initialAdjust(img){return {turn:(scanMode==='a4'?img.naturalWidth>img.naturalHeight:img.naturalWidth<img.naturalHeight)?90:0,angle:0,zoom:100,x:0,y:0};}
function geometry(card,b) {
  const a=card.adjust, img=card.img, rad=a.turn*Math.PI/180;
  const rw=Math.abs(Math.cos(rad))*img.naturalWidth+Math.abs(Math.sin(rad))*img.naturalHeight;
  const rh=Math.abs(Math.sin(rad))*img.naturalWidth+Math.abs(Math.cos(rad))*img.naturalHeight;
  const sx=(scanMode==='a4'?Math.max:Math.min)(b.w/rw,b.h/rh),sy=sx;
  return {cx:b.w*(.5+a.x/100),cy:b.h*(.5+a.y/100),sx:sx*a.zoom/100,sy:sy*a.zoom/100,angle:a.turn+a.angle};
}
const NS='http://www.w3.org/2000/svg';
function svgNode(tag,attrs={}){const el=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,value);return el;}
function toneFilter(){
  const light=Number($('brightness').value)/100*Math.pow(2,Number($('exposure').value));
  return `grayscale(${$('grayscale').checked?1:0}) brightness(${light}) contrast(${Number($('contrast').value)/100})`;
}
// Cache per gambar: salinan kartu memakai hasil sama, sumber tidak ditimpa.
const detailCache=new WeakMap(), previewDetailCache=new WeakMap();
let fullDetailPrint=false, detailTimer=null;
// Estimasi pencahayaan lokal dari persentil terang, tanpa mengubah geometri.
function normalizeDocument(data,w,h){
  const cols=16,rows=16,background=new Float32Array(cols*rows);
  for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
    const histogram=new Uint32Array(256);let count=0;
    const x0=Math.floor(gx*w/cols),x1=Math.max(x0+1,Math.floor((gx+1)*w/cols));
    const y0=Math.floor(gy*h/rows),y1=Math.max(y0+1,Math.floor((gy+1)*h/rows));
    const step=Math.max(1,Math.floor(Math.min(x1-x0,y1-y0)/24));
    for(let y=y0;y<Math.min(h,y1);y+=step)for(let x=x0;x<Math.min(w,x1);x+=step){
      const i=(y*w+x)*4;histogram[Math.round(.299*data[i]+.587*data[i+1]+.114*data[i+2])]++;count++;
    }
    let total=0,value=255;for(let v=0;v<256;v++){total+=histogram[v];if(total>=count*.85){value=v;break;}}
    background[gy*cols+gx]=Math.max(100,value);
  }
  // Haluskan peralihan antarbagian terang dan berbayang.
  const smooth=new Float32Array(background.length);
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=background[Math.max(0,Math.min(rows-1,y+dy))*cols+Math.max(0,Math.min(cols-1,x+dx))];
    smooth[y*cols+x]=sum/9;
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const gx=Math.max(0,Math.min(cols-1,(x+.5)/w*cols-.5)),gy=Math.max(0,Math.min(rows-1,(y+.5)/h*rows-.5));
    const x0=Math.floor(gx),y0=Math.floor(gy),x1=Math.min(cols-1,x0+1),y1=Math.min(rows-1,y0+1),fx=gx-x0,fy=gy-y0;
    const light=(smooth[y0*cols+x0]*(1-fx)+smooth[y0*cols+x1]*fx)*(1-fy)+(smooth[y1*cols+x0]*(1-fx)+smooth[y1*cols+x1]*fx)*fy;
    const gain=Math.min(2.2,250/light),i=(y*w+x)*4;
    for(let c=0;c<3;c++)data[i+c]=(data[i+c]*gain-128)*1.12+128;
  }
}
function photoDetail(card,preview=false){
  const auto=$('autoEnhance').checked;
  const noise=Math.max(auto ? .25 : 0,Number($('denoise').value)/100), sharp=Math.max(auto ? .2 : 0,Number($('sharpness').value)/100);
  if(!noise&&!sharp&&!auto)return {image:card.img,src:card.src};
  const cache=preview?previewDetailCache:detailCache;
  const key=`${noise}:${sharp}:${auto}`,cached=cache.get(card.img);
  if(cached?.key===key)return cached;
  const canvas=document.createElement('canvas');
  const scale=preview?Math.min(1,1000/Math.max(card.img.naturalWidth,card.img.naturalHeight)):1;
  const w=Math.max(1,Math.round(card.img.naturalWidth*scale)),h=Math.max(1,Math.round(card.img.naturalHeight*scale));
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(card.img,0,0,w,h);
  const pixels=ctx.getImageData(0,0,w,h),source=pixels.data;
  if(auto)normalizeDocument(source,w,h);
  const clean=new Uint8ClampedArray(source);
  // Rata-rata berbobot perbedaan warna menghaluskan noise, menjaga tepi teks.
  if(noise)for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;let weight=0,r=0,g=0,b=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const j=(Math.max(0,Math.min(h-1,y+dy))*w+Math.max(0,Math.min(w-1,x+dx)))*4;
      const delta=(Math.abs(source[i]-source[j])+Math.abs(source[i+1]-source[j+1])+Math.abs(source[i+2]-source[j+2]))/3;
      const t=1/(1+(delta/(8+noise*24))**4);weight+=t;r+=source[j]*t;g+=source[j+1]*t;b+=source[j+2]*t;
    }
    clean[i]=source[i]*(1-noise)+r/weight*noise;clean[i+1]=source[i+1]*(1-noise)+g/weight*noise;clean[i+2]=source[i+2]*(1-noise)+b/weight*noise;
  }
  source.set(clean);
  if(sharp)for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;
    for(let c=0;c<3;c++){
      let blur=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const j=(Math.max(0,Math.min(h-1,y+dy))*w+Math.max(0,Math.min(w-1,x+dx)))*4;
        blur+=clean[j+c]*(dx===0?2:1)*(dy===0?2:1);
      }
      const detail=clean[i+c]-blur/16;
      if(Math.abs(detail)>3)source[i+c]=clean[i+c]+detail*sharp*1.5;
    }
  }
  ctx.putImageData(pixels,0,0);
  const result={key,image:canvas,src:canvas.toDataURL('image/png')};cache.set(card.img,result);return result;
}
function cardSvg(card,b,filtered=true) {
  const svg=svgNode('svg',{viewBox:`0 0 ${b.w} ${b.h}`,preserveAspectRatio:'none'});
  svg.style.overflow='hidden';svg.append(svgNode('rect',{width:b.w,height:b.h,fill:'white'}));
  const g=geometry(card,b);
  svg.append(svgNode('image',{style:`filter:${filtered?toneFilter():'none'}`,href:filtered?photoDetail(card,!fullDetailPrint).src:card.src,x:-card.img.naturalWidth/2,y:-card.img.naturalHeight/2,width:card.img.naturalWidth,height:card.img.naturalHeight,transform:`translate(${g.cx} ${g.cy}) scale(${g.sx} ${g.sy}) rotate(${g.angle})`}));
  svg.lastChild.photoCard=card;
  return svg;
}
const $ = id => document.getElementById(id);
let cards = modeCards[scanMode];
let duplicateSource=null;
let busy = false;
function message(text) { $('status').textContent = text; }
function render() {
  $('scanMode').value=scanMode;$('scanMode').disabled=busy;
  document.querySelector('.duplicate-controls').hidden=scanMode==='a4';
  document.querySelector('.fixed-info strong').textContent=scanMode==='a4'?'210 × 297 mm':'85,6 × 54 mm';
  document.querySelector('.fixed-info span').textContent=scanMode==='a4'?'1 dokumen · 1 lembar A4':'10 kartu · 2 kolom × 5 baris';
  $('slots').replaceChildren(); $('cards').replaceChildren();
  boxes().forEach((box,i) => {
    const slot = document.createElement('div'); slot.className = cards[i] && scanMode!=='a4' ? 'slot framed' : 'slot';
    Object.assign(slot.style,{left:`${box.x/PAGE.w*100}%`,top:`${box.y/PAGE.h*100}%`,width:`${box.w/PAGE.w*100}%`,height:`${box.h/PAGE.h*100}%`});
    if (cards[i]) {
      slot.append(cardSvg(cards[i],box));
      slot.ondblclick=()=>{if(!busy)openEditor(i);};
    } else {
      const label = document.createElement('span'); label.className = 'slot-number'; label.textContent = i+1; slot.append(label);
    }
    $('slots').append(slot);
  });
  cards.forEach((card,i) => {
    const row = document.createElement('li');
    const thumb = new Image(); thumb.src = card.src; thumb.alt = '';
    const name = document.createElement('span'); name.textContent = `${i+1}. ${card.name}`; name.title = card.name;
    row.append(thumb,name);
    const addButton = (text,title,action,disabled=false) => {
      const button = document.createElement('button'); button.textContent=text; button.title=title; button.setAttribute('aria-label',title); button.disabled=disabled || busy; button.onclick=action; row.append(button);
    };
    addButton('Atur',`Atur kartu ${i+1}`,()=>openEditor(i));
    addButton('↑',`Pindah kartu ${i+1} ke atas`,()=>{[cards[i-1],cards[i]]=[cards[i],cards[i-1]];render();},i===0);
    addButton('+',`Gandakan kartu ${i+1}`,()=>{cards.splice(i+1,0,cloneCard(card));render();},cards.length>=capacity());
    addButton('×',`Hapus kartu ${i+1}`,()=>{cards.splice(i,1);render();});
    $('cards').append(row);
  });
  $('count').textContent = `${cards.length}/${capacity()}`;
  $('empty').hidden = cards.length>0;
  for (const id of ['download','print','clear']) $(id).disabled = !cards.length || busy;
  const remaining=capacity()-cards.length;
  if(!cards.includes(duplicateSource))duplicateSource=cards[cards.length-1]||null;
  $('duplicateSource').replaceChildren();
  cards.forEach((card,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`${i+1}. ${card.name}`;option.selected=card===duplicateSource;$('duplicateSource').append(option);});
  $('duplicateSource').disabled=!cards.length||busy||!remaining;
  $('duplicateCount').disabled=!cards.length||busy||!remaining;
  $('duplicateCount').max=Math.max(1,remaining);
  if(Number($('duplicateCount').value)>remaining&&remaining>0)$('duplicateCount').value=remaining;
  $('duplicateHint').textContent=remaining?`${remaining} kotak kosong. Jumlah ini ditambahkan di akhir lembar.`:'Lembar penuh. Hapus kartu untuk menambah salinan.';
  $('fill').disabled = !cards.length || !remaining || busy;
  document.querySelectorAll('.tone-control input, #resetTone').forEach(el=>el.disabled=busy);
}
function readImage(file) {
  return new Promise((resolve,reject)=>{
    const reader = new FileReader(); reader.onerror=()=>reject(new Error('Gagal membaca gambar'));
    reader.onload=()=>{const img = new Image(); img.onload=()=>resolve({src:reader.result,originalSrc:reader.result,originalImg:img,name:file.name,img,adjust:initialAdjust(img)}); img.onerror=()=>reject(new Error('Gambar tidak valid')); img.src=reader.result;};
    reader.readAsDataURL(file);
  });
}
// Foto portal diterima hanya melalui sambungan HP.
window.addEventListener('dragover',e=>e.preventDefault());
window.addEventListener('drop',e=>e.preventDefault());
const TONE_DEFAULTS={brightness:100,contrast:100,exposure:0,denoise:0,sharpness:0};
function updateTone(deferDetail=false){
  for(const id of Object.keys(TONE_DEFAULTS)){
    const input=$(id),val=Number(input.value);
    $(id+'Value').value=input.value;
    input.style.setProperty('--fill',`${(val-Number(input.min))/(Number(input.max)-Number(input.min))*100}%`);
  }
  document.querySelectorAll('#slots image,#editPreview image').forEach(el=>{el.style.filter=toneFilter();});
  clearTimeout(detailTimer);
  if(deferDetail===true)detailTimer=setTimeout(refreshDetailPreview,250);
  else refreshDetailPreview();
  $('autoEnhanceState').textContent=$('autoEnhance').checked?'Aktif':'Nonaktif';
  $('grayscaleState').textContent=$('grayscale').checked?'Ya':'Tidak';
}
function refreshDetailPreview(){
  document.querySelectorAll('#slots image,#editPreview image').forEach(el=>{if(el.photoCard){const src=photoDetail(el.photoCard,!fullDetailPrint).src;if(el.getAttribute('href')!==src)el.setAttribute('href',src);}});
}
for(const id of Object.keys(TONE_DEFAULTS)){
  const detail=id==='denoise'||id==='sharpness';
  $(id).oninput=()=>updateTone(detail);
  $(id+'Value').oninput=e=>{
    if(e.target.value===''||!Number.isFinite(e.target.valueAsNumber))return;
    if(e.target.valueAsNumber<Number($(id).min)||e.target.valueAsNumber>Number($(id).max))return;
    $(id).value=e.target.valueAsNumber;updateTone(detail);
  };
  $(id+'Value').onchange=e=>{
    const value=e.target.valueAsNumber;
    if(Number.isFinite(value))$(id).value=Math.max(Number($(id).min),Math.min(Number($(id).max),value));
    updateTone();
  };
}
function setTone(values){for(const [id,value] of Object.entries({...TONE_DEFAULTS,...values}))$(id).value=value;updateTone();}
$('autoEnhance').onchange=()=>updateTone(true);
$('grayscale').onchange=updateTone;
$('resetTone').onclick=()=>{$('autoEnhance').checked=false;$('grayscale').checked=true;setTone(TONE_DEFAULTS);};
const titles={cards:'Kartu & cetak',tone:'Tampilan foto',phone:'Hubungkan HP'};
function showPane(name){
  document.querySelectorAll('[data-pane]').forEach(el=>el.hidden=el.dataset.pane!==name);
  document.querySelectorAll('[data-nav]').forEach(el=>{if(el.dataset.nav===name)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  $('pageTitle').textContent=titles[name];
}
document.querySelectorAll('[data-nav]').forEach(button=>button.onclick=()=>showPane(button.dataset.nav));
updateTone();
$('duplicateSource').onchange=()=>{duplicateSource=cards[Number($('duplicateSource').value)]||null;};
$('fill').onclick=()=>{
  if(busy||!cards.includes(duplicateSource))return;
  const quantity=$('duplicateCount').valueAsNumber,remaining=capacity()-cards.length;
  if(!Number.isInteger(quantity)||quantity<1||quantity>remaining){message(`Masukkan jumlah salinan antara 1 dan ${remaining}.`);$('duplicateCount').focus();return;}
  for(let i=0;i<quantity;i++)cards.push(cloneCard(duplicateSource));
  render();message(`${quantity} salinan ditambahkan. Total ${cards.length} kartu dalam lembar.`);
};
$('scanMode').onchange=async()=>{
  if(busy){$('scanMode').value=scanMode;return;}
  const selected=$('scanMode').value;
  if(sessionModeLocked&&window.prepareScanMode){
    busy=true;render();
    try{await window.prepareScanMode(selected);}catch(error){message(error.message);return;}finally{busy=false;render();}
  }
  scanMode=selected;sessionStorage.setItem('penaprint-mode',scanMode);cards=modeCards[scanMode];duplicateSource=null;render();
  message(scanMode==='a4'?'Mode A4 borderless aktif. Pindai QR terbaru di Hubungkan HP, lalu foto dokumen.':'Mode KTP: maksimal 10 kartu per lembar.');
};
$('clear').onclick=()=>{cards.length=0;render();message('Semua kartu telah dikosongkan.');};
window.addEventListener('beforeprint',()=>{clearTimeout(detailTimer);fullDetailPrint=true;refreshDetailPreview();});
window.addEventListener('afterprint',()=>{fullDetailPrint=false;refreshDetailPreview();});
$('print').onclick=async()=>{
  try {
    clearTimeout(detailTimer);fullDetailPrint=true;refreshDetailPreview();
    await Promise.all(Array.from($('slots').querySelectorAll('image')).map(el=>{const img=new Image();img.src=el.getAttribute('href');return img.decode();}));
    await Promise.all(Array.from($('paper').querySelectorAll('img')).map(img=>img.decode()));
    window.print();
  } catch {
    message('Gambar belum siap dicetak. Tunggu hingga gambar tampil lalu coba kembali.');
  } finally {fullDetailPrint=false;refreshDetailPreview();}
};
$('download').onclick=async()=>{
  busy=true; render();
  try {
    const dpi=EXPORT_DPI;
    const canvas=document.createElement('canvas'); canvas.width=Math.round(PAGE.w/25.4*dpi);canvas.height=Math.round(PAGE.h/25.4*dpi);
    const ctx=canvas.getContext('2d'); ctx.scale(canvas.width/PAGE.w,canvas.height/PAGE.h);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.fillStyle='#fff';ctx.fillRect(0,0,PAGE.w,PAGE.h);

    const positions=boxes();
    cards.forEach((card,i)=>{
      const b=positions[i],g=geometry(card,b);
      ctx.save();ctx.beginPath();ctx.rect(b.x,b.y,b.w,b.h);ctx.clip();ctx.fillStyle='#fff';ctx.fillRect(b.x,b.y,b.w,b.h);
      ctx.translate(b.x+g.cx,b.y+g.cy);ctx.scale(g.sx,g.sy);ctx.rotate(g.angle*Math.PI/180);
      ctx.filter=toneFilter();
      ctx.drawImage(photoDetail(card).image,-card.img.naturalWidth/2,-card.img.naturalHeight/2);ctx.restore();
    });
    {
      ctx.strokeStyle='#555';ctx.lineWidth=.15;positions.slice(0,scanMode==='a4'?0:cards.length).forEach(b=>ctx.strokeRect(b.x,b.y,b.w,b.h));
    }
    const rawBlob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!rawBlob)throw new Error('Ekspor gambar gagal');
    const blob=await pngWithDpi(rawBlob,dpi);
    const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;link.download='idcard-a4.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    message(`PNG ${canvas.width} × ${canvas.height} piksel berhasil dibuat. Cetak dengan ukuran A4 / skala 100%.`);
  } catch(error){message(`Gagal mengunduh: ${error.message}. Silakan coba kembali.`);}
  finally{busy=false;render();}
};
render();

let editIndex=-1, draft=null, corners=[], cornerDrag=-1, correcting=false;
const adjustInputs={angle:'angle',zoom:'zoom',offsetX:'x',offsetY:'y'};
function openEditor(index){
  editIndex=index;draft=cloneCard(cards[index]);resetCorners();syncInputs();previewEdit();$('editStatus').textContent='';$('editor').showModal();
}
function resetCorners(){
  const img=draft.originalImg,w=img.naturalWidth,h=img.naturalHeight;
  corners=[{x:0,y:0},{x:w-1,y:0},{x:w-1,y:h-1},{x:0,y:h-1}];drawCorners();
}
function drawCorners(){
  const el=$('cornerEditor'),img=draft.originalImg,w=img.naturalWidth,h=img.naturalHeight;
  el.setAttribute('viewBox',`0 0 ${w} ${h}`);el.replaceChildren();
  el.append(svgNode('image',{href:draft.originalSrc,width:w,height:h}));
  el.append(svgNode('polygon',{points:corners.map(p=>`${p.x},${p.y}`).join(' '),fill:'#12786022',stroke:'#19d89f','stroke-width':Math.max(w,h)/350}));
  corners.forEach((p,i)=>{
    const point=svgNode('circle',{cx:p.x,cy:p.y,r:Math.max(w,h)/45,'data-corner':i,tabindex:0,role:'slider','aria-label':`Sudut ${['kiri atas','kanan atas','kanan bawah','kiri bawah'][i]}, gunakan tombol panah`});
    point.addEventListener('keydown',e=>{
      const move={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!move)return;e.preventDefault();
      const step=e.shiftKey?10:1;p.x=Math.max(0,Math.min(w-1,p.x+move[0]*step));p.y=Math.max(0,Math.min(h-1,p.y+move[1]*step));drawCorners();el.querySelector(`[data-corner="${i}"]`).focus();
    });
    el.append(point);
    const label=svgNode('text',{x:p.x,y:p.y,'text-anchor':'middle','dominant-baseline':'central','font-size':Math.max(w,h)/45,fill:'#127860','pointer-events':'none'});label.textContent=i+1;el.append(label);
  });
}
$('cornerEditor').addEventListener('pointerdown',e=>{
  const idx=e.target.getAttribute('data-corner');if(idx===null||correcting)return;cornerDrag=Number(idx);$('cornerEditor').setPointerCapture(e.pointerId);e.preventDefault();
});
$('cornerEditor').addEventListener('pointermove',e=>{
  if(cornerDrag<0)return;const svg=$('cornerEditor'),pt=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());
  corners[cornerDrag]={x:Math.max(0,Math.min(draft.originalImg.naturalWidth-1,pt.x)),y:Math.max(0,Math.min(draft.originalImg.naturalHeight-1,pt.y))};drawCorners();
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('cornerEditor').addEventListener(event,()=>cornerDrag=-1);
function syncInputs(){for(const [id,key] of Object.entries(adjustInputs))$(id).value=draft.adjust[key];}
function previewEdit(){
  const b=boxes()[editIndex];$('editPreview').style.aspectRatio=`${b.w}/${b.h}`;$('editPreview').replaceChildren(cardSvg(draft,b));
  const g=geometry(draft,b),dpi=25.4/Math.max(g.sx,g.sy);
  $('quality').textContent=`Gambar aktif: ${draft.img.naturalWidth} × ${draft.img.naturalHeight} px · sekitar ${Math.round(dpi)} DPI pada ukuran cetak.${dpi<250?' Detail sumber terbatas; ekspor 1200 DPI tidak menambah detail asli.':''}${draft.src!==draft.originalSrc?' Hasil koreksi telah disampel ulang; detail tetap mengikuti foto asli.':''}`;
}
for(const [id,key] of Object.entries(adjustInputs))$(id).addEventListener('input',()=>{
  const input=$(id),v=Number(input.value);if(input.value===''||!Number.isFinite(v))return;
  draft.adjust[key]=Math.min(Number(input.max),Math.max(Number(input.min),v));previewEdit();
});
$('rotate').onclick=()=>{draft.adjust.turn=(draft.adjust.turn+90)%360;previewEdit();};
$('resetAdjust').onclick=()=>{draft.adjust=initialAdjust(draft.img);syncInputs();previewEdit();};
$('original').onclick=()=>{draft.src=draft.originalSrc;draft.img=draft.originalImg;draft.adjust=initialAdjust(draft.img);resetCorners();syncInputs();previewEdit();$('editStatus').textContent='Foto asli dipulihkan.';};
$('saveEdit').onclick=()=>{cards[editIndex]=cloneCard(draft);$('editor').close();render();message('Pengaturan kartu disimpan. Gandakan kartu ini untuk memakai koreksi yang sama.');};
$('cancelEdit').onclick=()=>$('editor').close();
$('editor').addEventListener('cancel',e=>{if(correcting)e.preventDefault();});
$('rectify').onclick=async()=>{
  correcting=true;
  const controls=Array.from($('editor').querySelectorAll('button,input'));controls.forEach(el=>el.disabled=true);$('editStatus').textContent='Meluruskan foto dari empat sudut…';
  try {
    const img=await rectifyPhoto(draft.originalImg,corners.map(p=>({...p})),scanMode);draft.img=img;draft.src=img.src;draft.adjust=initialAdjust(img);syncInputs();previewEdit();$('editStatus').textContent='Foto sudah diluruskan. Periksa pratinjau lalu simpan pengaturan.';
  }catch(error){$('editStatus').textContent=error.message;}
  finally{correcting=false;controls.forEach(el=>el.disabled=false);}
};

// Canvas menulis DPI bawaan 96; simpan metadata cetak sesuai pilihan pengguna.
async function pngWithDpi(blob,dpi){
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const chunk=new Uint8Array(21),view=new DataView(chunk.buffer);
  view.setUint32(0,9);chunk.set([112,72,89,115],4);
  const ppm=Math.round(dpi/0.0254);view.setUint32(8,ppm);view.setUint32(12,ppm);chunk[16]=1;
  let crc=0xffffffff;for(const byte of chunk.subarray(4,17)){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  view.setUint32(17,(crc^0xffffffff)>>>0);
  const parts=[bytes.slice(0,33),chunk];let offset=33;
  while(offset<bytes.length){
    const length=new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0);
    const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
    if(type!=='pHYs')parts.push(bytes.slice(offset,offset+length+12));offset+=length+12;
  }
  return new Blob(parts,{type:'image/png'});
}
