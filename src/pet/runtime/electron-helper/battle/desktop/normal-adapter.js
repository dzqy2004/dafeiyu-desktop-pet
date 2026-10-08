'use strict';
let battleSuspended=false,normalLoopEpoch=0,normalLoopTimer=null;
const battleNormalPositions=new Map();
window.petBridge?.onBattleMode(paused=>{
 if(paused===battleSuspended)return;battleSuspended=paused;
 if(paused){normalLoopEpoch++;clearTimeout(normalLoopTimer);normalLoopTimer=null;loopsStarted=false;clearTimeout(bootTimer);bootTimer=null;
  for(const sprite of sprites){battleNormalPositions.set(sprite.pet.id,{customPos:sprite.customPos||{rx:(sprite.pos.x+sprite.halfW)/VIEW.w,ry:(sprite.pos.y+sprite.halfH)/VIEW.h},facing:sprite.facing});sprite.gen++;sprite.pending=null;sprite.dispose();for(const v of [sprite.videoA,sprite.videoB]){v.onended=null;v.onerror=null;v.pause();v.removeAttribute('src');v.load();}}
  sprites=[];window.__dshPetDebug.battleSuspended=true;window.__dshPetDebug.spriteCount=0;
 }else{stateBaseline=null;window.__dshPetDebug.battleSuspended=false;void boot();}
});
