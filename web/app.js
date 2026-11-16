import { angles, direction, dragDirection, clamp, wrapAngle, basis } from './math.js';
import { LIGHTS, FRONT_CAMERA, defaultState, validateState, restoreAutosavedState, History } from './state.js';
import { OrbitRenderer, exportCanvas } from './renderer.js';
import { PRESETS, presetLights } from './presets.js';
import { arrowVisibility } from './arrow.js';

const $=id=>document.getElementById(id);
const STORAGE_KEY='light-orbit.scene.v1';
let state=defaultState(), storageAvailable=true;
try{const stored=localStorage.getItem(STORAGE_KEY);if(stored){const parsed=JSON.parse(stored);state=restoreAutosavedState(parsed);if(parsed.version!==state.version)localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}}catch{storageAvailable=false;}
const history=new History(state), renderer=new OrbitRenderer($('viewport'));
for(const group of [...new Set(PRESETS.map(p=>p.group))]){
  const optgroup=document.createElement('optgroup');optgroup.label=group;
  for(const preset of PRESETS.filter(p=>p.group===group)){const option=document.createElement('option');option.value=preset.id;option.textContent=preset.label;optgroup.append(option);}
  $('preset').append(optgroup);
}
let mode='view', pending=false, drag=null, toastTimer=null;
const native=window.chrome?.webview;
const nativeRequests=new Map();
if(native){
  native.addEventListener('message',event=>{
    const reply=event.data, request=nativeRequests.get(reply.id);
    if(!request)return;clearTimeout(request.timeout);nativeRequests.delete(reply.id);
    if(reply.ok)request.resolve(reply);else request.reject(new Error(reply.error||'処理できませんでした。'));
  });
}
function nativeAction(type,data,name){
  return new Promise((resolve,reject)=>{
    const id=crypto.randomUUID(),timeout=setTimeout(()=>{nativeRequests.delete(id);reject(new Error('操作がタイムアウトしました。'));},300000);
    nativeRequests.set(id,{resolve,reject,timeout});native.postMessage({id,type,data,name});
  });
}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3300);}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));storageAvailable=true;}catch{storageAvailable=false;}$('storage-status').textContent=storageAvailable?'この端末に自動保存':'自動保存できません・設定を書き出せます';}
function commit(){history.push(state);persist();syncHistory();}
function syncHistory(){$('undo').disabled=!history.past.length;$('redo').disabled=!history.future.length;}
function syncPreset(){
  $('preset').value=state.presetId;$('mirror').setAttribute('aria-pressed',state.mirrored);$('mirror').classList.toggle('active',state.mirrored);
  $('preset-status').textContent=state.presetId==='custom'?'手動で調整中':state.mirrored?'3灯のセット・反転':'3灯のセット';
}
function markCustom(){state.presetId='custom';state.mirrored=false;syncPreset();}
$('preset').addEventListener('change',event=>{
  const id=event.target.value;if(id==='custom'){markCustom();commit();return;}
  state.lights=presetLights(id,state.mirrored);state.presetId=id;state.selected='key';syncControls();commit();
});
$('mirror').addEventListener('click',()=>{
  for(const light of Object.values(state.lights))light.direction[0]*=-1;
  state.mirrored=!state.mirrored;syncControls();commit();
});
function requestRender(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;render();});}
function render(){
  const rect=$('viewport').getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2),size=Math.max(100,Math.round(rect.width*ratio));
  renderer.render(state,{editing:true,size,pixelRatio:ratio});
  syncOcclusion();
  const preview=exportCanvas(state,60),context=$('preview').getContext('2d');context.clearRect(0,0,60,60);context.drawImage(preview,0,0);
  $('camera-readout').textContent=`${Math.round(state.camera.azimuth)}° / ${Math.round(state.camera.elevation)}°`;
}
function syncOcclusion(){
  const visibility=arrowVisibility(state.lights[state.selected].direction,basis(state.camera));
  const label=visibility.fullyHidden?'奥側・球の裏':visibility.occluded?'奥側・一部隠れ':visibility.behind?'奥側':Math.abs(visibility.depth)<.005?'真横':'手前側';
  const badge=$('light-depth');if(badge.textContent!==label)badge.textContent=label;
  badge.dataset.side=visibility.fullyHidden?'hidden':visibility.behind?'back':'front';
  const control=$('hidden-light-control');control.hidden=!visibility.fullyHidden;
  const name=LIGHTS[state.selected].name.replace('ライト','');
  control.textContent=mode==='light'?`画面をドラッグして奥の${name}を回転`:`奥の${name}を動かす`;
}
function syncControls(){
  for(const [id,l] of Object.entries(state.lights)){
    document.querySelector(`[data-row="${id}"]`).classList.toggle('selected',state.selected===id);
    document.querySelector(`[data-light="${id}"]`).setAttribute('aria-pressed',state.selected===id);
    if(id!=='key')$(`${id}-enabled`).checked=l.enabled;
  }
  const light=state.lights[state.selected],a=angles(light.direction);
  $('selected-label').textContent=LIGHTS[state.selected].name;
  for(const id of ['azimuth','elevation']){$(id).value=Math.round(a[id]);$(`${id}-number`).value=Math.round(a[id]);}
  $('intensity').value=Math.round(light.intensity*100);$('intensity-value').textContent=`${Math.round(light.intensity*100)}%`;
  $('shading').value=state.shading;$('guides').checked=state.guides;$('export-size').value=state.size;$('background').value=state.background;$('export-lights').value=state.exportLights;
  $('preview-size').innerHTML=`${state.size} × ${state.size} <span>px</span>`;
  syncPreset();syncView();syncHistory();requestRender();
}
function syncView(){
  const c=state.camera;
  const current=Math.abs(c.azimuth)<.1&&Math.abs(c.elevation)<.1?'front':Math.abs(c.azimuth-18)<.1&&Math.abs(c.elevation-14)<.1?'angle':Math.abs(c.elevation-89.5)<.1?'top':null;
  document.querySelectorAll('[data-view]').forEach(button=>{button.classList.toggle('active',button.dataset.view===current);button.setAttribute('aria-pressed',button.dataset.view===current);});
  const label=({front:'正面',angle:'斜め前',top:'上面'})[current]||'自由視点';
  $('view-label').textContent=label;
  document.querySelector('.preview-group p').textContent=`${state.size===60?'実寸':'60px表示'}・${label}`;
}
function selectLight(id){state.selected=id;if(!state.lights[id].enabled)markCustom();state.lights[id].enabled=true;syncControls();commit();}
document.querySelectorAll('[data-light]').forEach(button=>button.addEventListener('click',()=>selectLight(button.dataset.light)));
for(const id of ['fill','rim'])$(`${id}-enabled`).addEventListener('change',event=>{
  state.lights[id].enabled=event.target.checked;if(event.target.checked)state.selected=id;else if(state.selected===id)state.selected='key';markCustom();syncControls();commit();
});
for(const id of ['azimuth','elevation']){
  function update(value){
    if(!Number.isFinite(value))return;
    const a=angles(state.lights[state.selected].direction);a[id]=clamp(value,id==='azimuth'?-180:-90,id==='azimuth'?180:90);
    state.lights[state.selected].direction=direction(a.azimuth,a.elevation);$(id).value=a[id];$(`${id}-number`).value=Math.round(a[id]);markCustom();requestRender();
  }
  $(id).addEventListener('input',event=>update(event.target.valueAsNumber));$(id).addEventListener('change',commit);
  $(`${id}-number`).addEventListener('change',event=>{update(event.target.valueAsNumber);syncControls();commit();});
}
$('intensity').addEventListener('input',event=>{state.lights[state.selected].intensity=event.target.valueAsNumber/100;$('intensity-value').textContent=`${event.target.value}%`;markCustom();requestRender();});
$('intensity').addEventListener('change',commit);
for(const [id,property] of [['shading','shading'],['guides','guides'],['export-size','size'],['background','background'],['export-lights','exportLights']])$(id).addEventListener('change',event=>{
  state[property]=id==='guides'?event.target.checked:id==='export-size'?Number(event.target.value):event.target.value;syncControls();commit();
});
function setMode(value){mode=value;for(const name of ['view','light']){$(`mode-${name}`).classList.toggle('active',mode===name);$(`mode-${name}`).setAttribute('aria-pressed',mode===name);}$('interaction-hint').innerHTML=mode==='view'?'矢印：ライトを回転 <span>／</span> 余白：視点を回転':'画面をドラッグして、選択中のライトを回転';syncOcclusion();}
$('mode-view').addEventListener('click',()=>setMode('view'));$('mode-light').addEventListener('click',()=>setMode('light'));
$('hidden-light-control').addEventListener('click',()=>{setMode('light');$('viewport').focus({preventScroll:true});});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
  state.camera=({front:{...FRONT_CAMERA},angle:{azimuth:18,elevation:14},top:{azimuth:0,elevation:89.5}})[button.dataset.view];syncControls();commit();
  if(button.dataset.view==='front')toast('カメラを正面に戻しました');
}));
function getPointer(event){const r=$('viewport').getBoundingClientRect();return {x:(event.clientX-r.left)*$('viewport').width/r.width,y:(event.clientY-r.top)*$('viewport').height/r.height};}
$('viewport').addEventListener('pointerdown',event=>{
  if(event.button!==0 || drag)return;
  const p=getPointer(event),hit=renderer.hitTest(p.x,p.y);
  if(hit)state.selected=hit;
  drag={id:event.pointerId,x:event.clientX,y:event.clientY,target:hit||(mode==='light'||event.shiftKey?state.selected:null)};
  $('viewport').setPointerCapture(event.pointerId);$('viewport').classList.add('dragging');$('viewport').focus({preventScroll:true});syncControls();event.preventDefault();
});
$('viewport').addEventListener('pointermove',event=>{
  if(!drag){const p=getPointer(event);$('viewport').classList.toggle('over-pin',!!renderer.hitTest(p.x,p.y));return;}
  if(drag.id!==event.pointerId)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y,size=$('viewport').clientWidth;
  if(drag.target){const light=state.lights[drag.target];light.direction=dragDirection(light.direction,dx,dy,state.camera,size);markCustom();syncControls();}
  else{state.camera.azimuth=wrapAngle(state.camera.azimuth-dx*180/size);state.camera.elevation=clamp(state.camera.elevation+dy*180/size,-89.5,89.5);syncView();requestRender();}
  drag.x=event.clientX;drag.y=event.clientY;
});
function endDrag(event){if(!drag||event.pointerId!==drag.id)return;drag=null;$('viewport').classList.remove('dragging');commit();}
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('viewport').addEventListener(type,endDrag);
$('viewport').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();
  const a=angles(state.lights[state.selected].direction),step=event.shiftKey?1:5;
  if(event.key==='ArrowLeft')a.azimuth-=step;if(event.key==='ArrowRight')a.azimuth+=step;if(event.key==='ArrowUp')a.elevation+=step;if(event.key==='ArrowDown')a.elevation-=step;
  state.lights[state.selected].direction=direction(wrapAngle(a.azimuth),clamp(a.elevation,-90,90));markCustom();syncControls();commit();
});
function restore(which){const restored=history[which]();if(restored){state=restored;syncControls();persist();}}
$('undo').addEventListener('click',()=>restore('undo'));$('redo').addEventListener('click',()=>restore('redo'));
document.addEventListener('keydown',event=>{
  if(/^(INPUT|TEXTAREA)$/.test(event.target.tagName))return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();restore(event.shiftKey?'redo':'undo');}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();restore('redo');}
});
$('reset').addEventListener('click',()=>{state=defaultState();syncControls();commit();toast('初期状態に戻しました（元に戻すこともできます）');});
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function pngBlob(){return new Promise((resolve,reject)=>exportCanvas(state).toBlob(blob=>blob?resolve(blob):reject(new Error('画像を生成できませんでした。')),'image/png'));}
function filename(extension){const now=new Date(),pad=n=>String(n).padStart(2,'0');return `LightOrbit_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.${extension}`;}
$('save').addEventListener('click',async()=>{
  try{if(native){const reply=await nativeAction('save-png',exportCanvas(state).toDataURL('image/png').split(',')[1],filename('png'));if(reply.cancelled)return;toast('PNGを保存しました');}else{download(await pngBlob(),filename('png'));toast(`${state.size}×${state.size}pxのPNGを書き出しました`);}}catch(error){toast(error.message);}
});
$('copy').addEventListener('click',async()=>{
  try{if(native){await nativeAction('copy-png',exportCanvas(state).toDataURL('image/png').split(',')[1]);}
    else if(navigator.clipboard?.write&&window.ClipboardItem){await navigator.clipboard.write([new ClipboardItem({'image/png':pngBlob()})]);}
    else throw new Error('画像コピーに未対応です。PNG保存をご利用ください。');
    toast(`${state.size}×${state.size}pxの画像をコピーしました`);
  }catch(error){toast(error.name==='NotAllowedError'?'画像をコピーできませんでした。PNG保存をご利用ください。':error.message);}
});
$('export-settings').addEventListener('click',async()=>{
  try{const json=JSON.stringify(state,null,2);if(native){const result=await nativeAction('save-settings',json,filename('json'));if(result.cancelled)return;}else download(new Blob([json],{type:'application/json'}),filename('json'));toast('ライトと視点の設定を書き出しました');}catch(error){toast(error.message);}
});
$('import-settings').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>100000)throw new Error('設定ファイルが大きすぎます。');const imported=validateState(JSON.parse(await file.text()));state=imported;syncControls();commit();toast('設定を読み込みました');}catch(error){toast(error instanceof SyntaxError?'JSONファイルを読み取れませんでした。':error.message);}finally{event.target.value='';}
});
$('help').addEventListener('click',()=>$('help-dialog').showModal());$('close-help').addEventListener('click',()=>$('help-dialog').close());
$('help-dialog').addEventListener('click',event=>{if(event.target===$('help-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
let installPrompt=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('install').hidden=false;});
$('install').addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();installPrompt=null;$('install').hidden=true;});
window.addEventListener('appinstalled',()=>$('install').hidden=true);
if('serviceWorker' in navigator&&!native&&!new URLSearchParams(location.search).has('dev')){navigator.serviceWorker.register('./sw.js').catch(()=>{$('storage-status').textContent='オフライン準備ができませんでした';});}
new ResizeObserver(requestRender).observe($('stage'));
syncControls();
if(!storageAvailable)$('storage-status').textContent='前回の設定を読み込めませんでした';
