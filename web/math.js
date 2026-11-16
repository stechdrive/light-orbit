export const PI = Math.PI;
export const radians = degrees => degrees * PI / 180;
export const degrees = radians => radians * 180 / PI;
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
export const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const scale = (a, n) => a.map(v => v*n);
export const add = (a, b) => a.map((v, i) => v+b[i]);
export function normalize(v) { const length = Math.hypot(...v); return length > 1e-12 ? scale(v, 1/length) : [0, 0, 1]; }
export function direction(azimuth, elevation) {
  const a = radians(azimuth), e = radians(elevation);
  return [Math.sin(a)*Math.cos(e), Math.sin(e), Math.cos(a)*Math.cos(e)];
}
export function angles(v) {
  const n = normalize(v);
  return { azimuth: degrees(Math.atan2(n[0], n[2])), elevation: degrees(Math.asin(clamp(n[1], -1, 1))) };
}
export function basis(camera) {
  const a = radians(camera.azimuth), e = radians(camera.elevation);
  return { right: [Math.cos(a), 0, -Math.sin(a)], up: [-Math.sin(a)*Math.sin(e), Math.cos(e), -Math.cos(a)*Math.sin(e)], front: direction(camera.azimuth, camera.elevation) };
}
export function project(v, frame) { return [dot(v, frame.right), dot(v, frame.up), dot(v, frame.front)]; }
export function rotate(v, axis, angle) {
  const c = Math.cos(angle), s = Math.sin(angle), t = dot(axis, v)*(1-c), k = cross(axis, v);
  return normalize(v.map((x, i) => x*c + k[i]*s + axis[i]*t));
}
export function dragDirection(v, dx, dy, camera, viewportSize) {
  const frame = basis(camera), speed = 5 / Math.max(viewportSize, 1);
  return rotate(rotate(v, frame.up, dx*speed), frame.right, dy*speed);
}
export const wrapAngle = angle => ((angle + 180) % 360 + 360) % 360 - 180;
export function hiddenBySphere(p) { return p[0]*p[0]+p[1]*p[1] < 1 && p[2] < Math.sqrt(Math.max(0, 1-p[0]*p[0]-p[1]*p[1])) - 0.003; }
