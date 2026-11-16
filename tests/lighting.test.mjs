// Copyright (C) 2026 stechdrive
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { basis, direction, dot } from '../web/math.js';
import { PRESETS, presetLights } from '../web/presets.js';
import { prepareLights, lightResponse } from '../web/lighting.js';

const front=basis({azimuth:0,elevation:0});
const keyAt=(azimuth,elevation=0,frame=front)=>prepareLights({key:{enabled:true,intensity:1,direction:direction(azimuth,elevation)}},frame)[0];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const edgeAt=(angle,z=.25)=>{const r=Math.sqrt(1-z*z);return [r*Math.cos(angle),r*Math.sin(angle),z];};

test('front keys and auxiliary lights retain their previous shading',()=>{
  for(const azimuth of [-180,-135,-90,-45,0,45,90,135,180]){
    const samples=prepareLights(presetLights('front-diagonal-upper'),front);
    samples.forEach(light=>light.dir=direction(azimuth,20));
    const frontKey=keyAt(Math.max(-90,Math.min(90,azimuth)),20);
    for(const light of [frontKey,...samples.filter(l=>l.role!=='key')])for(const mode of ['smooth','cel']){
      for(const normal of [[0,0,1],edgeAt(0),edgeAt(Math.PI/2),edgeAt(Math.PI)]){
        let expected=Math.max(0,dot(normal,light.dir));
        if(mode==='cel'&&light.role!=='fill')expected=expected>.22?.88:0;
        near(lightResponse(light,...normal,mode),expected);
      }
    }
  }
});

test('direct backlight illuminates the perimeter while leaving the face dark',()=>{
  for(const shading of ['smooth','cel']){
    const light=keyAt(180);
    assert.equal(lightResponse(light,0,0,1,shading),0);
    for(let i=0;i<36;i++){
      const value=lightResponse(light,...edgeAt(i*Math.PI/18),shading);
      assert.ok(value>.6&&value<=1);
      near(value,lightResponse(light,...edgeAt(0),shading));
    }
  }
  const off={key:{enabled:false,intensity:1,direction:direction(180,0)}};
  assert.equal(prepareLights(off,front).length,0);
  off.key.enabled=true;off.key.intensity=0;
  const zero=prepareLights(off,front)[0];
  assert.equal(lightResponse(zero,...edgeAt(0))*zero.intensity,0);
});

test('all oblique rear presets put the bright edge on the source side and mirror it',()=>{
  for(const preset of PRESETS.filter(p=>p.id.startsWith('back'))){
    const original=prepareLights(presetLights(preset.id),front)[0];
    const mirrored=prepareLights(presetLights(preset.id,true),front)[0];
    for(const mode of ['smooth','cel']){
      assert.equal(lightResponse(original,0,0,1,mode),0);
      for(let i=0;i<36;i++){
        const n=edgeAt(i*Math.PI/18),value=lightResponse(original,...n,mode);
        near(value,lightResponse(mirrored,-n[0],n[1],n[2],mode));
      }
      if(Math.hypot(...original.dir.slice(0,2))<.01)continue;
      const angle=Math.atan2(original.dir[1],original.dir[0]);
      assert.ok(lightResponse(original,...edgeAt(angle),mode)>lightResponse(original,...edgeAt(angle+Math.PI),mode)+.4,preset.id);
    }
  }
});

test('backlight follows the view and changes continuously through side and rear axes',()=>{
  const turned=keyAt(180,0,basis({azimuth:180,elevation:0}));
  near(lightResponse(turned,0,0,1),1);
  assert.equal(turned.rimStrength,0);
  for(let normalAngle=0;normalAngle<Math.PI*2;normalAngle+=Math.PI/8){
    const normal=edgeAt(normalAngle);
    let previous=lightResponse(keyAt(89),...normal);
    for(let angle=89.25;angle<=271;angle+=.25){
      const current=lightResponse(keyAt(angle),...normal);
      assert.ok(Number.isFinite(current)&&current>=0&&current<=1);
      assert.ok(Math.abs(current-previous)<.03,`jump at ${angle}`);
      previous=current;
    }
  }
});
