'use strict';
(()=>{
 const images=new Map();const files={bubble:'projectiles/bubble',bone:'projectiles/bone',hook:'projectiles/hook',shadow:'projectiles/shadow',food:'items/food',can:'items/can',crown:'ui/crown',smoke:'effects/smoke',shield:'icons/shield',sleep:'icons/sleep',fire:'icons/rage',rice:'icons/eating',anger:'icons/counter',ghost:'icons/feign'};
 for(const [key,file]of Object.entries(files)){const im=new Image();im.src=new URL('../../../../assets/battle/'+file+'.png',location.href).href;images.set(key,im);}
 const star=(c,x,y,r,color)=>{c.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,rr=i%2?r*.43:r;c.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}c.closePath();c.fillStyle=color;c.fill();};
 const sprite=(c,key,x,y,size,angle=0,alpha=1)=>{const im=images.get(key);if(!im?.complete||!im.naturalWidth)return;c.save();c.translate(x,y);c.rotate(angle);c.globalAlpha*=alpha;c.drawImage(im,-size/2,-size/2,size,size);c.restore();};
 const ring=(c,x,y,r,color,width=3)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.ellipse(x,y,r,r*.58,0,0,Math.PI*2);c.stroke();};
 const shapes={
  bubble(c,o,t){sprite(c,'bubble',o.x,o.y,(o.radius||17)*2.4,Math.sin(t*3)*.1);},
  hook(c,o,t){sprite(c,'hook',o.x,o.y,43,o.angle);c.strokeStyle='#85bdd699';c.lineWidth=2;c.beginPath();c.moveTo(o.x-Math.cos(o.angle)*20,o.y-Math.sin(o.angle)*20);c.lineTo(o.x-Math.cos(o.angle)*40,o.y-Math.sin(o.angle)*40+Math.sin(t*12)*6);c.stroke();},
  bone(c,o){sprite(c,'bone',o.x,o.y,38,o.angle+Math.PI/4);},
  shadow(c,o,t){sprite(c,'shadow',o.x,o.y,46,o.angle, .78);ring(c,o.x-7,o.y+12,20,'#90daea55',2);},
  food(c,o,t){sprite(c,'food',o.x,o.y-(o.fall||0),43,Math.sin(t*5+o.id)*.12);ring(c,o.x,o.y+15,24,'#ffe0a0aa',2);},
  can(c,o){sprite(c,'can',o.x,o.y,95,o.angle||0);},
  crown(c,o){sprite(c,'crown',o.x,o.y,(o.radius||28)*2);},
  landing(c,o,t){const alpha=.45+Math.sin(t*9)*.2;c.save();c.globalAlpha*=alpha;ring(c,o.x,o.y,o.radius,'#ee9b74',4);ring(c,o.x,o.y,o.radius*.67,'#f9c278',2);c.setLineDash([8,7]);ring(c,o.x,o.y,o.radius+8,'#e68169',2);c.restore();},
  canWarning(c,o,t){shapes.landing(c,o,t);c.fillStyle='#bb6850';c.font='bold 14px Microsoft YaHei UI';c.textAlign='center';c.fillText('罐头要来啦！',o.x,o.y-22);},
  smoke(c,o,t){for(let i=0;i<5;i++){const a=i*1.26+t*.25;sprite(c,'smoke',o.x+Math.cos(a)*o.radius*.5,o.y+Math.sin(a)*o.radius*.35,100,0,.3);}},
  frenzy(c,o,t){ring(c,o.x,o.y,o.radius,'#f3a3b0aa',4);for(let i=0;i<7;i++){const a=t*4+i*.9;star(c,o.x+Math.cos(a)*o.radius*.7,o.y+Math.sin(a)*o.radius*.5,7,'#ffc67e');}},
  water(c,o,t){const d=o.direction||{x:1,y:0},length=o.radius||180;c.save();c.translate(o.x,o.y);c.rotate(Math.atan2(d.y,d.x));const g=c.createLinearGradient(0,0,length,0);g.addColorStop(0,'#91e4f2aa');g.addColorStop(1,'#c1f3ff11');c.fillStyle=g;c.beginPath();c.moveTo(20,-9);c.quadraticCurveTo(length*.5,-25,length,Math.sin(t*19)*10-12);c.lineTo(length,16);c.quadraticCurveTo(length*.4,22,20,9);c.closePath();c.fill();for(let i=0;i<8;i++){const x=((t*350+i*29)%length);c.fillStyle='#75c6eacc';c.beginPath();c.ellipse(x,Math.sin(x*.05+t*10)*9,6,2.8,0,0,Math.PI*2);c.fill();}c.restore();},
  ring(c,o){const p=o.progress||0;ring(c,o.x,o.y,(o.radius||90)*(.35+p*.65),'#74bdd8'+Math.round((1-p)*180).toString(16).padStart(2,'0'),4);},
  impact(c,o){const p=o.progress||0;for(let i=0;i<6;i++){const a=i*Math.PI/3;star(c,o.x+Math.cos(a)*p*45,o.y+Math.sin(a)*p*35,7*(1-p)+2,'#ffc890');}},
  bubbleBurst(c,o){const p=o.progress||0;for(let i=0;i<6;i++){const a=i*Math.PI/3;ring(c,o.x+Math.cos(a)*p*36,o.y+Math.sin(a)*p*36,4*(1-p)+2,'#84cce4bb',2);}},
  heal(c,o){const p=o.progress||0;c.strokeStyle='#74cda7';c.lineWidth=3;for(let i=0;i<3;i++){const x=o.x+(i-1)*22,y=o.y-20-p*43;c.beginPath();c.moveTo(x-5,y);c.lineTo(x+5,y);c.moveTo(x,y-5);c.lineTo(x,y+5);c.stroke();}},
  explosion(c,o){const p=o.progress||0;ring(c,o.x,o.y,o.radius*(.3+p*.7),'#e990aa88',6);for(let i=0;i<12;i++){const a=i*Math.PI/6;star(c,o.x+Math.cos(a)*p*o.radius,o.y+Math.sin(a)*p*o.radius*.7,11*(1-p)+2,'#ffcf79');}},
  canImpact(c,o){shapes.explosion(c,o);sprite(c,'can',o.x,o.y+6,85,.15,.5*(1-(o.progress||0)));},
  warning(c,o,t){ring(c,o.x,o.y,75+Math.sin(t*8)*5,'#f1b47cbb',4);},
  dodge(c,o){star(c,o.x+38,o.y-30,8,'#9cdef2');},
  dash(c,o,t){for(let i=0;i<4;i++){c.fillStyle='#acdae8'+Math.round(100-i*18).toString(16).padStart(2,'0');c.beginPath();c.ellipse(o.x-(i+1)*18,o.y+25+Math.sin(t*8+i)*4,12,5,0,0,Math.PI*2);c.fill();}},
  ultimate(c,o,t){shapes.dash(c,o,t);ring(c,o.x,o.y,75,'#f3c083bb',4);},
  banner(c,o){c.fillStyle='#34547a';c.font='17px Whale,Microsoft YaHei UI';c.textAlign='center';c.fillText(o.text,o.x,o.y-90);},
  quake(c,o,t){for(let i=0;i<4;i++){const x=o.x+(i-2)*27;c.strokeStyle='#aac3d4aa';c.lineWidth=2;c.beginPath();c.moveTo(x,o.y+50);c.lineTo(x+10*Math.sin(t*22),o.y+57);c.lineTo(x+4,o.y+65);c.stroke();}}
 };
 shapes.roll=shapes.dash;
 function draw(c,o,t){c.save();if(o.progress!==undefined)c.globalAlpha*=Math.min(1,(1-o.progress)*2);shapes[o.type]?.(c,o,t);c.restore();}
 function fishEffects(c,f,t,effects=[]){
  for(const s of f.statuses){if(s==='prison'){sprite(c,'bubble',175,220,151,0,.72);}if(s==='shield'){ring(c,175,236,74,'#73bad8aa',5);}if(s==='rage'){for(let i=0;i<4;i++)sprite(c,'fire',135+i*27,277+Math.sin(t*7+i)*4,37,0,.65);}if(s==='sleep')sprite(c,'sleep',225,175,45);if(s==='stun')for(let i=0;i<3;i++){const a=t*4+i*2.1;star(c,175+Math.cos(a)*44,170+Math.sin(a)*11,7,'#f1c875');}}
  if(f.phase==='windup'){ring(c,175,275,38+f.castProgress*28,'#8fd1e688',3);}if(f.knockback)shapes.dash(c,{x:175,y:255},t);
  for(const e of effects){const x=175+e.x-f.x,y=220+e.y-f.y;if(Math.abs(x-175)<155&&Math.abs(y-220)<150)draw(c,{...e,x,y},t);}
 }
 window.BattlePaint={draw,star,sprite};window.drawFishEffects=fishEffects;
})();
