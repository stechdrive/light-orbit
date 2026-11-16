// Copyright (C) 2026 stechdrive
// SPDX-License-Identifier: GPL-3.0-or-later
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const repo=process.env.GITHUB_REPOSITORY,commit=process.env.GITHUB_SHA;
if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REF!=='refs/heads/main'||!/^[-\w.]+\/[-\w.]+$/.test(repo||'')||!/^[a-f0-9]{40}$/.test(commit||''))throw new Error('Release requires the main branch workflow.');
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
let current=releases.find(release=>release.tag_name===tag)||releases.find(release=>release.draft&&release.name===version&&release.tag_name.startsWith('untagged-'));
await mkdir('.local',{recursive:true});
const update=async(method,path,fields)=>{
  await writeFile('.local/release.json',JSON.stringify(fields));
  return JSON.parse(gh(['api','--method',method,`repos/${repo}/${path}`,'--input','.local/release.json']));
};
const metadata={tag_name:tag,target_commitish:commit,name:version,body:version,prerelease:false};
if(!current){
  current=await update('POST','releases',{...metadata,draft:true});
}
if(current.draft){
  current=await update('PATCH',`releases/${current.id}`,{...metadata,draft:true});
  if(current.tag_name!==tag||current.target_commitish!==commit)throw new Error('Draft does not match the source commit.');
}
const existing=current.assets.find(item=>item.name==='LightOrbit.exe');
if(!current.draft&&(!ref||!existing?.digest?.startsWith('sha256:')||existing.size<100000||existing.state!=='uploaded'))throw new Error('Published executable is incomplete.');
const expectedDigest=current.draft?digest:existing.digest,expectedSize=current.draft?bytes.length:existing.size;
if(existing?.digest!==expectedDigest){
  if(existing)gh(['api','--method','DELETE',`repos/${repo}/releases/assets/${existing.id}`]);
  gh(['api','--method','POST',`https://uploads.github.com/repos/${repo}/releases/${current.id}/assets?name=LightOrbit.exe`,'--header','Content-Type: application/octet-stream','--input',asset]);
}
current=api(`releases/${current.id}`);
const uploaded=current.assets.find(item=>item.name==='LightOrbit.exe');
if(uploaded?.digest!==expectedDigest||uploaded.size!==expectedSize||uploaded.state!=='uploaded')throw new Error('Executable verification failed.');
for(const extra of current.assets.filter(item=>item.name!=='LightOrbit.exe'))gh(['api','--method','DELETE',`repos/${repo}/releases/assets/${extra.id}`]);
await update('PATCH',`releases/${current.id}`,{...metadata,draft:false,make_latest:'true'});
const published=api('releases/latest');
if(published.tag_name!==tag||published.body!==version||published.assets.length!==1||published.assets[0].digest!==expectedDigest)throw new Error('Published release verification failed.');
for(const old of releases.filter(release=>release.id!==published.id))gh(['api','--method','DELETE',`repos/${repo}/releases/${old.id}`]);
console.log(`Published ${version}: LightOrbit.exe (${expectedDigest})`);
