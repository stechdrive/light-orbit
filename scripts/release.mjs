// Copyright (C) 2026 stechdrive
// SPDX-License-Identifier: GPL-3.0-or-later
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const repo=process.env.GITHUB_REPOSITORY,commit=process.env.GITHUB_SHA;
if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REF!=='refs/heads/main'||!/^[-\w.]+\/[-\w.]+$/.test(repo||'')||! /^[a-f0-9]{40}$/.test(commit||''))throw new Error('Release requires the main branch workflow.');
const gh=args=>execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const api=path=>JSON.parse(gh(['api',`repos/${repo}/${path}`]));
if(api('commits/main').sha!==commit)throw new Error('A newer commit is ready; skip this release.');
const {version}=JSON.parse(await readFile('package.json','utf8'));
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Invalid version.');
const tag=`v${version}`,asset='publish/LightOrbit.exe';
const bytes=await readFile(asset),digest='sha256:'+createHash('sha256').update(bytes).digest('hex');
if(bytes.length<100000||bytes.toString('ascii',0,2)!=='MZ')throw new Error('Missing Windows executable.');
const ref=api(`git/matching-refs/tags/${tag}`).find(ref=>ref.ref===`refs/tags/${tag}`);
if(ref&&(ref.object.type!=='commit'||ref.object.sha!==commit))throw new Error('This version belongs to a different commit; increment the version.');
const listReleases=()=>JSON.parse(gh(['api','--paginate','--slurp',`repos/${repo}/releases?per_page=100`])).flat();
const releases=listReleases();
let current=releases.find(release=>release.tag_name===tag);
await mkdir('.local',{recursive:true});await writeFile('.local/release-body.txt',version);
if(!current){
  gh(['release','create',tag,'--repo',repo,'--target',commit,'--draft','--title',version,'--notes-file','.local/release-body.txt']);
  current=listReleases().find(release=>release.tag_name===tag);
  if(!current)throw new Error('Draft release was not created.');
}
if(current.draft&&!ref&&current.target_commitish!==commit){
  gh(['api','--method','PATCH',`repos/${repo}/releases/${current.id}`,'-f',`target_commitish=${commit}`]);
  current=api(`releases/${current.id}`);
}
const existing=current.assets.find(item=>item.name==='LightOrbit.exe');
if(!current.draft&&(!ref||!existing?.digest?.startsWith('sha256:')||existing.size<100000||existing.state!=='uploaded'))throw new Error('Published executable is incomplete.');
if(current.draft&&!ref&&current.target_commitish!==commit)throw new Error('Draft belongs to another commit.');
const expectedDigest=current.draft?digest:existing.digest,expectedSize=current.draft?bytes.length:existing.size;
if(existing?.digest!==expectedDigest){
  gh(['release','upload',tag,asset,'--repo',repo,'--clobber']);
}
current=api(`releases/${current.id}`);
const uploaded=current.assets.find(item=>item.name==='LightOrbit.exe');
if(uploaded?.digest!==expectedDigest||uploaded.size!==expectedSize||uploaded.state!=='uploaded')throw new Error('Executable verification failed.');
for(const extra of current.assets.filter(item=>item.name!=='LightOrbit.exe'))gh(['api','--method','DELETE',`repos/${repo}/releases/assets/${extra.id}`]);
gh(['release','edit',tag,'--repo',repo,'--draft=false','--prerelease=false','--latest','--title',version,'--notes-file','.local/release-body.txt']);
const published=api('releases/latest');
if(published.tag_name!==tag||published.body!==version||published.assets.length!==1||published.assets[0].digest!==expectedDigest)throw new Error('Published release verification failed.');
for(const old of releases.filter(release=>release.tag_name!==tag))gh(['api','--method','DELETE',`repos/${repo}/releases/${old.id}`]);
console.log(`Published ${version}: LightOrbit.exe (${expectedDigest})`);
