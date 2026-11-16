import { basis, project, scale, add, normalize, dot, hiddenBySphere } from './math.js';
import { LIGHTS } from './state.js';
import { prepareLights, lightResponse, AMBIENT_LEVEL } from './lighting.js';
import { EXTENT, ARROW, arrowLayout, arrowMesh, arrowAppearance, arrowVisibility } from './arrow.js';

export { EXTENT } from './arrow.js';
function insidePolygon(x,y,points) {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const [ax,ay]=points[i],[bx,by]=points[j];
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
  }
  return inside;
}
function polygonTouchesRect(points,left,top,right,bottom) {
  if(insidePolygon((left+right)/2,(top+bottom)/2,points))return true;
  return points.some((a,i)=>{
    const b=points[(i+1)%points.length];let near=0,far=1;
    for(const [axis,min,max] of [[0,left,right],[1,top,bottom]]){
      const delta=b[axis]-a[axis];
      if(Math.abs(delta)<1e-9){if(a[axis]<min||a[axis]>max)return false;continue;}
      const p=(min-a[axis])/delta,q=(max-a[axis])/delta;
      near=Math.max(near,Math.min(p,q));far=Math.min(far,Math.max(p,q));
      if(near>far)return false;
    }
    return true;
  });
}
const arrowSurfaceLight=normalize([-.4,.65,1]);
const geometryCache = new Map();
function sphereGeometry(size) {
  if(geometryCache.has(size)) return geometryCache.get(size);
  const values=[];
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const nx=(x+.5)/size*2-1, ny=1-(y+.5)/size*2, r2=nx*nx+ny*ny;
    if(r2<1) values.push((y*size+x)*4,nx,ny,Math.sqrt(1-r2));
  }
  const result=new Float32Array(values);
  if(geometryCache.size>6) geometryCache.delete(geometryCache.keys().next().value);
  geometryCache.set(size,result); return result;
}

