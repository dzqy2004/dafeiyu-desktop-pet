 'use strict';
const canvas=document.getElementById('fx'),ctx=canvas.getContext('2d');let frames=0,dirty=[];
const unsub=battleBridge.onFrame(f=>{try{
 if(canvas.width!==Math.ceil(f.width)||canvas.height!==Math.ceil(f.height)){canvas.width=Math.ceil(f.width);canvas.height=Math.ceil(f.height);dirty=[];}
 for(const b of dirty)ctx.clearRect(b.x,b.y,b.w,b.h);dirty=[];
 for(const o of f.objects){const x=o.x-f.x,y=o.y-f.y,r=Math.max(o.radius||30,30)+24,fall=o.fall||0;const b={x:Math.floor(x-r),y:Math.floor(y-r-fall),w:Math.ceil(r*2),h:Math.ceil(r*2+fall)};dirty.push(b);ctx.save();ctx.beginPath();ctx.rect(b.x,b.y,b.w,b.h);ctx.clip();BattlePaint.draw(ctx,{...o,x,y},f.time);ctx.restore();}frames++;
}catch(err){battleBridge.report(err.message);}});
window.__battleDebug={get frames(){return frames;}};window.addEventListener('beforeunload',unsub);battleBridge.ready();
