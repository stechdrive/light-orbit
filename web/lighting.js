// Copyright (C) 2026 stechdrive
// SPDX-License-Identifier: GPL-3.0-or-later
import { add, cross, normalize, project, scale } from './math.js';

export const FILL_SPREAD_DEGREES = 35;
export const AMBIENT_LEVEL = .025;
const smoothstep = (low, high, value) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};
const tint = rgb => {
  const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  return Object.freeze(rgb.map(value => value / luminance));
};
export const LIGHT_TINTS = Object.freeze({
  key: Object.freeze([1, 1, 1]),
  fill: tint([.70, .88, 1.12]),
  rim: tint([1.12, .82, 1.00]),
});
export function prepareLights(lights, frame) {
  const samples=[];
  for(const [role, light] of Object.entries(lights)) {
    if(!light.enabled)continue;
    const push=(dir,weight)=>{
      const viewDirection=project(dir,frame),rear=role==='key'?Math.max(0,-viewDirection[2]):0;
      samples.push({role,dir:viewDirection,intensity:light.intensity*weight,color:LIGHT_TINTS[role],
        rimStrength:.95*smoothstep(0,.65,rear),rimWrap:.23*smoothstep(.8,1,rear)});
    };
    if(role!=='fill'){push(light.direction,1);continue;}
    push(light.direction,.25);
    const axis=normalize(cross(light.direction,Math.abs(light.direction[1])>.9?[1,0,0]:[0,1,0]));
    const other=cross(light.direction,axis),angle=FILL_SPREAD_DEGREES*Math.PI/180;
    for(let i=0;i<6;i++) {
      const around=add(scale(axis,Math.cos(i*Math.PI/3)),scale(other,Math.sin(i*Math.PI/3)));
      push(add(scale(light.direction,Math.cos(angle)),scale(around,Math.sin(angle))),.125);
    }
  }
  return samples;
}

export function lightResponse(light,nx,ny,nz,shading='smooth') {
  let diffuse=Math.max(0,nx*light.dir[0]+ny*light.dir[1]+nz*light.dir[2]);
  if(shading==='cel'&&light.role!=='fill')diffuse=diffuse>.22?.88:0;
  if(!light.rimStrength)return diffuse;
  const edge=shading==='cel'?1-smoothstep(.42,.48,nz):1-smoothstep(.26,.64,nz);
  const facing=smoothstep(-.12,.22,nx*light.dir[0]+ny*light.dir[1]+light.rimWrap);
  return Math.max(diffuse,light.rimStrength*edge*facing);
}
