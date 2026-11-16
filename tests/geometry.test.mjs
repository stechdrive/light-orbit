// Copyright (C) 2026 stechdrive
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { direction, angles, basis, project, dot, dragDirection, hiddenBySphere } from '../web/math.js';
import { defaultState, validateState, restoreAutosavedState, History } from '../web/state.js';
import { PRESETS, presetLights } from '../web/presets.js';
import { prepareLights } from '../web/lighting.js';
const near=(a,b,epsilon=1e-10)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
test('light angle conventions and round trips cover all hemispheres',()=>{
  for(const a of [-175,-90,-40,0,90,175])for(const e of [-89,-45,0,38,89]){const d=direction(a,e),round=angles(d);near(Math.hypot(...d),1);near(round.azimuth,a);near(round.elevation,e);}
  assert.deepEqual(direction(0,0),[0,0,1]);near(direction(90,0)[0],1);near(direction(0,90)[1],1);
});
test('orbit camera keeps the world origin centered and preserves light positions',()=>{
  const state=defaultState(),before=JSON.stringify(state.lights);
  for(const azimuth of [-180,-90,0,18,90,179])for(const elevation of [-89.5,0,14,89.5]){
    const f=basis({azimuth,elevation});near(dot(f.right,f.up),0);near(dot(f.up,f.front),0);near(dot(f.right,f.front),0);
    project([0,0,0],f).forEach(value=>near(value,0));near(Math.hypot(...project(state.lights.key.direction,f)),1);
  }
  assert.equal(JSON.stringify(state.lights),before);
});
test('dragging a light can cross the back hemisphere without changing camera or radius',()=>{
  const camera={azimuth:0,elevation:0};let d=direction(0,0);
  for(let i=0;i<40;i++)d=dragDirection(d,10,0,camera,400);
  near(Math.hypot(...d),1);assert.ok(d[0]<0);assert.deepEqual(camera,{azimuth:0,elevation:0});
  d=direction(0,0);for(let i=0;i<25;i++)d=dragDirection(d,10,0,camera,400);assert.ok(d[2]<-.99);
});
test('sphere occlusion distinguishes front, back, and silhouette pins',()=>{
  assert.equal(hiddenBySphere([0,0,1.67]),false);assert.equal(hiddenBySphere([0,0,-1.67]),true);assert.equal(hiddenBySphere([1.3,0,-1]),false);
});
test('settings import rejects invalid geometry and keeps the primary light on',()=>{
  const original=defaultState(),roundTrip=validateState(JSON.parse(JSON.stringify(original)));
  for(const key of ['key','fill','rim']){roundTrip.lights[key].direction.forEach((v,i)=>near(v,original.lights[key].direction[i]));assert.equal(roundTrip.lights[key].enabled,original.lights[key].enabled);}
  assert.deepEqual(roundTrip.camera,original.camera);assert.equal(roundTrip.size,original.size);
  for(const invalid of [null,{}, {...original,version:4}, {...original,camera:{azimuth:NaN,elevation:0}}])assert.throws(()=>validateState(invalid));
  const invalid=defaultState();invalid.lights.key.direction=[0,0,0];assert.throws(()=>validateState(invalid));
  const edited=defaultState();edited.lights.key.enabled=false;edited.lights.rim.intensity=200;edited.camera.elevation=400;
  const result=validateState(edited);assert.equal(result.lights.key.enabled,true);assert.equal(result.lights.rim.intensity,1.5);assert.equal(result.camera.elevation,89.5);
});
test('history restores the entire scene, supports redo and discards a branched future',()=>{
  const initial=defaultState(),h=new History(initial),changed=defaultState();changed.lights.fill.enabled=false;h.push(changed);
  assert.deepEqual(h.undo(),initial);assert.deepEqual(h.redo(),changed);h.undo();changed.camera.azimuth=70;h.push(changed);assert.equal(h.redo(),null);assert.deepEqual(h.undo(),initial);
});
test('all 17 direction presets provide three lights and mirror every direction exactly',()=>{
  assert.equal(PRESETS.length,17);assert.equal(new Set(PRESETS.map(p=>p.id)).size,17);
  for(const preset of PRESETS){
    const left=presetLights(preset.id),right=presetLights(preset.id,true);
    assert.ok(left.fill.intensity<=left.key.intensity*.5);assert.ok(left.rim.direction[2]<0);
    const expected=direction(preset.azimuth,preset.elevation);
    left.key.direction.forEach((v,i)=>near(v,expected[i]));
    for(const key of ['key','fill','rim']){assert.equal(left[key].enabled,true);near(Math.hypot(...left[key].direction),1);near(right[key].direction[0],-left[key].direction[0]);near(right[key].direction[1],left[key].direction[1]);near(right[key].direction[2],left[key].direction[2]);assert.equal(right[key].intensity,left[key].intensity);}
  }
});
test('diffused fill preserves total intensity and remains symmetric when mirrored',()=>{
  const lights=presetLights('front-diagonal-upper'),frame=basis({azimuth:0,elevation:0});
  const samples=prepareLights(lights,frame),fill=samples.filter(s=>s.role==='fill');
  near(fill.reduce((total,s)=>total+s.intensity,0),lights.fill.intensity);assert.ok(fill.length>1);
  samples.forEach(sample=>near(Math.hypot(...sample.dir),1));
  const mirror=prepareLights(presetLights('front-diagonal-upper',true),frame);
  for(const normal of [direction(-60,20),direction(0,0),direction(45,-30)]){
    const energy=(list,n)=>list.reduce((v,s)=>v+Math.max(0,dot(n,s.dir))*s.intensity,0);
    near(energy(samples,normal),energy(mirror,[-normal[0],normal[1],normal[2]]));
  }
});
test('legacy settings keep the key and camera while enabling auxiliary lights and key-only export',()=>{
  const old=defaultState();old.version=1;delete old.exportLights;delete old.presetId;delete old.mirrored;
  old.lights.key.direction=direction(160,20);old.camera={azimuth:50,elevation:-10};old.lights.fill.enabled=false;old.lights.rim.enabled=false;
  const migrated=validateState(old);assert.equal(migrated.version,3);assert.equal(migrated.exportLights,'key');assert.equal(migrated.presetId,'custom');assert.deepEqual(migrated.camera,old.camera);
  migrated.lights.key.direction.forEach((v,i)=>near(v,old.lights.key.direction[i]));assert.ok(migrated.lights.fill.enabled&&migrated.lights.rim.enabled);
  const saved=defaultState();saved.lights.fill.enabled=false;saved.exportLights='all';const loaded=validateState(saved);assert.equal(loaded.lights.fill.enabled,false);assert.equal(loaded.exportLights,'all');
});

test('startup uses the front view and only the old autosaved default is migrated',()=>{
  const initial=defaultState();assert.deepEqual(initial.camera,{azimuth:0,elevation:0});
  const frame=basis(initial.camera);
  for(const v of [[1,0,0],[0,1,0],[0,0,1]])project(v,frame).forEach((value,i)=>near(value,v[i]));
  for(const version of [1,2]){
    const previous={...defaultState(),version,camera:{azimuth:18,elevation:14}};
    const restored=restoreAutosavedState(previous);
    assert.deepEqual(restored.camera,initial.camera);
    assert.deepEqual(restored.lights,validateState(previous).lights);
    assert.deepEqual(previous.camera,{azimuth:18,elevation:14});
    assert.deepEqual(validateState(previous).camera,previous.camera);
    previous.camera={azimuth:-35,elevation:22};
    assert.deepEqual(restoreAutosavedState(previous).camera,previous.camera);
  }
  const intentional={...defaultState(),camera:{azimuth:18,elevation:14}};
  assert.deepEqual(restoreAutosavedState(intentional).camera,intentional.camera);
});
