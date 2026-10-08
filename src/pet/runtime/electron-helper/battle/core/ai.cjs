'use strict';
const {distance,direction,clamp}=require('./math.cjs');
function engagement(e,t,observer){const opponent=e.fish.find(x=>x.id===t.target&&x.is_alive);return !!(opponent&&opponent!==observer&&(t.cast||distance(t.position,opponent.position)<e.config.ai.crowdRadius||e.time-t.last_damage_time<e.config.ai.engagementWindow));}
function behind(f,t){return (f.position.x-t.position.x)*t.facing<0;}
function nearby(e,f,r){return e.alive.filter(t=>t!==f&&distance(f.position,t.position)<r);}
function chooseTarget(e,f){const c=e.config.scores,p=f.personality;const choices=e.fish.filter(t=>t!==f&&t.is_alive).map(t=>{
 const d=distance(f.position,t.position);let score=(f.hate_table[t.id]||0)*c.hate+c.distance*p.pursuit/(1+d/e.config.ai.distanceScale)+(1-t.hpRatio)*c.weak*p.opportunism+(t.target===f.id?c.attackingMe:0)+(t.resting?c.sleeping*p.opportunism:0)+e.rng.between(0,c.noise);if(engagement(e,t,f))score+=(c.thirdParty+(behind(f,t)?c.behind:0))*p.opportunism;
 const crowd=nearby(e,t,e.config.ai.crowdRadius).length,hunters=e.alive.filter(x=>x!==f&&x.target===t.id).length;
 score+=Math.min(crowd,3)*c.crowd*p.aggression;score-=Math.max(0,hunters-2)*c.crowdPenalty/p.opportunism;
 if(t.id===f.target&&(f.hate_table[t.id]||0)<e.config.ai.strongHate&&e.time-f.targetSince>e.config.ai.duelFatigueSeconds)score-=c.fatigue;
 return{t,score:Math.max(1,score)*(t.has('feign')?.08:1)};
 }).sort((a,b)=>b.score-a.score);if(!choices.length)return null;const current=choices.find(x=>x.t.id===f.target);if(current&&e.time-f.targetSince<e.config.targetHold)return current.t;if(current&&choices[0].score<current.score*e.config.targetSwitchAdvantage)return current.t;const t=choices[0].t;if(f.target!==t.id){f.targetSince=e.time;e.coverage.targetChanges++;e.log('target',{fish:f.id,target:t.id,hate:Math.round(f.hate_table[t.id]||0),thirdParty:engagement(e,t,f)});}return t;}
