import { project, add, scale, cross, normalize } from './math.js';

export const EXTENT = 1.98;
export const ARROW = Object.freeze({ tip: 1.01, base: 1.40, tail: 1.82, headRadius: .30, shaftWidth: .14, thickness: .18, pinRadius: .075 });
export const MAX_ARROW_EXTENSION = 6;
const ROLL = 25 * Math.PI / 180;

export function arrowLayout(direction, frame) {
  const projected = project(direction, frame);
  const largestComponent = Math.max(Math.abs(projected[0]), Math.abs(projected[1]));
  const extension = largestComponent < 1e-8 ? MAX_ARROW_EXTENSION :
    Math.max(1, Math.min(MAX_ARROW_EXTENSION, ((EXTENT - .21) / largestComponent - ARROW.tip) / (ARROW.tail - ARROW.tip)));
  const rear = Math.max(0, Math.min(1, -projected[2] / .9));
  const headFraction = (ARROW.base - ARROW.tip) / (ARROW.tail - ARROW.tip) + .20 * rear * rear * (3 - 2 * rear);
  return { ...ARROW, base: ARROW.tip + (ARROW.tail - ARROW.tip) * extension * headFraction,
    tail: ARROW.tip + (ARROW.tail - ARROW.tip) * extension, extension, depth: projected[2] };
}

export function arrowMesh(direction, frame, layout = arrowLayout(direction, frame)) {
  const tangent = cross(frame.front, direction);
  const flatWidth = Math.hypot(...tangent) > 1e-8 ? normalize(tangent) : frame.up;
  const flatNormal = normalize(cross(direction, flatWidth));
  const width = add(scale(flatWidth, Math.cos(ROLL)), scale(flatNormal, Math.sin(ROLL)));
  const normal = add(scale(flatNormal, Math.cos(ROLL)), scale(flatWidth, -Math.sin(ROLL)));
  const { tip, base, tail, headRadius, shaftWidth, thickness } = layout;
  const profile = [[tip,0],[base,-headRadius],[base,-shaftWidth/2],[tail,-shaftWidth/2],
    [tail,shaftWidth/2],[base,shaftWidth/2],[base,headRadius]];
  const vertices = [-1,1].flatMap(side => profile.map(([u,w]) =>
    add(scale(direction,u),add(scale(width,w),scale(normal,side*thickness/2)))));
  const faces = [];
  for(const side of [-1,1]) {
    const offset=side===1?7:0, n=scale(normal,side);
    faces.push({part:'head',surface:'broad',indices:[0,1,6].map(i=>i+offset),normal:n,
      edges:[[0,1],[1,2],[5,6],[6,0]].map(pair=>pair.map(i=>i+offset))});
    faces.push({part:'shaft',surface:'broad',indices:[2,3,4,5].map(i=>i+offset),normal:n,
      edges:[[2,3],[3,4],[4,5]].map(pair=>pair.map(i=>i+offset))});
  }
  for(let i=0;i<profile.length;i++) {
    const j=(i+1)%profile.length,du=profile[j][0]-profile[i][0],dw=profile[j][1]-profile[i][1];
    const indices=[i,j,j+7,i+7];
    faces.push({part:i>=2&&i<=4?'shaft':'head',surface:'edge',indices,
      normal:normalize(add(scale(direction,dw),scale(width,-du))),
      edges:indices.map((index,k)=>[index,indices[(k+1)%4]])});
  }
  return {vertices,faces,width,normal};
}

export function arrowVisibility(direction, frame, layout = arrowLayout(direction, frame)) {
  const projected = project(direction, frame), radius = Math.hypot(projected[0], projected[1]);
  const behind = projected[2] < -1e-9;
  const vertices = arrowMesh(direction,frame,layout).vertices.map(v=>project(v,frame));
  const outerRadius = Math.max(...vertices.map(v=>Math.hypot(v[0],v[1]))) + .04;
  return { behind, occluded: behind && radius * layout.tip < 1,
    fullyHidden: behind && outerRadius < 1, depth: projected[2] };
}

export function arrowAppearance(original, depth, editing = false) {
  const rear = !editing && depth < -1e-9;
  const gray = original[0] * .2126 + original[1] * .7152 + original[2] * .0722;
  const rgb = rear ? original.map(channel => Math.round(gray + (channel - gray) * .24)) : [...original];
  return { rear, rgb, outline: rgb.map(channel => Math.round(channel * (rear ? .80 : .56))), halo: rear ? .38 : .85 };
}
