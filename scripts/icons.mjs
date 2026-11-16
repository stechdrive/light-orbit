import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function chunk(type,data){const tag=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([tag,data])));return Buffer.concat([length,tag,data,crc]);}
function segmentDistance(x,y,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-ax-t*dx,y-ay-t*dy);}
export function iconPng(size){
  const rows=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const px=(x+.5)/size*64,py=(y+.5)/size*64;let rgb=[225,234,191];
    const rx=(px-32)*.883-(py-35)*.469,ry=(px-32)*.469+(py-35)*.883;
    if(Math.abs(Math.hypot(rx/24,ry/12)-1)<.055)rgb=[142,154,105];
    const sx=(px-31)/14,sy=(py-35)/14,r=sx*sx+sy*sy;
    if(r<1){const z=Math.sqrt(1-r),lit=Math.max(0,-sx*.47-sy*.65+z*.59),v=Math.sqrt(.13+.8*lit);rgb=[Math.round(242*v),Math.round(246*v),Math.round(225*v)];}
    if(segmentDistance(px,py,47,14,40,26)<1.5||segmentDistance(px,py,37,21,40,26)<1.5||segmentDistance(px,py,40,26,46,25)<1.5||Math.hypot(px-48,py-12)<3.5)rgb=[180,128,40];
    const i=y*(size*4+1)+1+x*4;rows[i]=rgb[0];rows[i+1]=rgb[1];rows[i+2]=rgb[2];rows[i+3]=255;
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
export async function generateIcons(root){await mkdir(`${root}/icons`,{recursive:true});for(const size of [192,512])await writeFile(`${root}/icons/icon-${size}.png`,iconPng(size));}
export async function generateIco(path){const png=iconPng(256),header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);await writeFile(path,Buffer.concat([header,png]));}
