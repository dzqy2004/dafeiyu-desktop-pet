'use strict';
function buildCatalog(content){
 const c=content.config;
 const details={
  '01':s=>`冲向对手，基础伤害 ${s.damage}，把对方撞退；跑出冲撞路径可以躲开。`,
  '02':s=>`近身用肚皮顶人，基础伤害 ${s.damage}，击退比普通冲撞更强。`,
  '03':s=>`起跳后砸向目标位置，半径 ${s.radius} 内所有对手都可能受伤；落点会提前出现提示圈。`,
  '04':s=>`挥尾攻击身边所有对手，每条基础伤害 ${s.damage}，越挤越适合。`,
  '05':s=>`吐出速度较慢的泡泡，命中基础伤害 ${s.damage}，对手走位可以避开。`,
  '06':s=>`连续吐 ${s.count} 个小泡泡，每个基础伤害 ${s.damage}；不会瞬间一起扣血。`,
  '07':s=>`向前喷水，每 ${s.interval} 秒造成 ${s.damage} 基础伤害，并把对手慢慢推开。`,
  '08':s=>`甩出高速直线鱼骨，基础伤害 ${s.damage}，射程较远。`,
  '09':s=>`原地乱动 ${s.active_time} 秒，附近对手每 ${s.interval} 秒受到 ${s.damage} 基础伤害。`,
  '10':s=>`翻滚着向前冲，沿途可以撞中多条不同的鱼，每条基础伤害 ${s.damage}。`,
  '11':s=>`放出臭鱼烟雾；圈内对手持续小额受伤、移动变慢，也更不想出招。`,
  '12':s=>`把目标困在大泡泡里，最多 ${s.duration} 秒不能移动；累计受到 ${s.breakDamage} 伤害会提前破裂。`,
  '13':s=>`重撞造成 ${s.damage} 基础伤害，${Math.round(s.chance*100)}% 概率眩晕 ${s.duration} 秒。`,
  '14':s=>`缩成一团 ${s.duration} 秒，受到的伤害降低 ${Math.round(s.reduction*100)}%；仍可能被控制和击退。`,
  '15':s=>`倒下装死 ${s.duration} 秒，让其他鱼不太愿意选自己；范围攻击和在途攻击仍能打中。`,
  '16':s=>`开启 ${s.duration} 秒反击状态；挨打时有 ${Math.round(s.counterChance*100)}% 概率记住攻击者，优先还手并增加仇恨。`,
  '17':s=>`停下来干饭，每 ${s.interval} 秒回血 ${s.heal}，持续 ${s.active_time} 秒；单次受到 ${c.healInterrupt} 以上伤害，或 ${c.healInterruptWindow} 秒内累计受到 ${c.healInterruptTotal} 伤害，会打断。`,
  '18':s=>`睡觉回血，每 ${s.interval} 秒回复 ${s.heal}，持续 ${s.active_time} 秒；不能移动或攻击，挨打会醒。`,
  '19':s=>`偷袭休息、发呆或防御中的对手，符合条件时伤害乘 ${s.bonus}；对睡觉目标尤其合适。`,
  '20':s=>`远离主要威胁，${s.active_time} 秒内加速开溜；适合残血保命。`,
  '21':s=>`远距离飞扑，落地时攻击一小片区域里的所有对手；落点会提前提示。`,
  '22':s=>`被追时往第三条鱼旁边跑，让追击者卷进别人的交战；不强行修改他人的仇恨。`,
  '23':s=>`加速争抢小鱼干；靠近正在回血的鱼时，能偷走 ${Math.round(s.stealRatio*100)}% 治疗收益。`,
  '24':s=>`召来 ${s.count} 条短暂小鱼影追打目标，每条基础伤害 ${s.damage}，到时自动消失。`,
  '25':s=>`极低血量时赌一把，附近对手受到 ${s.damage} 基础伤害，自己也受 ${s.selfDamage} 基础伤害；可能翻盘，也可能双败。`,
  '26':()=>`随机落下多份小鱼干（默认 ${c.foodCountDefault} 份，可在场外选项调整），每份最高回复 ${c.foodHeal}，整轮总回复最多 ${c.foodWaveHealBudget}（12 份时每份 ${c.foodWaveHealBudget/12}）；每条鱼吃下一份需间隔 ${c.foodPickupGap} 秒。所有存活鱼都能争抢，同一份只能被一条领取。`,
  '27':()=>`全部存活鱼受到 ${c.earthquakeDamage} 基础伤害，并短暂失衡 ${c.earthquakeControl} 秒；只晃鱼，不移动电脑上的其他窗口。`,
  '28':()=>`一次从桌面顶部掉落多个罐头（默认 ${c.canCountDefault} 个，可在场外选项调整），部分落点靠近正在活动的鱼；落点提前 ${c.canWarning} 秒警告，命中造成 ${c.canDamage} 基础伤害和强击退，可以尝试跑开。`,
  '29':s=>`明显蓄力后高速横穿桌面，路径上的每条对手受到 ${s.damage} 基础伤害和强击退。`,
  '30':s=>`暴走 ${s.duration} 秒，速度 ×${s.speedMultiplier}、攻击 ×${s.attackMultiplier}，出招间隔 ×${s.cooldownMultiplier}；结束后恢复正常。`,
  '31':s=>`泡泡先命中一条，再向附近没打过的对手弹跳，最多多打 ${s.bounceCount} 条；每次弹跳伤害保留 ${Math.round(s.bounceFactor*100)}%。`,
  '32':s=>`至少 ${s.crowdMinimum} 名对手挤在附近时挥尾，把周围对手推散；适合被围攻时脱身。`,
  '33':s=>`趁对手正在与别人交战，从背后戳尾巴，符合偷袭条件时伤害乘 ${s.bonus}。`,
  '34':s=>`摆一份 ${s.life} 秒的鱼干诱饵；其他鱼吃到会回血 ${s.heal}，也会被机关打出 ${s.damage} 基础伤害。`,
  '35':s=>`至少 ${s.crowdMinimum} 名对手聚在附近才出招，一大片范围伤害并让对手短暂失衡 ${s.duration} 秒。`,
  '36':s=>`射出弯鱼骨，命中基础伤害 ${s.damage}，把目标拉向自己，方便继续打或拉入混战。`
 };
 const conditions={
  melee:()=> '对手已经靠近时。',aoe:s=>s.crowdMinimum?`附近至少有 ${s.crowdMinimum} 名对手时。`:'身边有对手时，越多人挤在一起越想使用。',
  dash:()=> '目标在可冲撞范围时，距离稍远更积极。',jump:()=> '目标在飞扑范围时。',projectile:()=> '目标在射程内时。',beam:()=> '目标在前方近距离时。',zone:()=> '身边有对手时。',smoke:()=> '对手靠近时。',prison:()=> '目标在范围内，并且没有正在被控制时。',
  defend:()=>`血量低于 ${Math.round(c.ai.defendHp*100)}%，且没有防御状态时。`,feign:()=>`血量低于 ${Math.round(c.ai.feignHp*100)}% 时。`,counter:()=> '最近刚挨打时。',heal:()=>`血量低于 ${Math.round(c.ai.healHp*100)}% 时；贪吃鱼更积极。`,sleep:()=>`血量低于 ${Math.round(c.ai.sleepHp*100)}%，与目标保持一定距离时；爱睡觉的鱼更积极。`,
  ambush:s=>s.backstab?'目标正在与第三条鱼交手，而且自己在目标背后时。':'目标睡觉、回血或发呆时优先。',flee:()=>`血量低于 ${Math.round(c.ai.fleeHp*100)}% 时；胆小鱼更积极。`,redirect:()=> '至少三条参战、被目标追击，而且自己血量不高时。',steal:()=> '场上有鱼干，或附近有人正在回血时。',shadows:()=> '目标在追击范围内时。',mutual:s=>`血量低于 ${Math.round(s.hpCondition*100)}%，还要通过一次低概率抽签。`,bait:()=> '至少三条参战，目标稍远且自己没有未消失的诱饵时。',rage:()=> '血量下降到一定程度，且满足低频大招规则时。',food:()=> '由桌面随机事件系统统一抽取。',quake:()=> '由桌面随机事件系统统一抽取。',can:()=> '由桌面随机事件系统统一抽取。'
 };
 const groups={attack:'攻击',utility:'控制 / 功能',sustain:'防御 / 恢复',special:'特殊',ultimate:'大招',event:'场外事件'};
 const icons={projectile:'projectiles/bubble',shadows:'projectiles/shadow',defend:'icons/shield',feign:'icons/feign',counter:'icons/counter',heal:'icons/eating',sleep:'icons/sleep',flee:'icons/flee',redirect:'icons/flee',steal:'icons/steal',prison:'icons/prison',smoke:'effects/smoke',rage:'icons/rage',food:'items/food',quake:'icons/stun',can:'items/can',bait:'items/food'};
 return content.skills.map(s=>({id:s.id,name:s.name,slot:s.slot,group:groups[s.slot],description:s.description,detail:details[s.id]?.(s)||s.description,condition:(conditions[s.handler]?.(s)||'在合适距离和状态时自动使用。')+(s.slot==='ultimate'?` 开打 ${c.ultimateUnlock} 秒后才解锁，每条鱼两次大招至少间隔 ${c.ultimateMinGap} 秒，全场至少间隔 ${c.globalUltimateGap} 秒；满足条件后仍需低概率抽签。`:''),damage:s.damage,cooldown:s.cooldown,heal:s.heal||0,interval:s.interval||0,cast:s.cast_time,active:s.active_time,recovery:s.recovery_time,requiredEnemies:s.crowdMinimum||(['redirect','bait'].includes(s.handler)?2:1),icon:(s.effect==='bone'?'projectiles/bone':s.effect==='hook'?'projectiles/hook':icons[s.handler]||'icons/stun')+'.png'}));
}
module.exports={buildCatalog};
