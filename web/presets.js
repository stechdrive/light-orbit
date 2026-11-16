import { direction } from './math.js';

const bearings = [
  { id: 'front', label: '正面', azimuth: 0 },
  { id: 'front-diagonal', label: '斜め前', azimuth: -45 },
  { id: 'side', label: '真横', azimuth: -90 },
  { id: 'back-diagonal', label: '斜め後ろ', azimuth: -135 },
  { id: 'back', label: '真後ろ', azimuth: -180 },
];
const heights = [
  { id: 'upper', label: '上', group: '上から（仰角 +40°）', elevation: 40 },
  { id: 'level', label: '水平', group: '水平（仰角 0°）', elevation: 0 },
  { id: 'lower', label: '下', group: '下から（仰角 −35°）', elevation: -35 },
];
export const DEFAULT_PRESET = 'front-diagonal-upper';
export const PRESETS = heights.flatMap(height => bearings.map(bearing => ({
  id: `${bearing.id}-${height.id}`, label: `${bearing.label}・${height.label}`,
  group: height.group, azimuth: bearing.azimuth, elevation: height.elevation,
}))).concat([
  { id: 'top', label: '真上', group: '垂直', azimuth: 0, elevation: 90 },
  { id: 'bottom', label: '真下', group: '垂直', azimuth: 0, elevation: -90 },
]);

export function presetLights(id, mirrored = false) {
  const preset = PRESETS.find(p => p.id === id);
  if (!preset) throw new Error('プリセットが見つかりません。');
  const rear = Math.max(0, -Math.cos(preset.azimuth * Math.PI / 180));
  const side = Math.abs(Math.sin(preset.azimuth * Math.PI / 180));
  const vertical = Math.abs(preset.elevation) === 90;
  const below = preset.elevation < 0;
  const lights = {
    key: { enabled: true, direction: direction(preset.azimuth, preset.elevation), intensity: 1 },
    fill: {
      enabled: true,
      direction: direction(45 - rear * 25, below ? 22 : 10),
      intensity: Math.round((.25 + rear * .15 + side * .05 + (vertical ? .05 : 0)) * 100) / 100,
    },
    rim: {
      enabled: true,
      direction: direction(155, below ? 20 : 25),
      intensity: rear > .2 ? .30 : below ? .40 : .55,
    },
  };
  if (mirrored) for (const light of Object.values(lights)) light.direction[0] *= -1;
  return lights;
}
