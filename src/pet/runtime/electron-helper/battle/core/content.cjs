'use strict';
const fs=require('node:fs'),path=require('node:path');
function loadContent(){const dir=path.join(__dirname,'../data');const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n+'.json'),'utf8'));const result={config:read('battle_config'),skills:read('skills'),personalities:read('personalities'),dialogues:read('dialogues'),animations:read('animations')};
 if(result.skills.length<30||new Set(result.skills.map(s=>s.id)).size!==result.skills.length)throw Error('技能数据至少应有 30 个独立技能且不能重复');
 for(const s of result.skills){if(!s.name||!s.handler||!s.animation||!(s.cooldown>0)||!(s.cast_time>0))throw Error('技能配置不完整：'+s.id);}
 for(const [name,group] of Object.entries(result.dialogues)){if(group.lines.length<4||group.lines.some(x=>x.length<2||x.length>15))throw Error('台词配置不合法：'+name);}
 return result;
}
function loadouts(count,content,rng){const used=new Map(),chosen=[];for(let i=0;i<count;i++){const pool=[];for(const [slot,n] of Object.entries(content.config.skillSlots)){const candidates=rng.shuffle(content.skills.filter(s=>s.slot===slot)).sort((a,b)=>(used.get(a.id)||0)-(used.get(b.id)||0));for(const s of candidates.slice(0,n)){pool.push(s);used.set(s.id,(used.get(s.id)||0)+1);}}chosen.push(pool);}return chosen;}
module.exports={loadContent,loadouts};
