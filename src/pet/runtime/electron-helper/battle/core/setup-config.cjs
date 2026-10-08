'use strict';
const {loadouts}=require('./content.cjs');
const {Random}=require('./math.cjs');
function defaultSetup(content){
 const pools=loadouts(content.config.maxFish,content,new Random(content.config.defaultLoadoutSeed));
 return {version:1,count:6,mode:'random',eventRate:'standard',canCount:content.config.canCountDefault,foodCount:content.config.foodCountDefault,events:content.skills.filter(s=>s.slot==='event').map(s=>s.id),fish:pools.map(pool=>({skills:pool.map(s=>s.id),ultimates:['29','30']}))};
}
function normalizeSetup(input,content,activeCount=null){
 const defaults=defaultSetup(content);if(input==null)return defaults;
 if(typeof input!=='object'||Array.isArray(input))throw Error('技能配置格式不正确');
 const count=input.count??defaults.count;
 if(!Number.isInteger(count)||count<2||count>content.config.maxFish)throw Error('请选择 2～10 条大肥鱼');
 const mode=input.mode??defaults.mode;if(!['random','custom'].includes(mode))throw Error('请选择随机或自选技能');
 const eventRate=input.eventRate??'standard';if(typeof eventRate!=='string'||!Object.hasOwn(content.config.eventRates,eventRate))throw Error('场外事件频率不正确');
 const foodCount=input.foodCount??defaults.foodCount;if(!Number.isInteger(foodCount)||foodCount<1||foodCount>content.config.foodCountMax)throw Error('小鱼干数量必须为 1～'+content.config.foodCountMax+' 份');
 const canCount=input.canCount??defaults.canCount;if(!Number.isInteger(canCount)||canCount<1||canCount>content.config.canCountMax)throw Error('罐头数量必须为 1～'+content.config.canCountMax+' 个');
 const registry=new Map(content.skills.map(s=>[s.id,s]));
 const validateIds=(ids,predicate,label,maximum)=>{
  if(!Array.isArray(ids)||ids.length>maximum||new Set(ids).size!==ids.length)throw Error(label+'数量不正确或有重复');
  for(const id of ids)if(typeof id!=='string'||!registry.has(id)||!predicate(registry.get(id)))throw Error(label+'含有不适用的技能');
  return [...ids];
 };
 const events=validateIds(input.events??defaults.events,s=>s.slot==='event','场外事件',defaults.events.length);
 if(input.fish!==undefined&&(!Array.isArray(input.fish)||input.fish.length>content.config.maxFish))throw Error('每条鱼的技能配置格式不正确');
 const fish=defaults.fish.map((fallback,i)=>{
  const row=input.fish?.[i]??fallback;if(!row||typeof row!=='object'||Array.isArray(row))throw Error('大肥鱼'+(i+1)+'的技能配置不正确');
  return {skills:validateIds(row.skills??fallback.skills,s=>!['ultimate','event'].includes(s.slot),'大肥鱼'+(i+1)+'的普通技能',content.config.setupMaxSkills),ultimates:validateIds(row.ultimates??fallback.ultimates,s=>s.slot==='ultimate','大肥鱼'+(i+1)+'的大招',2)};
 });
 if(mode==='custom')for(let i=0;i<(activeCount??count);i++)if(!fish[i].skills.length)throw Error('大肥鱼'+(i+1)+'至少要选 1 个普通技能');
 return {version:1,count,mode,eventRate,canCount,foodCount,events,fish};
}
module.exports={defaultSetup,normalizeSetup};