const scores={
 melee:(e,f,t,s)=>1.2,aoe:(e,f,t,s)=>{const n=nearby(e,f,s.radius).length;return n<(s.crowdMinimum||1)?0:1+n*.8;},
 dash:(e,f,t,s)=>distance(f.position,t.position)>e.config.ai.dashPreferenceDistance?1.6:1,jump:(e,f,t,s)=>1.2,
 projectile:(e,f,t,s)=>1.25+(s.bounceCount?Math.min(3,nearby(e,t,s.bounceRadius).length)*.45:0),beam:(e,f,t,s)=>1.15,zone:(e,f,t,s)=>scores.aoe(e,f,t,s),
 smoke:(e,f,t,s)=>distance(f.position,t.position)<e.config.ai.smokeDistance?1.2:0,prison:(e,f,t,s)=>t.controlled?0:1.25,
 defend:(e,f,t,s)=>f.hpRatio<e.config.ai.defendHp&&!f.has('shield')?1.6:0,
 feign:(e,f,t,s)=>f.hpRatio<e.config.ai.feignHp&&!f.has('feign')?1.7:0,
 counter:(e,f,t,s)=>e.time-f.last_damage_time<e.config.ai.counterRecentSeconds&&!f.has('counter')?2:0,
 heal:(e,f,t,s)=>f.hpRatio<e.config.ai.healHp&&!f.resting?1.9*f.personality.food:0,
 sleep:(e,f,t,s)=>f.hpRatio<e.config.ai.sleepHp&&distance(f.position,t.position)>e.config.ai.sleepDistance?2.1*f.personality.sleep:0,
 ambush:(e,f,t,s)=>s.backstab?(behind(f,t)&&engagement(e,t,f)?3.5*f.personality.opportunism:0):(t.resting||['IDLE','OBSERVE'].includes(t.state)?3*f.personality.opportunism:.6),
 flee:(e,f,t,s)=>f.hpRatio<e.config.ai.fleeHp?2.5*f.personality.flee:0,
 redirect:(e,f,t,s)=>e.alive.length>2&&t.target===f.id&&f.hpRatio<e.config.ai.redirectHp?2:0,
 steal:(e,f,t,s)=>e.items.length||e.fish.some(x=>x!==f&&x.is_alive&&x.resting&&distance(x.position,f.position)<400)?2*f.personality.food:0,
 shadows:(e,f,t,s)=>1.4,bait:(e,f,t)=>e.alive.length>2&&distance(f.position,t.position)>e.config.ai.baitSafeDistance&&!e.items.some(i=>i.owner===f.id)?1.8*f.personality.opportunism:0,
 mutual:(e,f,t,s)=>f.hpRatio<s.hpCondition&&e.rng.next()<s.useChance?5:0,
 rage:(e,f,t,s)=>f.hpRatio<e.config.ai.rageHp?2:0,food:()=>0,quake:()=>0,can:()=>0
};
function steer(e,f,point,speed=1){const waypoint=e.arena.waypoint(f.position,point);if(!waypoint){f.intent={x:0,y:0};return;}f.navigation=waypoint.portal?waypoint:null;const dir=direction(f.position,waypoint);f.intent={x:dir.x*f.move_speed*speed,y:dir.y*f.move_speed*speed};if(Math.abs(dir.x)>.12)f.facing=dir.x>0?1:-1;}
function decide(e,f){if(!f.is_alive||f.controlled)return;const t=chooseTarget(e,f);f.target=t?.id||null;if(!t){f.intent={x:0,y:0};return;}
 const threat=e.fish.find(x=>x.id===f.last_attacker&&x.is_alive)||t;
 const danger=e.hazards.find(h=>h.until>e.time&&distance(h.position,f.position)<h.radius+f.radius);if(danger){if(f.cast?.phase==='windup')e.cancelCast(f);const dir=direction(danger.position,f.position);steer(e,f,e.arena.clamp({x:f.position.x+dir.x*e.config.ai.dangerEscapeDistance,y:f.position.y+dir.y*e.config.ai.dangerEscapeDistance},f.radius),1.2);f.state='FLEE';return;}
 if(f.resting||f.has('feign')){f.intent={x:0,y:0};return;}
 const cast=f.cast;if(cast&&!['flee','redirect','steal','counter','rage','defend'].includes(cast.skill.handler)){f.intent={x:0,y:0};return;}
 if(f.has('redirect')){const dest=e.fish.find(x=>x.id===f.status_effects.redirect.destination&&x.is_alive);if(dest){steer(e,f,{x:dest.position.x+80,y:dest.position.y+60},f.status_effects.redirect.speedMultiplier);f.state='FLEE';return;}}
 const food=e.items.filter(i=>!i.destroyed&&i.landed&&i.owner!==f.id).sort((a,b)=>distance(a.position,f.position)-distance(b.position,f.position))[0];
 if(food&&f.hpRatio<e.config.ai.foodHp&&(f.has('steal')||distance(food.position,f.position)<e.config.ai.foodDistance*f.personality.food)){steer(e,f,food.position,f.has('steal')?1.38:1.1);f.state='MOVE';return;}
 if(f.has('steal')){const eater=e.fish.filter(x=>x!==f&&x.is_alive&&x.resting).sort((a,b)=>distance(a.position,f.position)-distance(b.position,f.position))[0];if(eater){steer(e,f,eater.position,1.38);f.state='MOVE';return;}}
 if(f.has('flee')||f.hpRatio<e.config.ai.panicHp&&e.rng.next()<e.config.ai.panicChance*f.personality.flee){const dir=direction(threat.position,f.position);const point=e.arena.clamp({x:f.position.x+dir.x*e.config.ai.fleeDistance,y:f.position.y+dir.y*e.config.ai.fleeDistance},f.radius);steer(e,f,point,f.has('flee')?f.status_effects.flee.speedMultiplier:1.05);f.state='FLEE';return;}
 if(!cast&&e.time>=f.nextCast){const candidates=f.skill_pool.filter(s=>s.usable(e,f,t)).map(s=>({s,score:(scores[s.AI_score?.rule||s.handler]?.(e,f,t,s)||0)*(s.AI_score?.base??1)*s.weight*e.rng.between(.7,1.3)})).filter(x=>x.score>0);
  if(f.counterTarget){const victim=e.fish.find(x=>x.id===f.counterTarget&&x.is_alive);if(!victim)f.counterTarget=null;if(victim){const available=f.skill_pool.filter(s=>s.damage>0&&s.usable(e,f,victim)).sort((a,b)=>a.cast_time-b.cast_time);if(available[0]){available[0].cast(e,f,victim);f.target=victim.id;f.counterTarget=null;return;}}}
  if(e.time>e.config.ultimateUnlock&&e.time-f.lastUltimate>e.config.ultimateMinGap&&e.time-e.lastGlobalUltimate>e.config.globalUltimateGap&&e.rng.next()<e.config.ultimateDecisionChance){for(const s of f.ultimate_pool){if(s.usable(e,f,t)&&scores[s.handler](e,f,t,s)>0)candidates.push({s,score:6});}}
  candidates.sort((a,b)=>b.score-a.score);if(candidates.length&&e.rng.next()<clamp(.72*f.personality.aggression*(f.has('smelly')?.45:1),.15,.95)){candidates[0].s.cast(e,f,t);return;}
 }
 if(e.time<f.observingUntil){f.intent={x:0,y:0};f.state='OBSERVE';return;}
 if(e.rng.next()<f.personality.idleChance/f.personality.pursuit&&!f.cast){f.observingUntil=e.time+e.rng.between(...e.config.ai.idleDuration);f.intent={x:0,y:0};f.state=e.rng.next()<.5?'IDLE':'OBSERVE';return;}
 const d=distance(f.position,t.position);if(d>f.radius+t.radius+17){let p={x:t.position.x+Math.sin(e.time*.8+f.id)*e.config.ai.targetOffset,y:t.position.y+Math.cos(e.time*.7+f.id)*18};if(engagement(e,t,f)&&f.personality.opportunism>1)p={x:t.position.x-t.facing*e.config.ai.flankOffset,y:t.position.y+(f.id%2?1:-1)*e.config.ai.flankOffset*.45};steer(e,f,p,f.has('rage')?f.status_effects.rage.speedMultiplier:1);f.state=f.has('rage')?'BERSERK':'CHASE';}else{f.intent={x:0,y:0};f.state='OBSERVE';}
}
module.exports={decide,chooseTarget,scores,steer,engagement,behind};
