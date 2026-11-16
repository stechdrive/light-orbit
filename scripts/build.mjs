// Copyright (C) 2026 stechdrive
// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdir, readFile, writeFile, copyFile, rm, realpath, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateIcons, generateIco } from './icons.mjs';
const root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
process.chdir(root);
const output=resolve(root,'dist');
if(dirname(output)!==root)throw new Error('Invalid output directory');
try{if((await lstat(output)).isSymbolicLink()||await realpath(output)!==output)throw new Error('Output directory must not be linked');}
catch(error){if(error.code!=='ENOENT')throw error;}
await rm(output,{recursive:true,force:true});
await mkdir('dist/icons',{recursive:true});await mkdir('desktop',{recursive:true});
await generateIcons('web');await generateIco('desktop/app.ico');
const files=['index.html','style.css','app.js','math.js','state.js','presets.js','lighting.js','arrow.js','renderer.js','icon.svg','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];
const hash=createHash('sha256');
for(const file of files){const bytes=await readFile(`web/${file}`);hash.update(bytes);await copyFile(`web/${file}`,`dist/${file}`);}
for(const file of ['LICENSE','THIRD_PARTY_NOTICES.txt']){const bytes=await readFile(file);hash.update(bytes);await copyFile(file,`dist/${file}`);}
const worker=await readFile('web/sw.js','utf8');hash.update(worker);
const version=hash.digest('hex').slice(0,12);
await writeFile('dist/sw.js',worker.replace('__BUILD_HASH__',version));
const packageInfo=JSON.parse(await readFile('package.json','utf8'));
console.log(`Built Light Orbit ${packageInfo.version} (${version}) in dist/`);
