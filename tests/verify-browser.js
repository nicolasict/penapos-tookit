(async()=>{
 const checks=[];
 function check(ok,msg){if(!ok)throw new Error(msg);checks.push(msg);}
 try{
 const p=[{x:20,y:10},{x:380,y:30},{x:350,y:240},{x:40,y:220}],m=homography(p);
 [[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{const d=m[6]*u+m[7]*v+1;check(Math.hypot((m[0]*u+m[1]*v+m[2])/d-p[i].x,(m[3]*u+m[4]*v+m[5])/d-p[i].y)<1e-7,`Homografi sudut ${i+1}`);});
 let rejected=false;try{validateCorners([p[0],p[2],p[1],p[3]]);}catch{rejected=true;}check(rejected,'Sudut bersilangan ditolak');
 const source=document.createElement('canvas');source.width=400;source.height=250;const ctx=source.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,400,250);ctx.fillStyle='#0000ff';ctx.fillRect(200,0,200,250);
 const img=new Image();img.src=source.toDataURL();await img.decode();const corrected=await rectifyPhoto(img,p);
 check(corrected.naturalWidth>300&&corrected.naturalHeight>190,'Resolusi crop dipertahankan');
 const sample=document.createElement('canvas');sample.width=corrected.naturalWidth;sample.height=corrected.naturalHeight;const sc=sample.getContext('2d');sc.drawImage(corrected,0,0);check(sc.getImageData(10,10,1,1).data[0]===255&&sc.getImageData(sample.width-10,10,1,1).data[2]===255,'Koreksi menjaga warna dan orientasi');
 const docPixels=new Uint8ClampedArray(160*64*4);
 for(let y=0;y<64;y++)for(let x=0;x<160;x++){const i=(y*160+x)*4,v=140+x/160*90;docPixels[i]=docPixels[i+1]=docPixels[i+2]=y===32?25:v;docPixels[i+3]=255;}
 normalizeDocument(docPixels,160,64);
 check(docPixels[(10*160+10)*4]>220,'Mode dokumen mencerahkan latar berbayang');
 check(Math.abs(docPixels[(10*160+10)*4]-docPixels[(10*160+150)*4])<30,'Mode dokumen meratakan pencahayaan');
 check(docPixels[(32*160+80)*4]<60,'Mode dokumen mempertahankan teks gelap');
 $('autoEnhance').checked=true;updateTone();check($('autoEnhanceState').textContent==='Aktif','Status perjelas otomatis');$('resetTone').click();check(!$('autoEnhance').checked,'Reset menonaktifkan otomatis');
 const noisy=document.createElement('canvas');noisy.width=9;noisy.height=9;const nc=noisy.getContext('2d');
 for(let y=0;y<9;y++)for(let x=0;x<9;x++){const v=120+((x+y)%2)*16;nc.fillStyle=`rgb(${v},${v},${v})`;nc.fillRect(x,y,1,1);}
 const ni=new Image();ni.src=noisy.toDataURL();await ni.decode();const testCard={img:ni,src:ni.src};
 $('denoise').value=100;const cleaned=photoDetail(testCard);const cp=cleaned.image.getContext('2d').getImageData(4,4,2,1).data;
 check(Math.abs(cp[0]-cp[4])<16,'Pengurangan noise menurunkan variasi bintik');
 check(photoDetail(testCard)===cleaned,'Hasil detail dipakai ulang dari cache');
 const large=document.createElement('canvas');large.width=1600;large.height=100;const li=new Image();li.src=large.toDataURL();await li.decode();const lc={img:li,src:li.src};
 check(photoDetail(lc,true).image.width===1000,'Pratinjau detail dibatasi 1000 piksel');
 check(photoDetail(lc).image.width===1600,'Pemrosesan cetak mempertahankan resolusi sumber');
 $('denoise').value=0;$('sharpness').value=100;const sharpened=photoDetail(testCard).image.getContext('2d').getImageData(4,4,2,1).data;
 check(Math.abs(sharpened[0]-sharpened[4])>16,'Ketajaman meningkatkan kontras detail');
 $('sharpness').value=0;check(photoDetail(testCard).image===ni&&testCard.src===ni.src,'Reset detail mengembalikan sumber asli');
 $('scanMode').value='a4';$('scanMode').dispatchEvent(new Event('change'));
 const cover=geometry({img,adjust:initialAdjust(img)},boxes()[0]);check(Math.max(img.naturalWidth,img.naturalHeight)*cover.sx>=297-1e-6&&Math.min(img.naturalWidth,img.naturalHeight)*cover.sy>=210-1e-6,'A4 cover tanpa margin');
 check(capacity()===1&&boxes().length===1&&boxes()[0].w===210&&boxes()[0].h===297,'Mode dokumen memenuhi satu lembar A4');
 const a4crop=await rectifyPhoto(img,p,'a4');check(Math.abs(a4crop.naturalWidth/a4crop.naturalHeight-297/210)<.02,'Koreksi perspektif A4 mempertahankan rasio dokumen');
 cards.push({src:img.src,img,originalSrc:img.src,originalImg:img,name:'Dokumen',adjust:initialAdjust(img)});render();
 check(!$('slots').querySelector('.framed')&&document.querySelector('.duplicate-controls').hidden,'A4 tanpa border dan kontrol duplikasi');
 $('scanMode').value='ktp';$('scanMode').dispatchEvent(new Event('change'));check(cards.length===0&&modeCards.a4.length===1,'Foto disimpan terpisah saat mode diganti');
 cards.push({src:img.src,originalSrc:img.src,img,originalImg:img,name:'Kartu uji',adjust:initialAdjust(img)});render();openEditor(0);check($('editor').open,'Editor dapat dibuka');draft.adjust.zoom=125;$('saveEdit').click();
 $('duplicateCount').value=2;$('fill').click();check(cards.length===3,'Gandakan jumlah dinamis: dua tambahan');
 cards[1].name='Kartu pilihan';cards[1].adjust.zoom=110;render();$('duplicateSource').value=1;$('duplicateSource').dispatchEvent(new Event('change'));$('duplicateCount').value=1;$('fill').click();check(cards.length===4&&cards[3].name==='Kartu pilihan'&&cards[3].adjust.zoom===110,'Gandakan kartu yang dipilih');
 for(const invalid of ['',0,-1,1.5,7]){$('duplicateCount').value=invalid;$('fill').click();check(cards.length===4,'Jumlah tidak valid ditolak: '+invalid);}
 $('duplicateSource').value=0;$('duplicateSource').dispatchEvent(new Event('change'));$('duplicateCount').value=6;$('fill').click();
 check(cards.length===10&&$('slots').querySelectorAll('svg').length===10,'Sepuluh kartu tampil');
 cards[0].adjust.zoom=150;check(cards[4].adjust.zoom===125,'Pengaturan duplikat independen');
 check(boxes().every(b=>b.x>=0&&b.y>=0&&b.x+b.w<=210&&b.y+b.h<=297),'Semua kotak di dalam A4');
 check(!document.querySelector('input[type=file],#layout,#dpi,#fit,#guides'), 'Portal tanpa unggah dan pengaturan cetak');check(boxes().every(b=>b.w===85.6&&b.h===54)&&EXPORT_DPI===1200,'Ukuran kartu dan 1200 DPI terkunci');
 const png=await new Promise(resolve=>source.toBlob(resolve));const tagged=new Uint8Array(await (await pngWithDpi(png,1200)).arrayBuffer());check(new DataView(tagged.buffer).getUint32(41)===47244,'Metadata PNG 1200 DPI');
 check(new Set(boxes().map(b=>b.x)).size===2&&new Set(boxes().map(b=>b.y)).size===5,'Susunan portrait 2 kolom 5 baris');
 $('grayscale').checked=true;$('brightness').value=100;updateTone();
 check(getComputedStyle($('slots').querySelector('image')).filter.includes('grayscale(1)'), 'Filter grayscale pada pratinjau cetak');
 const originalSource=cards[0].src;
 const old=HTMLAnchorElement.prototype.click;let downloadUrl;HTMLAnchorElement.prototype.click=function(){downloadUrl=this.href;checks.push('Unduhan dipicu');};
 let firstGray;
 async function samplePixel(url,x,y){const pic=new Image();pic.src=url;await pic.decode();const c=document.createElement('canvas');c.width=c.height=1;const context=c.getContext('2d');context.drawImage(pic,x,y,1,1,0,0,1,1);return context.getImageData(0,0,1,1).data;}

 for(const light of [100,150]){
 const dpi=1200;$('brightness').value=light;updateTone();
 await $('download').onclick();check($('status').textContent.includes('9921 × 14031'),'Ekspor portrait 1200 DPI');
 const b=boxes()[0],sx=Math.round((b.x+b.w*.25)/210*Math.round(210/25.4*Number(dpi))),sy=Math.round((b.y+b.h*.5)/297*Math.round(297/25.4*Number(dpi)));
 const pixel=await samplePixel(downloadUrl,sx,sy);
 check(Math.abs(pixel[0]-pixel[1])<=1&&Math.abs(pixel[1]-pixel[2])<=1&&pixel[0]>15&&pixel[0]<200,`Piksel PNG grayscale ${dpi} DPI`);
 if(light===100)firstGray=pixel[0];else check(Math.abs(pixel[0]-firstGray*1.5)<3,'Kecerahan PNG sesuai 150%');
 const svg=$('slots').querySelector('svg').cloneNode(true);svg.setAttribute('width','856');svg.setAttribute('height','540');
 const preview=await samplePixel('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg)),214,270);
 check(Math.abs(preview[0]-pixel[0])<3&&Math.abs(preview[1]-pixel[1])<3&&Math.abs(preview[2]-pixel[2])<3,'Warna pratinjau SVG sama dengan PNG');

 }
 HTMLAnchorElement.prototype.click=old;check(cards[0].src===originalSource,'Filter tidak mengubah foto sumber');$('resetTone').click();check(toneFilter()==='grayscale(1) brightness(1) contrast(1)','Reset warna dan kecerahan');
 showPane('tone');check(!document.querySelector('#toneSample,#toneBefore,#toneAfter,[data-preset],#grayscaleValue')&&document.querySelector('[data-pane="cards"]').hidden,'Preset dan perbandingan dihapus');check($('grayscale').checked&&$('grayscaleState').textContent==='Ya','Grayscale bawaan aktif 100%');$('grayscale').checked=false;$('grayscale').dispatchEvent(new Event('change'));check(toneFilter().startsWith('grayscale(0)')&&$('grayscaleState').textContent==='Tidak','Grayscale Tidak mempertahankan warna');$('grayscale').checked=true;$('grayscale').dispatchEvent(new Event('change'));check(toneFilter().startsWith('grayscale(1)'),'Grayscale Ya selalu 100%');
 $('brightnessValue').value=175;$('brightnessValue').dispatchEvent(new Event('input'));check($('brightness').value==='175','Nilai angka tersambung ke slider');
 $('exposure').value=1;updateTone();check(toneFilter().includes('brightness(3.5)'),'Exposure +1 EV menggandakan pencahayaan');
 $('contrast').value=150;updateTone();check(toneFilter().includes('contrast(1.5)'),'Kontrol kontras');

 $('resetTone').click();

 const result=document.createElement('pre');result.id='test-results';result.hidden=true;result.textContent=JSON.stringify({ok:true,checks});document.body.append(result);
 }catch(error){const result=document.createElement('pre');result.id='test-results';result.hidden=true;result.textContent=JSON.stringify({ok:false,error:error.stack,checks});document.body.append(result);}
})();
