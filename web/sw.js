// Copyright (C) 2026 stechdrive
// SPDX-License-Identifier: GPL-3.0-or-later
const SCOPE=self.registration.scope;
const PREFIX=`light-orbit:${SCOPE}:`;
const CACHE=PREFIX+'__BUILD_HASH__';
const ASSETS=['index.html','style.css','app.js','math.js','state.js','presets.js','lighting.js','arrow.js','renderer.js','icon.svg','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','LICENSE','THIRD_PARTY_NOTICES.txt'];
const URLS=ASSETS.map(path=>new URL(path,SCOPE).href),allowed=new Set(URLS);
const index=new URL('index.html',SCOPE).href;
let recovery=null;
const populate=cache=>cache.addAll(URLS.map(url=>new Request(url,{cache:'reload'})));
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(populate).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);url.search='';url.hash='';
  const key=url.href===SCOPE?index:url.href;
  if(!allowed.has(key))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),cached=await cache.match(key);
    if(cached)return cached;
    try{
      if(!recovery)recovery=populate(cache).finally(()=>{recovery=null;});
      await recovery;return await cache.match(key)||Response.error();
    }catch{return Response.error();}
  })());
});
