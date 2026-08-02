'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const BASE='283ce5bf5d17600f1d35457d4f84786187abe446';const EXPECTED_BLOB='2455590b5f52956939fc3c352435b6cd952d439a';const root=path.resolve(__dirname,'..');
function git(args){return cp.execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024}).trim();}function hash(v){return crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v,Object.keys(v).sort())).digest('hex');}
if(git(['rev-parse',`${BASE}:index.html`])!==EXPECTED_BLOB)throw new Error('Recorded baseline index blob does not match expected canonical source');
const html=git(['show',`${BASE}:index.html`]);const m=html.match(/^const DATA = (\{[\s\S]*?\});$/m);if(!m)throw new Error('DATA block not found at baseline');const DATA=JSON.parse(m[1]);
const fixture={schema_version:'1.0.0',source_commit:BASE,index_blob:EXPECTED_BLOB,node_ids:DATA.nodes.map(n=>n.id).sort(),type_counts:Object.fromEntries([...new Set(DATA.nodes.map(n=>n.type))].sort().map(t=>[t,DATA.nodes.filter(n=>n.type===t).length])),texts_sha256:hash(JSON.stringify(DATA.texts)),relations_sha256:hash(JSON.stringify(DATA.relations)),nameos_sha256:hash(JSON.stringify(DATA.nameos||{})),refs_sha256:hash(JSON.stringify(DATA.refs||{})),protected_file_blobs:{}};
for(const p of ['data-model.md','CNAME','CITATION.cff','RIGHTS.md','sitemap.xml','robots.txt'])fixture.protected_file_blobs[p]=git(['rev-parse',`${BASE}:${p}`]);
const out=path.join(root,'tests/fixtures/canonical-baseline.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(fixture,null,2)+'\n');console.log(`BASELINE_FIXTURE ${out}`);
