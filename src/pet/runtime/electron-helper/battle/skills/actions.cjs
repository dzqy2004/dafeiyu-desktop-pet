'use strict';
const {distance,direction}=require('../core/math.cjs');
function target(e,c){return e.fish.find(f=>f.id===c.targetId&&f.is_alive);}
function near(e,f,r){return e.fish.filter(t=>t.is_alive&&t!==f&&distance(t.position,f.position)<r+t.radius*.5);}
function shot(e,f,c,s,offset=0){const t=target(e,c);const aim=t?direction(f.position,t.position):c.direction;const a=Math.atan2(aim.y,aim.x)+offset;e.projectile(f,{...f.position},{x:Math.cos(a)*s.speed,y:Math.sin(a)*s.speed},s,t?.id);}
function selfStatus(e,f,c,s,name=s.status){e.status(f,name,s.duration||s.active_time,{owner:f.id,...s});}
const handlers={
 melee(e,f,c,s){const t=target(e,c);if(t&&distance(f.position,t.position)<=s.range+t.radius*.3){e.damage(f,t,s.damage,s);e.effect('impact',t.position,.45,f.id);}else e.say(f,'miss');},
 aoe(e,f,c,s){const victims=near(e,f,s.radius);for(const t of victims)e.damage(f,t,s.damage,s);e.effect('ring',f.position,.5,f.id,'',s.radius);if(!victims.length)e.say(f,'miss');},
 dash(e,f,c,s){c.motion={direction:c.direction,speed:s.speed,remaining:s.travel};e.effect(s.effect||'dash',f.position,s.active_time,f.id,'',f.radius*1.5);},
 jump(e,f,c,s){const aim=e.arena.clamp(c.aim,f.radius);const d=distance(f.position,aim);c.jump={start:{...f.position},end:d>s.travel?{x:f.position.x+c.direction.x*s.travel,y:f.position.y+c.direction.y*s.travel}:aim};e.effect('landing',c.jump.end,s.active_time,f.id,'',s.radius);f.jumps={height:0};},
 projectile(e,f,c,s){shot(e,f,c,s);for(let i=1;i<(s.count||1);i++)e.schedule(f,i*s.interval,()=>shot(e,f,c,s));},
 beam(e,f,c,s){c.pulseAt=e.time;c.beam=true;},
 zone(e,f,c,s){e.zone(f,f.position,s,true);},
 smoke(e,f,c,s){const point=e.arena.clamp({x:f.position.x+c.direction.x*100,y:f.position.y+c.direction.y*100});e.zone(f,point,s,false);},
 prison(e,f,c,s){const t=target(e,c);if(t&&distance(f.position,t.position)<=s.range){e.damage(f,t,s.damage,s);e.status(t,'prison',s.duration,{owner:f.id,breakDamage:s.breakDamage,damage:0});}else e.say(f,'miss');},
 defend(e,f,c,s){selfStatus(e,f,c,s);},
 feign(e,f,c,s){selfStatus(e,f,c,s);},
 counter(e,f,c,s){selfStatus(e,f,c,s);c.detached=true;if(f.last_attacker){f.hate_table[f.last_attacker]=(f.hate_table[f.last_attacker]||0)+e.config.feedback.counterBonusHate;f.counterTarget=f.last_attacker;}},
 heal(e,f,c,s){e.status(f,'eating',s.active_time,{owner:f.id,heal:s.heal,interval:s.interval,next:e.time+s.interval});e.say(f,'eat');},
 sleep(e,f,c,s){e.status(f,'sleep',s.active_time,{owner:f.id,heal:s.heal,interval:s.interval,next:e.time+s.interval});e.say(f,'sleep');},
 ambush(e,f,c,s){const t=target(e,c);if(!t)return;c.motion={direction:direction(f.position,t.position),speed:s.speed,remaining:s.speed*s.active_time};c.ambush=true;},
 flee(e,f,c,s){selfStatus(e,f,c,s);e.say(f,'flee');},
 redirect(e,f,c,s){const pursuer=target(e,c)||e.fish.find(t=>t.id===f.last_attacker&&t.is_alive);const third=e.fish.filter(t=>t.is_alive&&t!==f&&t!==pursuer).sort((a,b)=>distance(a.position,f.position)-distance(b.position,f.position))[0];if(third)e.status(f,'redirect',s.active_time,{owner:f.id,destination:third.id,speedMultiplier:s.speedMultiplier});else e.status(f,'flee',s.active_time,{owner:f.id,speedMultiplier:s.speedMultiplier});},
 steal(e,f,c,s){selfStatus(e,f,c,s);e.say(f,'eat');},
 bait(e,f,c,s){if(e.items.length>=e.config.maxItems)return;const p=e.arena.clamp({x:f.position.x+c.direction.x*125,y:f.position.y+c.direction.y*125},f.radius);e.items.push({id:++e.objectId,type:'food',owner:f.id,trap:s,heal:s.heal,position:p,landAt:e.time+.2,landed:false,start:e.time,until:e.time+s.life,destroyed:false});e.say(f,'bait');},
 shadows(e,f,c,s){for(let i=0;i<s.count;i++)shot(e,f,c,{...s,homing:true},(i-(s.count-1)/2)*.24);},
 mutual(e,f,c,s){for(const t of near(e,f,s.radius))e.damage(f,t,s.damage,s);e.damage(f,f,s.selfDamage,{...s,noDodge:true,noCrit:true,noCounter:true});e.effect('explosion',f.position,.9,f.id,'',s.radius);},
 food(e,f,c,s){e.globalEvent('26',f);},quake(e,f,c,s){e.globalEvent('27',f);},can(e,f,c,s){e.globalEvent('28',f);},
 rage(e,f,c,s){selfStatus(e,f,c,s);c.detached=true;}
};
function advanceActive(e,f,c,dt){const s=c.skill;
 if(c.motion){const prev={...f.position},d=Math.min(c.motion.remaining,c.motion.speed*dt);f.position=e.arena.clamp({x:prev.x+c.motion.direction.x*d,y:prev.y+c.motion.direction.y*d},f.radius);f.velocity={x:c.motion.direction.x*c.motion.speed,y:c.motion.direction.y*c.motion.speed};c.motion.remaining-=d;
  for(const t of e.fish){if(!t.is_alive||t===f||c.hit.has(t.id))continue;if(e.swept(t.position,prev,f.position)<f.radius+t.radius*.7){c.hit.add(t.id);const backstab=s.backstab&&(f.position.x-t.position.x)*t.facing<0&&t.target&&t.target!==f.id;const bonus=c.ambush&&(t.resting||['IDLE','OBSERVE','DEFENDING'].includes(t.state)||backstab)?s.bonus||1:1;if(backstab)e.say(f,'sneak_attack');e.damage(f,t,s.damage*bonus,s);}}
 }
 if(c.jump){const progress=Math.min(1,(e.time-c.start-s.cast_time)/s.active_time);f.position=e.arena.clamp({x:c.jump.start.x+(c.jump.end.x-c.jump.start.x)*progress,y:c.jump.start.y+(c.jump.end.y-c.jump.start.y)*progress},f.radius);f.jumps={height:Math.sin(progress*Math.PI)*85};if(progress>=1&&!c.landed){c.landed=true;f.jumps=null;const victims=near(e,f,s.radius);for(const t of victims)e.damage(f,t,s.damage,s);e.effect('ring',f.position,.55,f.id,'',s.radius);if(!victims.length)e.say(f,'miss');}}
 if(c.beam&&e.time>=c.pulseAt){c.pulseAt=e.time+s.interval;const end={x:f.position.x+c.direction.x*s.range,y:f.position.y+c.direction.y*s.range};let hit=false;for(const t of e.fish){if(t===f||!t.is_alive)continue;if(e.swept(t.position,f.position,end)<s.radius+t.radius*.6){e.damage(f,t,s.damage,{...s,direction:c.direction});hit=true;}}e.effect('water',f.position,s.interval+.06,f.id,'',s.range,c.direction);if(!hit&&e.time-c.start>s.cast_time+s.active_time-.3)e.say(f,'miss');}
}
module.exports={handlers,advanceActive};
