import test from 'node:test';
import assert from 'node:assert/strict';
import { ARROW, EXTENT, MAX_ARROW_EXTENSION, arrowLayout, arrowMesh, arrowAppearance, arrowVisibility } from '../web/arrow.js';
import { direction, basis, project, scale, dot } from '../web/math.js';

const front = basis({ azimuth: 0, elevation: 0 });
test('foreshortened arrows lengthen both head and shaft without changing widths or light direction',()=>{
  const light=direction(20,0),before=[...light],layout=arrowLayout(light,front),sine=Math.sin(20*Math.PI/180);
  assert.ok((layout.base-layout.tip)*sine>(ARROW.base-ARROW.tip)*sine*3);
  assert.ok((layout.tail-layout.base)*sine>(ARROW.tail-ARROW.base)*sine*3);
  assert.equal(layout.tip,ARROW.tip);assert.equal(layout.headRadius,ARROW.headRadius);assert.equal(layout.shaftWidth,ARROW.shaftWidth);
  assert.deepEqual(light,before);
  const diagonal=arrowLayout(direction(90,45),front);
  assert.ok(Math.hypot(...project(scale(direction(90,45),diagonal.tail),front).slice(0,2))>2.4);
});
test('axial views stay finite and collapse continuously on both sides of the sphere',()=>{
  for(const angle of [0,1e-8,.01,.1,1,179,179.9,179.99,180]){
    const light=direction(angle,0),layout=arrowLayout(light,front);
    assert.ok(Number.isFinite(layout.base)&&Number.isFinite(layout.tail));
    assert.ok(layout.extension<=MAX_ARROW_EXTENSION);assert.ok(layout.tail<6);
  }
  const near=angle=>Math.hypot(...project(scale(direction(angle,0),arrowLayout(direction(angle,0),front).tail),front).slice(0,2));
  assert.ok(near(0)<1e-10&&near(180)<1e-10);
  assert.ok(near(.01)<near(.1)&&near(.1)<near(1));
  assert.ok(Math.abs(near(20)-near(160))<1e-10);
});
test('the entire extruded arrow stays within the square at rotated camera angles',()=>{
  for(const camera of [{azimuth:0,elevation:0},{azimuth:37,elevation:-28},{azimuth:142,elevation:76}]){
    const frame=basis(camera);
    for(let a=-180;a<=180;a+=10)for(let e=-90;e<=90;e+=10){
      const light=direction(a,e),layout=arrowLayout(light,frame),mesh=arrowMesh(light,frame,layout);
      for(const vertex of mesh.vertices){
        const point=project(vertex,frame);
        assert.ok(point.every(Number.isFinite));
        assert.ok(Math.max(Math.abs(point[0]),Math.abs(point[1]))+.04<EXTENT,`${a}/${e}`);
      }
    }
  }
});

test('rear shoulders remain exposed while the point is occluded and the shaft has length',()=>{
  for(const angle of [120,135,150,160]) {
    const light=direction(angle,0),layout=arrowLayout(light,front),radial=Math.sin(angle*Math.PI/180);
    assert.ok(layout.tip*radial<1.01);
    assert.ok(layout.base*radial>1.3);
    assert.ok((layout.tail-layout.base)*radial>.35);
  }
});

test('extrusion has real thickness, orthogonal axes, and stays beyond the sphere tangent plane',()=>{
  for(const azimuth of [-180,-135,-90,-30,0,30,90,135,180])for(const elevation of [-90,-45,0,45,90]) {
    const light=direction(azimuth,elevation),mesh=arrowMesh(light,front);
    assert.ok(Math.abs(dot(light,mesh.width))<1e-8&&Math.abs(dot(light,mesh.normal))<1e-8);
    assert.ok(Math.abs(dot(mesh.width,mesh.normal))<1e-8);
    for(let i=0;i<7;i++) {
      assert.ok(Math.abs(Math.hypot(...mesh.vertices[i].map((v,j)=>v-mesh.vertices[i+7][j]))-ARROW.thickness)<1e-8);
    }
    assert.ok(mesh.vertices.every(v=>dot(v,light)>=ARROW.tip-1e-8));
    assert.ok(mesh.faces.every(f=>Math.abs(Math.hypot(...f.normal)-1)<1e-8));
  }
});
test('only exported rear arrows lose saturation and outline contrast',()=>{
  for(const original of [[193,138,36],[75,139,186],[182,107,136]]){
    const near=arrowAppearance(original,.5),rear=arrowAppearance(original,-.5),editing=arrowAppearance(original,-.5,true);
    const spread=rgb=>Math.max(...rgb)-Math.min(...rgb),contrast=style=>Math.hypot(...style.rgb.map((v,i)=>v-style.outline[i]));
    assert.deepEqual(near.rgb,original);assert.deepEqual(editing.rgb,original);assert.equal(editing.rear,false);
    assert.equal(rear.rear,true);assert.ok(spread(rear.rgb)<spread(original)*.3);assert.ok(contrast(rear)<contrast(near));
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(original[i]>original[j])assert.ok(rear.rgb[i]>rear.rgb[j]);
  }
});

test('occlusion states follow the camera and distinguish partial from complete hiding',()=>{
  const hidden=arrowVisibility(direction(180,0),front);
  assert.equal(hidden.behind,true);assert.equal(hidden.occluded,true);assert.equal(hidden.fullyHidden,true);
  for(const angle of [120,135,160,170]){
    const partial=arrowVisibility(direction(angle,0),front);
    assert.equal(partial.behind,true);assert.equal(partial.occluded,true);assert.equal(partial.fullyHidden,false);
  }
  assert.equal(arrowVisibility(direction(175,0),front).fullyHidden,true);
  assert.equal(arrowVisibility(direction(92,0),front).occluded,false);
  const turned=arrowVisibility(direction(180,0),basis({azimuth:180,elevation:0}));
  assert.equal(turned.behind,false);assert.equal(turned.occluded,false);assert.equal(turned.fullyHidden,false);
});
