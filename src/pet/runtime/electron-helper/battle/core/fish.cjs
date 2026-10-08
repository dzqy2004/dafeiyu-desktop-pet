'use strict';
const States=Object.freeze(Object.fromEntries(['IDLE','OBSERVE','MOVE','CHASE','ATTACK','CAST_SKILL','HURT','KNOCKBACK','STUNNED','SLEEPING','HEALING','FLEE','DEFENDING','BERSERK','DEAD','VICTORY'].map(x=>[x,x])));
class BattleFish {
 constructor(id,personality,position,skills,cfg){
  Object.assign(this,{id,display_name:'大肥鱼'+['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'][id-1],title:personality.title,personality,hp:cfg.hp,max_hp:cfg.hp,base_attack:cfg.attack,defense:cfg.defense,move_speed:cfg.speed,position:{...position},velocity:{x:0,y:0},facing:1,target:null,state:States.OBSERVE,skill_pool:skills,cooldowns:{},status_effects:{},hate_table:{},last_attacker:null,last_damage_time:-100,kills:0,damage_dealt:0,damage_received:0,healing_done:0,skills_used:0,survival_time:0,rank:null,is_alive:true,critical_hits:0,damage_avoided:0,largest_hit:0,food_taken:0});
  this.radius=cfg.radius;this.cast=null;this.intent={x:0,y:0};this.nextDecision=id*.024;this.nextCast=0;this.targetSince=-100;this.controlHistory=[];this.controlImmuneUntil=0;this.hurtUntil=0;this.knockUntil=0;this.lastSpeech=-100;this.dialogue=null;this.recentLines=[];this.numbers=[];this.hitTimes=[];this.deathAt=null;this.counterTarget=null;this.lastUltimate=-100;this.lowSaid=false;this.observingUntil=.5;this.jumps=null;this.deathPosition=null;
 }
 has(s){return !!this.status_effects[s];}
 get hpRatio(){return this.hp/this.max_hp;}
 get controlled(){return this.has('stun')||this.has('prison');}
 get resting(){return this.has('sleep')||this.has('eating');}
 snapshot(time,animations){return {id:this.id,name:this.display_name,title:this.title,personality:this.personality.name,hp:this.hp,maxHp:this.max_hp,x:this.position.x,y:this.position.y,vx:this.velocity.x,vy:this.velocity.y,facing:this.facing,state:this.state,alive:this.is_alive,animation:animations[this.state],skill:this.cast?.skill.name||'',skillAnimation:this.cast?.skill.animation||null,phase:this.cast?.phase||'',castProgress:this.cast?Math.max(0,Math.min(1,(time-this.cast.start)/this.cast.skill.cast_time)):0,statuses:Object.keys(this.status_effects),dialogue:this.dialogue&&this.dialogue.until>time?this.dialogue:null,numbers:this.numbers.filter(x=>x.until>time),jump:this.jumps?.height||0,deathAge:this.deathAt===null?0:time-this.deathAt,deathHold:this.deathHold,knockback:time<this.knockUntil,hurt:time<this.hurtUntil,skills:this.skill_pool.map(s=>({id:s.id,name:s.name,ready:Math.max(0,(this.cooldowns[s.id]||0)-time)}))};}
}
module.exports={BattleFish,States};
