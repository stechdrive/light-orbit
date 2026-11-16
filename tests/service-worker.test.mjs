// Copyright (C) 2026 stechdrive
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../web/sw.js',import.meta.url),'utf8');
const scope='https://example.org/light-orbit/';
function browser(){
  const stores=new Map(),requests=[];
  let offline=false;
  const caches={
    keys:async()=>[...stores.keys()],delete:async key=>stores.delete(key),
    open:async key=>{
      if(!stores.has(key))stores.set(key,new Map());
      const entries=stores.get(key);
      return {
        match:async url=>entries.get(url)?.clone(),
        addAll:async list=>{
          const downloaded=await Promise.all(list.map(async request=>{
            requests.push(request);
            if(offline)throw new Error('Offline');
            return [request.url,new Response(request.url)];
          }));
          for(const [url,response] of downloaded)entries.set(url,response);
        },
      };
    },
  };
  function worker(version='one',workerScope=scope){
    const events=new Map(),calls={skip:0,claim:0};
    vm.runInNewContext(source.replace('__BUILD_HASH__',version),{
      caches,URL,Request,Response,
      self:{registration:{scope:workerScope},addEventListener:(name,fn)=>events.set(name,fn),skipWaiting:async()=>calls.skip++,clients:{claim:async()=>calls.claim++}},
    });
    return {
      calls,
      async dispatch(name){let work;events.get(name)({waitUntil:promise=>{work=promise;}});await work;},
      fetch(path,method='GET'){let response;events.get('fetch')({request:new Request(new URL(path,workerScope),{method}),respondWith:promise=>{response=promise;}});return response;},
    };
  }
  return {worker,stores,requests,setOffline:value=>{offline=value;}};
}

test('preloaded app works offline and query variants do not grow the cache',async()=>{
  const b=browser(),w=b.worker();await w.dispatch('install');await w.dispatch('activate');
  assert.equal(w.calls.skip,1);assert.equal(w.calls.claim,1);
  const initial=b.requests.length;assert.equal(initial,15);
  assert.ok(b.requests.every(request=>request.cache==='reload'&&request.url.startsWith(scope)));
  b.setOffline(true);
  assert.equal(await(await w.fetch('./?preset=side')).text(),scope+'index.html');
  for(let i=0;i<100;i++)assert.equal(await(await w.fetch('app.js?v='+i)).text(),scope+'app.js');
  for(const request of b.requests)assert.equal((await w.fetch(request.url)).status,200);
  assert.equal(b.requests.length,initial);assert.equal([...b.stores.values()][0].size,initial);
});
test('unrelated paths, origins and writes bypass the app cache',async()=>{
  const b=browser(),w=b.worker();await w.dispatch('install');
  for(const path of ['/another-app/app.js','/light-orbit-extra/app.js','https://elsewhere.example/app.js','unknown.json'])assert.equal(w.fetch(path),undefined);
  assert.equal(w.fetch('app.js','POST'),undefined);
  assert.equal(b.requests.length,15);
});
test('activation replaces only this app scope after the full new install',async()=>{
  const b=browser(),old=b.worker(),other=b.worker('one','https://example.org/another-app/');
  await old.dispatch('install');await other.dispatch('install');
  const next=b.worker('two');await next.dispatch('install');assert.equal(b.stores.size,3);
  await next.dispatch('activate');assert.equal(b.stores.size,2);
  assert.ok([...b.stores.keys()].some(key=>key.includes('another-app/')));
  assert.ok([...b.stores.keys()].some(key=>key.endsWith(':two')));
  b.setOffline(true);assert.equal((await next.fetch('./')).status,200);
});
test('failed installation leaves the working version intact',async()=>{
  const b=browser(),old=b.worker();await old.dispatch('install');
  b.setOffline(true);const next=b.worker('two');await assert.rejects(next.dispatch('install'));
  assert.equal(next.calls.skip,0);assert.equal((await old.fetch('./')).status,200);
});
test('evicted cache recovers as one bounded bundle; offline misses fail cleanly',async()=>{
  const b=browser(),w=b.worker();await w.dispatch('install');b.stores.clear();
  const responses=await Promise.all([w.fetch('./'),w.fetch('app.js')]);
  assert.ok(responses.every(response=>response.status===200));assert.equal(b.requests.length,30);
  assert.equal([...b.stores.values()][0].size,15);
  b.stores.clear();b.setOffline(true);assert.equal((await w.fetch('app.js')).type,'error');
});
