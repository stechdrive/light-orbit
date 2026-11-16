// Copyright (C) 2026 stechdrive
// SPDX-License-Identifier: GPL-3.0-or-later
import { clamp, normalize, wrapAngle } from './math.js';
import { PRESETS, DEFAULT_PRESET, presetLights } from './presets.js';

export const LIGHTS = {
  key: { name: 'キーライト', color: '#c18a24', rgb: [193, 138, 36] },
  fill: { name: 'フィルライト', color: '#4b8bba', rgb: [75, 139, 186] },
  rim: { name: 'リムライト', color: '#b66b88', rgb: [182, 107, 136] },
};
export const FRONT_CAMERA = Object.freeze({ azimuth: 0, elevation: 0 });
export function defaultState() {
  return { version: 3, selected: 'key', camera: { ...FRONT_CAMERA },
    lights: presetLights(DEFAULT_PRESET), presetId: DEFAULT_PRESET, mirrored: false,
    shading: 'smooth', guides: true, size: 60, background: 'transparent', exportLights: 'key' };
}
const finite = value => typeof value === 'number' && Number.isFinite(value);
export function validateState(value) {
  if (!value || typeof value !== 'object' || ![1,2,3].includes(value.version) || !value.lights || !value.camera) throw new Error('Light Orbitの設定ファイルではありません。');
  const result = defaultState();
  const legacy = value.version === 1;
  if (!finite(value.camera.azimuth) || !finite(value.camera.elevation)) throw new Error('視点の値が正しくありません。');
  result.camera = { azimuth: wrapAngle(value.camera.azimuth), elevation: clamp(value.camera.elevation, -89.5, 89.5) };
  for (const key of Object.keys(LIGHTS)) {
    const light = value.lights[key];
    if (!light || !Array.isArray(light.direction) || light.direction.length !== 3 || !light.direction.every(finite) || Math.hypot(...light.direction) < 1e-9 || !finite(light.intensity) || typeof light.enabled !== 'boolean') throw new Error('ライトの値が正しくありません。');
    const enableDefaultFill = legacy && key !== 'key' && !light.enabled;
    result.lights[key] = enableDefaultFill ? result.lights[key] : { enabled: key === 'key' || light.enabled, direction: normalize(light.direction), intensity: clamp(light.intensity, 0, 1.5) };
  }
  result.selected = Object.hasOwn(LIGHTS, value.selected) ? value.selected : 'key';
  if (!result.lights[result.selected].enabled) result.selected = 'key';
  result.shading = value.shading === 'cel' ? 'cel' : 'smooth';
  result.guides = typeof value.guides === 'boolean' ? value.guides : true;
  result.size = [60,120,240,512].includes(value.size) ? value.size : 60;
  result.background = ['transparent','white','dark'].includes(value.background) ? value.background : 'transparent';
  result.presetId = !legacy && PRESETS.some(p => p.id === value.presetId) ? value.presetId : 'custom';
  result.mirrored = !legacy && value.mirrored === true;
  result.exportLights = value.exportLights === 'all' ? 'all' : 'key';
  return result;
}

export function restoreAutosavedState(value) {
  const result = validateState(value);
  if (value.version < 3 && result.camera.azimuth === 18 && result.camera.elevation === 14) {
    result.camera = { ...FRONT_CAMERA };
  }
  return result;
}

export class History {
  constructor(initial) { this.past=[]; this.future=[]; this.current=JSON.stringify(initial); }
  push(state) { const next=JSON.stringify(state); if (next===this.current) return; this.past.push(this.current); if(this.past.length>80) this.past.shift(); this.current=next; this.future=[]; }
  undo() { if(!this.past.length) return null; this.future.push(this.current); this.current=this.past.pop(); return JSON.parse(this.current); }
  redo() { if(!this.future.length) return null; this.past.push(this.current); this.current=this.future.pop(); return JSON.parse(this.current); }
}
