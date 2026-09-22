'use strict';
// Homografi memetakan persegi unit ke empat sudut pada foto asli.
function homography(points){
  const matrix=[];
  [[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{
    const {x,y}=points[i];matrix.push([u,v,1,0,0,0,-u*x,-v*x,x],[0,0,0,u,v,1,-u*y,-v*y,y]);
  });
  for(let col=0;col<8;col++){
    let pivot=col;for(let row=col+1;row<8;row++)if(Math.abs(matrix[row][col])>Math.abs(matrix[pivot][col]))pivot=row;
    [matrix[col],matrix[pivot]]=[matrix[pivot],matrix[col]];
    const divisor=matrix[col][col];if(Math.abs(divisor)<1e-10)throw new Error('Sudut terlalu berdekatan. Pilih empat sudut dokumen yang berbeda.');
    for(let j=col;j<9;j++)matrix[col][j]/=divisor;
    for(let row=0;row<8;row++)if(row!==col){const k=matrix[row][col];for(let j=col;j<9;j++)matrix[row][j]-=k*matrix[col][j];}
  }
  return matrix.map(row=>row[8]);
}
function validateCorners(points){
  let area=0;
  for(let i=0;i<4;i++){
    const a=points[i],b=points[(i+1)%4],c=points[(i+2)%4];
    if((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)<=1)throw new Error('Urutan sudut harus kiri atas, kanan atas, kanan bawah, kiri bawah; garis tidak boleh bersilangan.');
    area+=a.x*b.y-b.x*a.y;
  }
  if(area/2<100)throw new Error('Area dokumen terlalu kecil. Perbesar pilihan sudut.');
}
async function rectifyPhoto(img,points,mode='ktp'){
  validateCorners(points);const m=homography(points);
  const src=document.createElement('canvas');src.width=img.naturalWidth;src.height=img.naturalHeight;
  const ctx=src.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,src.width,src.height).data;
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const wide=(dist(points[0],points[1])+dist(points[3],points[2]))>=(dist(points[0],points[3])+dist(points[1],points[2]));
  const long=mode==='a4'?297:85.6,short=mode==='a4'?210:54;
  const ratio=wide?long/short:short/long;
  // Batasi ke sekitar 600 DPI; jangan membesarkan crop kecil secara artifisial.
  const width=Math.max(2,Math.min(Math.round((wide?long:short)/25.4*600),Math.round(Math.max(dist(points[0],points[1]),dist(points[3],points[2])))));
  const out=document.createElement('canvas');out.width=width;out.height=Math.round(width/ratio);
  const dest=out.getContext('2d'),data=dest.createImageData(out.width,out.height),buf=data.data;
  for(let y=0;y<out.height;y++){
    const v=y/(out.height-1);
    for(let x=0;x<out.width;x++){
      const u=x/(out.width-1),d=m[6]*u+m[7]*v+1;
      const sx=Math.max(0,Math.min(src.width-1,(m[0]*u+m[1]*v+m[2])/d)),sy=Math.max(0,Math.min(src.height-1,(m[3]*u+m[4]*v+m[5])/d));
      const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(src.width-1,x0+1),y1=Math.min(src.height-1,y0+1),fx=sx-x0,fy=sy-y0;
      const a=(y0*src.width+x0)*4,b=(y0*src.width+x1)*4,c=(y1*src.width+x0)*4,e=(y1*src.width+x1)*4,k=(y*out.width+x)*4;
      for(let ch=0;ch<4;ch++)buf[k+ch]=(pixels[a+ch]*(1-fx)+pixels[b+ch]*fx)*(1-fy)+(pixels[c+ch]*(1-fx)+pixels[e+ch]*fx)*fy;
    }
    if(y%100===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  dest.putImageData(data,0,0);const corrected=new Image();corrected.src=out.toDataURL('image/png');await corrected.decode();return corrected;
}
