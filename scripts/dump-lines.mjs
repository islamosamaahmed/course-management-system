import fs from 'node:fs';
const file = process.argv[2];
const start = Number(process.argv[3]||1);
const end = Number(process.argv[4]||start+100);
const lines = fs.readFileSync(file,'utf8').split('\n');
console.log('TOTAL:'+lines.length);
for(let i=start-1;i<Math.min(end,lines.length);i++) console.log((i+1)+':'+lines[i]);