export class OrbitRenderer {
  constructor(canvas) {
    this.canvas=canvas; this.ctx=canvas.getContext('2d');
    this.sphere=document.createElement('canvas');
    this.sphereCtx=this.sphere.getContext('2d');
    this.hitTargets=[];
  }
  render(state,{ editing=false, size=this.canvas.width, pixelRatio=1 }={}) {
    const canvas=this.canvas, ctx=this.ctx;
    if(canvas.width!==size || canvas.height!==size){ canvas.width=size; canvas.height=size; }
    ctx.clearRect(0,0,size,size);
    const dark=!editing && state.background==='dark';
    if(!editing && state.background!=='transparent'){ctx.fillStyle=dark?'#29312e':'#ffffff';ctx.fillRect(0,0,size,size);}
    const frame=basis(state.camera), factor=size/(EXTENT*2), center=size/2;
    const px=p=>[center+p[0]*factor,center-p[1]*factor];
    const strokeWidth=editing?Math.max(1,pixelRatio):Math.max(.9,size/180);
    const sphereOutlineWidth=editing?Math.max(1,pixelRatio):size/60;
    this.hitTargets=[];
    const labels=[],placedLabels=[];
    this.sphereBounds={center,radius:factor+sphereOutlineWidth};

    const polyline=(points,color,width,dashed=false)=>{
      ctx.beginPath();points.forEach((p,i)=>{const [x,y]=px(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
      ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dashed?[strokeWidth*2,strokeWidth*2]:[]);ctx.stroke();ctx.setLineDash([]);
    };
    const guides=[];
    if(editing && state.guides){
      for(const plane of ['xz','yz']){
        const radius=1.39;
        for(let i=0;i<144;i++){
          const point=t=>plane==='xz'?[radius*Math.sin(t),0,radius*Math.cos(t)]:[0,radius*Math.sin(t),radius*Math.cos(t)];
          const a=project(point(i*Math.PI/72),frame),b=project(point((i+1)*Math.PI/72),frame);
          const hidden=hiddenBySphere(scale(add(a,b),.5));
          guides.push({a,b,hidden});
        }
      }
      for(const {a,b,hidden} of guides) if(!hidden) polyline([a,b],dark?'#566358':'#9ea894',strokeWidth*.6);
    }

    const side=Math.ceil(factor*2), geometry=sphereGeometry(side);
    if(!this.imageData||this.sphere.width!==side){this.sphere.width=side;this.sphere.height=side;this.imageData=this.sphereCtx.createImageData(side,side);}
    const data=this.imageData.data;
    const lights=prepareLights(state.lights,frame);
    for(let i=0;i<geometry.length;i+=4){
      const offset=geometry[i],nx=geometry[i+1],ny=geometry[i+2],nz=geometry[i+3];
      let red=AMBIENT_LEVEL,green=AMBIENT_LEVEL,blue=AMBIENT_LEVEL;
      for(const l of lights){
        const value=lightResponse(l,nx,ny,nz,state.shading)*l.intensity*.82;
        red+=value*l.color[0];green+=value*l.color[1];blue+=value*l.color[2];
      }
      data[offset]=Math.min(247,Math.sqrt(red)*242);
      data[offset+1]=Math.min(247,Math.sqrt(green)*242);
      data[offset+2]=Math.min(247,Math.sqrt(blue)*242);
      data[offset+3]=Math.min(255,Math.max(0,nz*side*.45)*255);
    }
    this.sphereCtx.putImageData(this.imageData,0,0);
    ctx.drawImage(this.sphere,center-factor,center-factor,factor*2,factor*2);
    ctx.beginPath();ctx.arc(center,center,factor+sphereOutlineWidth*.48,0,Math.PI*2);ctx.strokeStyle='#555555';ctx.lineWidth=sphereOutlineWidth;ctx.stroke();

    if(editing && state.guides){
      for(const {a,b,hidden} of guides){
        const mid=scale(add(a,b),.5);
        if(hidden){if(editing) polyline([a,b], '#84937720',strokeWidth*.5);}
        else if(mid[2]>0) polyline([a,b],dark?'#708068':'#879777',strokeWidth*.6);
      }
    }

    const sorted=Object.entries(state.lights).filter(([key,l])=>l.enabled&&(editing||state.exportLights==='all'||key==='key')).sort(([,a],[,b])=>dot(a.direction,frame.front)-dot(b.direction,frame.front));
    for(const [key,light] of sorted){
      const dir=light.direction, layout=arrowLayout(dir,frame), appearance=arrowAppearance(LIGHTS[key].rgb,layout.depth,editing), visibility=arrowVisibility(dir,frame,layout);
      const {rgb,outline,rear}=appearance,hp=project(scale(dir,layout.tail),frame);
      const [hx,hy]=px(hp), radius=factor*ARROW.pinRadius;
      const mesh=arrowMesh(dir,frame,layout),vertices=mesh.vertices.map(v=>project(v,frame));
      const faces=mesh.faces.filter(face=>dot(face.normal,frame.front)>1e-8).map(face=>({
        ...face,points:face.indices.map(i=>vertices[i]),normal:project(face.normal,frame),
        z:face.indices.reduce((sum,i)=>sum+vertices[i][2],0)/face.indices.length,
      }));
      const nearPart=layout.depth>=0?'shaft':'head';
      faces.sort((a,b)=>(a.part===nearPart)-(b.part===nearPart)||a.z-b.z);
      this.hitTargets.push({key,x:hx,y:hy,radius:Math.max(radius*2.6,editing?17*pixelRatio:radius),depth:hp[2],hidden:hiddenBySphere(hp),fullyHidden:visibility.fullyHidden,polygons:faces.map(f=>f.points.map(px))});

      ctx.save();
      if(visibility.behind){
        ctx.beginPath();ctx.rect(0,0,size,size);ctx.moveTo(center+this.sphereBounds.radius,center);
        ctx.arc(center,center,this.sphereBounds.radius,0,Math.PI*2);ctx.clip('evenodd');
      }

      const trace=points=>{ctx.beginPath();points.forEach((p,i)=>{const[x,y]=px(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();};
      ctx.lineJoin='round';ctx.strokeStyle=`rgba(255,255,255,${appearance.halo})`;ctx.lineWidth=factor*.055;
      for(const face of faces){trace(face.points);ctx.stroke();}
      for(const face of faces){
        const shade=face.surface==='broad'?.88+.12*face.normal[2]:.56+.22*Math.max(0,dot(face.normal,arrowSurfaceLight));
        trace(face.points);ctx.fillStyle=`rgb(${rgb.map(v=>Math.round(v*shade))})`;ctx.fill();
        ctx.strokeStyle=`rgb(${face.surface==='broad'?outline:rgb.map(v=>Math.round(v*(rear?.61:.43)))})`;ctx.lineWidth=factor*.025;
        for(const [a,b] of face.edges){const p=px(vertices[a]),q=px(vertices[b]);ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke();}
      }
      if(editing && state.selected===key && !visibility.fullyHidden){ctx.beginPath();ctx.arc(hx,hy,radius+4*pixelRatio,0,Math.PI*2);ctx.strokeStyle=`rgba(${rgb},.36)`;ctx.lineWidth=pixelRatio;ctx.stroke();}
      ctx.restore();
      if(editing && state.selected===key && visibility.occluded && !visibility.fullyHidden){
        const angle=Math.atan2(-hp[1],hp[0]);
        ctx.beginPath();ctx.arc(center,center,this.sphereBounds.radius,angle-.13,angle+.13);
        ctx.strokeStyle=`rgba(${LIGHTS[key].rgb},.9)`;ctx.lineWidth=2*pixelRatio;ctx.stroke();
      }
      if(editing && !visibility.fullyHidden)labels.push(()=>{
        const distance=Math.hypot(hp[0],hp[1]), ox=distance>.05?hp[0]/distance:1,oy=distance>.05?-hp[1]/distance:0;
        ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${10*pixelRatio}px "Segoe UI",sans-serif`;ctx.fillStyle=`rgba(${rgb},.9)`;
        const label=key.toUpperCase()+(visibility.behind?'・奥':'');
        const labelWidth=ctx.measureText(label).width,margin=7*pixelRatio;
        let lx=hx+ox*(radius+11*pixelRatio+labelWidth/2),ly=hy+oy*(radius+11*pixelRatio);
        if(ly<margin||ly>size-margin){lx=hx+(hx<center?1:-1)*(radius+8*pixelRatio+labelWidth/2);ly=hy;}
        else if(lx-labelWidth/2<margin||lx+labelWidth/2>size-margin){lx=hx;ly=hy+(hy<center?1:-1)*(radius+12*pixelRatio);}
        lx=Math.max(margin+labelWidth/2,Math.min(size-margin-labelWidth/2,lx));ly=Math.max(margin,Math.min(size-margin,ly));
        const screenVertices=vertices.map(px),left=Math.min(...screenVertices.map(v=>v[0])),right=Math.max(...screenVertices.map(v=>v[0])),top=Math.min(...screenVertices.map(v=>v[1])),bottom=Math.max(...screenVertices.map(v=>v[1]));
        const labelPolygons=this.hitTargets.flatMap(target=>target.polygons);
        const touchesBody=(x,y)=>labelPolygons.some(points=>polygonTouchesRect(points,x-labelWidth/2-3*pixelRatio,y-7*pixelRatio,x+labelWidth/2+3*pixelRatio,y+7*pixelRatio))||placedLabels.some(rect=>x+labelWidth/2>rect[0]&&x-labelWidth/2<rect[2]&&y+7*pixelRatio>rect[1]&&y-7*pixelRatio<rect[3]);
        if(touchesBody(lx,ly)){
          for(const [x,y] of [[lx,top-9*pixelRatio],[lx,bottom+9*pixelRatio],[left-labelWidth/2-7*pixelRatio,hy],[right+labelWidth/2+7*pixelRatio,hy]]){
            if(x-labelWidth/2>=margin&&x+labelWidth/2<=size-margin&&y>=margin&&y<=size-margin&&!touchesBody(x,y)){lx=x;ly=y;break;}
          }
        }
        ctx.fillText(label,lx,ly);
        placedLabels.push([lx-labelWidth/2,ly-7*pixelRatio,lx+labelWidth/2,ly+7*pixelRatio]);
      });
    }
    for(const drawLabel of labels)drawLabel();
    ctx.textBaseline='alphabetic';
  }
  hitTest(x,y) {
    const sphere=this.sphereBounds;
    return this.hitTargets.filter(p=>!p.fullyHidden&&!(p.depth<0&&Math.hypot(x-sphere.center,y-sphere.center)<sphere.radius)&&
      (Math.hypot(x-p.x,y-p.y)<p.radius||p.polygons.some(points=>insidePolygon(x,y,points))))
      .sort((a,b)=>Math.hypot(x-a.x,y-a.y)-Math.hypot(x-b.x,y-b.y)||b.depth-a.depth)[0]?.key ?? null;
  }
}

export function exportCanvas(state,size=state.size) {
  const hi=document.createElement('canvas');
  new OrbitRenderer(hi).render(state,{size:size*4});
  const output=document.createElement('canvas');output.width=size;output.height=size;
  const ctx=output.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(hi,0,0,size,size);
  return output;
}
