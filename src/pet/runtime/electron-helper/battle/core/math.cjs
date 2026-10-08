'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function direction(a,b){const d=distance(a,b);return d>0.001?{x:(b.x-a.x)/d,y:(b.y-a.y)/d}:{x:1,y:0};}
class Random {
 constructor(seed){this.seed=Number(seed)>>>0;this.state=this.seed||0xabcdef;}
 next(){let t=this.state+=0x6d2b79f5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;}
 between(a,b){return a+(b-a)*this.next();}pick(list){return list[Math.floor(this.next()*list.length)];}
 shuffle(list){list=[...list];for(let i=list.length-1;i>0;i--){const j=Math.floor(this.next()*(i+1));[list[i],list[j]]=[list[j],list[i]];}return list;}
}
function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y;const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
class Arena {
 constructor(areas,pad){this.pad=pad;this.set(areas);}
 set(areas){this.areas=areas.filter(a=>Number.isFinite(a.x)&&Number.isFinite(a.y)&&a.width>50&&a.height>50).map(a=>({...a}));if(!this.areas.length)throw Error('没有可用的桌面工作区');}
 contains(p,pad=this.pad){const inArea=(x,y)=>this.areas.some(a=>x>=a.x&&x<=a.x+a.width&&y>=a.y&&y<=a.y+a.height);return [[0,0],[-pad,0],[pad,0],[0,-pad],[0,pad],[-pad,-pad],[pad,-pad],[-pad,pad],[pad,pad]].every(([x,y])=>inArea(p.x+x,p.y+y));}
 clamp(p,pad=this.pad){if(this.contains(p,pad))return {...p};let best,score=Infinity;for(const a of this.areas){const m=Math.min(pad,a.width/3,a.height/3);const q={x:clamp(p.x,a.x+m,a.x+a.width-m),y:clamp(p.y,a.y+m,a.y+a.height-m)};const d=distance(p,q);if(d<score){best=q;score=d;}}return best;}
 random(rng,pad=this.pad){const a=rng.pick(this.areas),m=Math.min(pad,a.width/3,a.height/3);return{x:rng.between(a.x+m,a.x+a.width-m),y:rng.between(a.y+m,a.y+a.height-m)};}
 spawn(n,rng,radius){const result=[];for(let i=0;i<n;i++){let best,score=-1;for(let j=0;j<130;j++){const p=this.random(rng,radius+45);const s=result.length?Math.min(...result.map(q=>distance(p,q))):1e9;if(s>score){best=p;score=s;}}result.push(best);}return result;}
 // Route through touching work areas; disconnected monitors are separate islands.
 waypoint(from,to){const a=this.areas.findIndex(r=>from.x>=r.x&&from.x<=r.x+r.width&&from.y>=r.y&&from.y<=r.y+r.height),b=this.areas.findIndex(r=>to.x>=r.x&&to.x<=r.x+r.width&&to.y>=r.y&&to.y<=r.y+r.height);if(a<0||b<0||a===b)return to;
 const queue=[[a]],seen=new Set([a]);while(queue.length){const route=queue.shift(),r=this.areas[route.at(-1)];if(route.at(-1)===b){const s=this.areas[route[1]],prev=this.areas[a];return {x:clamp(to.x,Math.max(prev.x,s.x),Math.min(prev.x+prev.width,s.x+s.width)),y:clamp(to.y,Math.max(prev.y,s.y)+this.pad,Math.min(prev.y+prev.height,s.y+s.height)-this.pad)};}
 for(let i=0;i<this.areas.length;i++){const s=this.areas[i],gapX=Math.max(r.x,s.x)-Math.min(r.x+r.width,s.x+s.width),gapY=Math.max(r.y,s.y)-Math.min(r.y+r.height,s.y+s.height);if(!seen.has(i)&&gapX<=1&&gapY<=1){seen.add(i);queue.push([...route,i]);}}}
 // A work-area gap (taskbar or a disconnected monitor) uses a boundary transfer.
 // Both endpoints remain visible; the pet never waits forever at an invisible seam.
 const source=this.areas[a],dest=this.areas[b],m=this.pad;const destination={x:clamp(from.x,dest.x+m,dest.x+dest.width-m),y:clamp(from.y,dest.y+m,dest.y+dest.height-m)};const exit={x:clamp(destination.x,source.x+m,source.x+source.width-m),y:clamp(destination.y,source.y+m,source.y+source.height-m)};return {...exit,portal:destination};
 }
}
module.exports={clamp,distance,direction,segmentDistance,Random,Arena};
