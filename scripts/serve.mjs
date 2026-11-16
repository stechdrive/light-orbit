// Copyright (C) 2026 stechdrive
// SPDX-License-Identifier: GPL-3.0-or-later
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const args=process.argv.slice(2),index=args.indexOf('--dir'),root=resolve(index>=0?args[index+1]:'web');
const port=Number(process.env.PORT||54821),prefix='/light-orbit/';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/'){res.writeHead(302,{Location:prefix+(index<0?'?dev=1':'')});res.end();return;}
    if(!url.pathname.startsWith(prefix)){res.writeHead(404);res.end('Not found');return;}
    const pathname=decodeURIComponent('/'+url.pathname.slice(prefix.length)),path=resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
    if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    if(!(await stat(path)).isFile())throw new Error();
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(await readFile(path));
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Light Orbit: http://127.0.0.1:${port}${prefix}${index<0?'?dev=1':''}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
