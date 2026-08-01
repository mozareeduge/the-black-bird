'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const required=[
  ['TESTING.md',[/field recomposition/i,/morphology/i,/relation clearing/i,/candidate-bound/i,/known limits/i]],
  ['BLACK_BIRD_DECISIONS_CHANGELOG.md',[/field recomposition/i,/commands run/i,/known risks/i]]
];
const failures=[];
for(const [rel,patterns] of required){const file=path.join(root,rel);if(!fs.existsSync(file)){failures.push(`${rel}: missing`);continue;}const body=fs.readFileSync(file,'utf8');for(const pattern of patterns)if(!pattern.test(body))failures.push(`${rel}: missing ${pattern}`);}
if(failures.length){console.error('DOCUMENTATION_CONTRACT_FAIL\n'+failures.join('\n'));process.exit(1);}
console.log('PASS truthful candidate documentation contract');
