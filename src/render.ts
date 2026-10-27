import { HOLES, gateIsOpen, bridgeOutline, pointInBridge, type Bridge, type Hole, type Point, type Gate } from './course';
import { activePlayer, currentHole, totals, winners, type Round } from './round';
import { gameFont } from './runtime';
import { drawTitle } from './title';
import { edgeAngle, type Edge } from './fx';
import type { Box } from './howto';

export interface RenderSeat { id: string; name: string; edge: Edge; glyphId: number | null; present: boolean }
export interface RenderState {
  mode: 'title' | 'setup' | 'play' | 'help' | 'over'; seats: RenderSeat[]; round: Round | null;
  now: number; message: string; canStart: boolean; hasSave: boolean; helpStep: number;
  club: { x: number; y: number; facingDeg: number; start: Point; status: string } | null;
  effects: { x: number; y: number; kind: string; age: number; color: string }[];
}
export const BUTTONS: Record<'play'|'help'|'continue'|'addPlayer'|'start'|'back'|'next'|'rematch'|'setup',Box> = {
  play:{x:700,y:690,width:520,height:132}, help:{x:720,y:850,width:480,height:128},
  continue:{x:1280,y:850,width:480,height:128}, addPlayer:{x:680,y:700,width:560,height:128},
  start:{x:680,y:850,width:560,height:132}, back:{x:64,y:900,width:280,height:128},
  next:{x:1340,y:900,width:500,height:128}, rematch:{x:450,y:850,width:480,height:132},
  setup:{x:990,y:850,width:480,height:132},
};
export const PLAYER_COLORS = ['#fff7dc','#f3ae76','#83d6ec','#d4b5ee'];
const INK='#234b3c', PAPER='#fff5d8', DARK='#143b30', GREEN='#78ac67', WOOD='#a5683d';
const TAU=Math.PI*2;
const images=new Map<number,HTMLImageElement>();
let artLoaded:Promise<void>|null=null, backdrop:{key:number;canvas:HTMLCanvasElement}|null=null, titleBackdrop:HTMLCanvasElement|null=null;

export function loadArt():Promise<void> {
  if(typeof Image==='undefined')return Promise.resolve();
  return artLoaded??=Promise.all(Array.from({length:8},(_,i)=>new Promise<void>(resolve=>{
    const image=new Image(); image.onload=()=>{images.set(i+1,image);resolve();};image.onerror=()=>resolve();image.src=`piece-art/${i+1}.png`;
  }))).then(()=>{});
}
function polygon(ctx:CanvasRenderingContext2D,points:Point[]) {ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();}
function roundRect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r=20) {
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}
function disk(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,color:string) {ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();}
function ellipse(ctx:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,color:string) {ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();}
function text(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,px=48,color=INK,align:CanvasTextAlign='center') {
  ctx.font=gameFont(px);ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';
  ctx.fillText(value,x,y);
}
function nameLabel(ctx:CanvasRenderingContext2D,name:string,index:number,px:number,width:number) {
  const full=name.trim(),words=full.split(/\s+/u).filter(Boolean),number=index+1;
  const first=words[0]??'Golfer';
  const initials=[words[0],words.length>1?words[words.length-1]:undefined]
    .filter((word):word is string=>!!word).map(word=>Array.from(word)[0].toLocaleUpperCase()).join('.');
  // A number keeps two people with the same first name or initials distinct. Keep the
  // font size and character shapes intact instead of squeezing or clipping a name.
  const choices=[full,`${first} · ${number}`,`${initials||'P'} · ${number}`,`P${number}`];
  ctx.font=gameFont(px);
  return choices.find(value=>value&&ctx.measureText(value).width<=width)??`P${number}`;
}
function winnerNames(ctx:CanvasRenderingContext2D,seats:RenderSeat[],ids:string[]) {
  const people=ids.map(id=>({index:Math.max(0,seats.findIndex(seat=>seat.id===id)),seat:seats.find(seat=>seat.id===id)}));
  const full=people.map(({seat})=>seat?.name.trim()||'Golfer').join(' & ');
  ctx.font=gameFont(48);
  if(ctx.measureText(full).width<=1200)return full;
  const width=(1200-ctx.measureText(' & ').width*(people.length-1))/Math.max(1,people.length);
  return people.map(({seat,index})=>nameLabel(ctx,seat?.name??'Golfer',index,48,width)).join(' & ');
}
function line(ctx:CanvasRenderingContext2D,a:Point,b:Point,color:string,width:number) {ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
function seedRandom(seed:number) {return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function bake(draw:(c:CanvasRenderingContext2D)=>void) {const c=document.createElement('canvas');c.width=1920;c.height=1080;const g=c.getContext('2d')!;draw(g);return c;}
function tree(ctx:CanvasRenderingContext2D,x:number,y:number,size:number,variant=0) {
  ellipse(ctx,x+size*.22,y+size*.45,size*.92,size*.61,'#244f3c24');
  line(ctx,{x,y:y+size*.1},{x:x+5,y:y+size*.72},'#8d6341',size*.19);
  const leaves=variant?'#477650':'#43875d',light=variant?'#648c59':'#66a36b';
  disk(ctx,x-size*.35,y+size*.1,size*.56,leaves);disk(ctx,x+size*.35,y,size*.62,leaves);disk(ctx,x,y-size*.37,size*.68,light);
  disk(ctx,x-size*.12,y-size*.48,size*.35,variant?'#7fa16a':'#86b479');
  ctx.strokeStyle='#b4cb8b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x-8,y-8,size*.38,3.3,4.6);ctx.stroke();
}
function flowers(ctx:CanvasRenderingContext2D,x:number,y:number,seed:number) {
  const random=seedRandom(seed);
  for(let i=0;i<9;i++){const fx=x+(random()-.5)*95,fy=y+(random()-.5)*50;
    line(ctx,{x:fx,y:fy+11},{x:fx,y:fy},'#5c8552',3);
    const petal=i%2?'#f4c274':'#f1e9cb';for(let j=0;j<5;j++)disk(ctx,fx+Math.cos(j*TAU/5)*5,fy+Math.sin(j*TAU/5)*5,4,petal);disk(ctx,fx,fy,3,'#d89241');
  }
}
function stones(ctx:CanvasRenderingContext2D,x:number,y:number) {
  for(let i=0;i<4;i++){ellipse(ctx,x+i*24,y+(i%2)*13,17,12,'#607a6328');ellipse(ctx,x+i*24,y-3+(i%2)*13,14,10,i%2?'#b5b8a0':'#d7d1b4');}
}
function park(ctx:CanvasRenderingContext2D) {
  ctx.fillStyle='#8eb67c';ctx.fillRect(0,0,1920,1080);
  const gradient=ctx.createLinearGradient(0,0,0,1080);gradient.addColorStop(0,'#c1d49c');gradient.addColorStop(1,'#88ac73');ctx.fillStyle=gradient;ctx.fillRect(0,0,1920,1080);
  const random=seedRandom(7342);
  for(let i=0;i<1500;i++){const x=random()*1920,y=random()*1080;line(ctx,{x,y},{x:x+4,y:y-2},i%3?'#6b99551a':'#f6f3ce26',1);}
  ctx.strokeStyle='#d0c298';ctx.lineWidth=78;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-40,1050);ctx.bezierCurveTo(210,940,210,870,130,650);ctx.bezierCurveTo(10,310,170,190,550,150);ctx.stroke();
  ctx.strokeStyle='#e0d2a9';ctx.lineWidth=58;ctx.stroke();
  ctx.beginPath();ctx.moveTo(1580,-30);ctx.bezierCurveTo(1680,220,1810,220,1815,450);ctx.bezierCurveTo(1780,700,1800,900,1950,1020);ctx.stroke();
  for(const [x,y,s,v] of [[50,70,76,0],[185,48,60,1],[58,245,65,0],[1800,70,70,1],[1880,260,58,0],[1870,880,72,1],[1760,1030,68,0],[87,1030,75,1],[300,1027,56,0],[1640,55,44,0],[560,60,44,1]] as number[][])tree(ctx,x,y,s,v);
  for(const [x,y] of [[300,160],[1490,120],[390,940],[1590,930],[1875,650],[60,700]])flowers(ctx,x,y,x+y);
  stones(ctx,1450,940);stones(ctx,260,130);
}
function rail(ctx:CanvasRenderingContext2D,a:Point,b:Point,castle=false) {
  line(ctx,{x:a.x+4,y:a.y+9},{x:b.x+4,y:b.y+9},'#294b3738',24);
  line(ctx,a,b,castle?'#66766e':'#825131',22);
  line(ctx,{x:a.x,y:a.y-3},{x:b.x,y:b.y-3},castle?'#bdc5af':'#c58d51',14);
  line(ctx,{x:a.x,y:a.y-7},{x:b.x,y:b.y-7},castle?'#edf0d4':'#e7ba77',3);
  const length=Math.hypot(b.x-a.x,b.y-a.y),nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
  for(let d=28;d<length;d+=90){const x=a.x+(b.x-a.x)*d/length,y=a.y+(b.y-a.y)*d/length;line(ctx,{x:x+nx*7,y:y+ny*7},{x:x-nx*7,y:y-ny*7},castle?'#84928a':'#9d673b',2);disk(ctx,x,y-3,2,castle?'#697a70':'#795035');}
}
function bridge(ctx:CanvasRenderingContext2D,r:Bridge) {
  const outline=bridgeOutline(r),path=r.centerline??[{x:r.x,y:r.y+r.h/2},{x:r.x+r.w,y:r.y+r.h/2}];
  polygon(ctx,outline.map(p=>({x:p.x+4,y:p.y+10})));ctx.fillStyle='#173e3940';ctx.fill();
  polygon(ctx,outline);ctx.fillStyle='#a5663b';ctx.fill();
  ctx.save();polygon(ctx,outline);ctx.clip();
  const reach=Math.hypot(r.w,r.h);let travelled=0,nextPlank=10,plank=0;
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.y-a.y);if(length<.001)continue;
    const dx=(b.x-a.x)/length,dy=(b.y-a.y)/length,nx=-dy,ny=dx;
    while(nextPlank<=travelled+length){
      const d=nextPlank-travelled,p={x:a.x+dx*d,y:a.y+dy*d};
      const from={x:p.x-nx*reach,y:p.y-ny*reach},to={x:p.x+nx*reach,y:p.y+ny*reach};
      line(ctx,from,to,plank++%3?'#cf965a':'#dbab6c',19);
      line(ctx,from,to,'#9c6b3e3c',2);nextPlank+=22;
    }
    travelled+=length;
  }
  ctx.restore();
  // Thin timber edges mark the exact deck, not a raised wall. Shots can roll off.
  polygon(ctx,outline);ctx.strokeStyle='#754d34';ctx.lineWidth=4;ctx.stroke();
  for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length];
    if(b.x>a.x)line(ctx,a,b,'#efd19a',3);
  }
}
function boulder(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,hill=false) {
  ellipse(ctx,x+8,y+13,r,r*.92,'#274d3b35');disk(ctx,x,y,r,hill?'#4e8253':'#7b8875');
  polygon(ctx,[{x:x-r*.92,y:y-r*.18},{x:x-r*.5,y:y-r*.78},{x:x+r*.26,y:y-r*.91},{x:x+r*.86,y:y-r*.26},{x:x+r*.5,y:y+r*.24},{x:x-r*.3,y:y+r*.44}]);ctx.fillStyle=hill?'#79a96b':'#b0b69d';ctx.fill();
  polygon(ctx,[{x:x-r*.5,y:y-r*.78},{x:x+r*.26,y:y-r*.91},{x:x+r*.12,y:y-r*.2},{x:x-r*.4,y:y+r*.1}]);ctx.fillStyle=hill?'#a3c480':'#d1d1b6';ctx.fill();
  line(ctx,{x:x-r*.15,y:y+r*.6},{x:x+r*.38,y:y+r*.45},hill?'#3f704b':'#697967',4);
  if(hill){tree(ctx,x+15,y-26,r*.44);flowers(ctx,x-r*.25,y+r*.6,123);}
}
function tunnelMouth(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,exit=false,direction:Point={x:1,y:0}) {
  ellipse(ctx,x+6,y+9,r+10,r+8,'#274b3f42');disk(ctx,x,y,r+10,'#bec4a8');disk(ctx,x,y,r+5,'#778673');disk(ctx,x,y,r,exit?'#375a47':'#183d36');
  ctx.strokeStyle='#dce0c3';ctx.lineWidth=6;ctx.beginPath();ctx.arc(x,y,r+7,Math.PI*.9,Math.PI*1.9);ctx.stroke();
  ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(direction.y,direction.x));
  line(ctx,{x:-8,y:-10},{x:5,y:0},'#b0c8a0',3);line(ctx,{x:5,y:0},{x:-8,y:10},'#b0c8a0',3);ctx.restore();
}
function staticCourse(ctx:CanvasRenderingContext2D,hole:Hole) {
  park(ctx);
  polygon(ctx,hole.outline);ctx.strokeStyle='#4f814f';ctx.lineJoin='round';ctx.lineWidth=64;ctx.stroke();
  polygon(ctx,hole.outline);ctx.fillStyle='#70a662';ctx.fill();
  ctx.save();polygon(ctx,hole.outline);ctx.clip();
  for(let x=140;x<1800;x+=160){ctx.fillStyle='#8ab976';ctx.fillRect(x,200,80,700);}
  const random=seedRandom(hole.id*321);
  for(let i=0;i<2400;i++){const x=220+random()*1480,y=220+random()*640;line(ctx,{x,y},{x:x+3,y:y-2},i%4?'#3e7b3a14':'#e3edb82b',1);}
  // A lightly dotted tee patch looks like a starting mat, without a permanent UI panel.
  ellipse(ctx,hole.tee.x,hole.tee.y,62,45,'#5c965f');
  for(let i=-2;i<=2;i++)for(let j=-1;j<=1;j++)disk(ctx,hole.tee.x+i*14,hole.tee.y+j*14,2,'#abd18b');
  for(const water of hole.water){
    const g=ctx.createLinearGradient(water.x,water.y,water.x+water.w,water.y);g.addColorStop(0,'#3a9b98');g.addColorStop(.15,'#63c7be');g.addColorStop(.55,'#82d9c7');g.addColorStop(1,'#369c98');ctx.fillStyle=g;ctx.fillRect(water.x,water.y,water.w,water.h);
    line(ctx,{x:water.x+4,y:water.y},{x:water.x+4,y:water.y+water.h},'#bdedd6',5);
    line(ctx,{x:water.x+water.w-4,y:water.y},{x:water.x+water.w-4,y:water.y+water.h},'#b4dfc0',4);
  }
  for(const sand of hole.sand){
    roundRect(ctx,sand.x,sand.y,sand.w,sand.h,0);ctx.fillStyle='#ccb87e';ctx.fill();ctx.fillStyle='#e4d299';ctx.fillRect(sand.x+5,sand.y+5,sand.w-10,sand.h-10);
    for(let y=sand.y+16;y<sand.y+sand.h-8;y+=18){line(ctx,{x:sand.x+15,y},{x:sand.x+sand.w-15,y:y-3},'#bfab7450',2);}
  }
  for(const slope of hole.slopes){
    const g=ctx.createLinearGradient(slope.x,0,slope.x+slope.w,0);g.addColorStop(0,slope.ax<0?'#639e5d':'#b2cf88');g.addColorStop(1,slope.ax<0?'#b2cf88':'#639e5d');ctx.fillStyle=g;ctx.fillRect(slope.x,slope.y,slope.w,slope.h);
    line(ctx,{x:slope.x,y:slope.y},{x:slope.x+slope.w,y:slope.y},'#d3e5ac',4);line(ctx,{x:slope.x,y:slope.y+slope.h},{x:slope.x+slope.w,y:slope.y+slope.h},'#47774e',4);
    for(let x=slope.x+40;x<slope.x+slope.w;x+=80){ctx.strokeStyle='#edf0bf80';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x-10,slope.y+slope.h/2-18);ctx.lineTo(x+10,slope.y+slope.h/2);ctx.lineTo(x-10,slope.y+slope.h/2+18);ctx.stroke();}
  }
  if(hole.id===6){
    // A mowing stripe shows the gentle route below the actual slope bounds. It is
    // ordinary grass, without rails or an implied extra collision surface.
    ctx.strokeStyle='#a4c68166';ctx.lineWidth=62;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(500,560);ctx.quadraticCurveTo(525,640,575,700);
    ctx.lineTo(760,760);ctx.lineTo(940,700);ctx.lineTo(1130,760);ctx.lineTo(1300,700);
    ctx.quadraticCurveTo(1380,660,1450,540);ctx.stroke();
  }
  hole.bridges.forEach(r=>bridge(ctx,r));
  ctx.restore();
  for(let i=0;i<hole.walls.length;i++)rail(ctx,hole.walls[i].a,hole.walls[i].b,hole.id===9&&i>=hole.outline.length);
  for(const b of hole.bumpers)boulder(ctx,b.x,b.y,b.r,hole.id===5);
  for(const tunnel of hole.tunnels){
    ctx.save();ctx.setLineDash([5,12]);line(ctx,tunnel.entry,tunnel.exit,'#f5edbc55',3);ctx.restore();
    tunnelMouth(ctx,tunnel.entry.x,tunnel.entry.y,tunnel.entry.r);tunnelMouth(ctx,tunnel.exit.x,tunnel.exit.y,tunnel.entry.r*.8,true,tunnel.direction);
  }
  // The flag is behind the ball; its cup exactly matches the simulation's radius.
  ellipse(ctx,hole.cup.x+3,hole.cup.y+5,hole.cup.r+6,hole.cup.r+5,'#436f493a');
  disk(ctx,hole.cup.x,hole.cup.y,hole.cup.r+4,'#e3e7be');disk(ctx,hole.cup.x,hole.cup.y,hole.cup.r,'#173e33');disk(ctx,hole.cup.x,hole.cup.y+5,hole.cup.r-6,'#0f2c26');
  line(ctx,{x:hole.cup.x+4,y:hole.cup.y-4},{x:hole.cup.x+4,y:hole.cup.y-137},'#fff9df',5);
  polygon(ctx,[{x:hole.cup.x+5,y:hole.cup.y-136},{x:hole.cup.x+89,y:hole.cup.y-106},{x:hole.cup.x+5,y:hole.cup.y-76}]);ctx.fillStyle='#e9a15c';ctx.fill();
  text(ctx,String(hole.id),hole.cup.x+27,hole.cup.y-106,48,'#613f2c');
}
function waterMotion(ctx:CanvasRenderingContext2D,hole:Hole,time:number) {
  ctx.save();polygon(ctx,hole.outline);ctx.clip();
  // Keep animated ripples off the same polygons used for ball support and deck art.
  ctx.beginPath();ctx.rect(0,0,1920,1080);
  for(const bridge of hole.bridges){const outline=bridgeOutline(bridge);outline.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();}
  ctx.clip('evenodd');
  for(const r of hole.water)for(let row=0;row<12;row++){
    const y=r.y+((row*58+time*22)%r.h),x=r.x+22+(row%3)*(Math.max(10,r.w-70)/3);
    if(hole.bridges.some(b=>pointInBridge({x:x+20,y},b)||pointInBridge({x:x-20,y},b)))continue;
    ctx.strokeStyle=row%2?'#d7f1d777':'#318d8933';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-14,y);ctx.quadraticCurveTo(x,y-6,x+14,y);ctx.stroke();
  }
  ctx.restore();
}
function windmill(ctx:CanvasRenderingContext2D,x:number,y:number,scale:number,angle:number) {
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  ellipse(ctx,12,45,57,29,'#234a3530');polygon(ctx,[{x:-31,y:49},{x:-22,y:-36},{x:23,y:-36},{x:33,y:49}]);ctx.fillStyle='#f1d3a2';ctx.fill();
  polygon(ctx,[{x:-38,y:-36},{x:0,y:-65},{x:38,y:-36}]);ctx.fillStyle='#b55e47';ctx.fill();
  ctx.fillStyle='#95654a';roundRect(ctx,-12,23,24,28,10);ctx.fill();
  for(let i=0;i<4;i++){
    ctx.save();ctx.rotate(angle+i*Math.PI/2);line(ctx,{x:0,y:0},{x:0,y:-86},'#7a5940',7);
    polygon(ctx,[{x:-8,y:-25},{x:19,y:-31},{x:24,y:-82},{x:-8,y:-84}]);ctx.fillStyle='#faf0ce';ctx.fill();ctx.strokeStyle='#ba9b68';ctx.lineWidth=2;ctx.stroke();
    for(let j=0;j<4;j++)line(ctx,{x:-5,y:-35-j*12},{x:20,y:-35-j*12},'#c8b17e',2);ctx.restore();
  }
  disk(ctx,0,0,11,'#825538');disk(ctx,-2,-3,6,'#d8ad6e');ctx.restore();
}
function castleTower(ctx:CanvasRenderingContext2D,x:number,y:number) {
  ellipse(ctx,x+8,y+22,46,33,'#183c3335');ctx.fillStyle='#7a8d81';roundRect(ctx,x-38,y-34,76,76,12);ctx.fill();ctx.fillStyle='#bcc5ad';roundRect(ctx,x-38,y-45,76,76,8);ctx.fill();
  for(let i=-1;i<=1;i++){ctx.fillStyle='#dce1c5';ctx.fillRect(x+i*25-10,y-58,20,23);}
  ctx.fillStyle='#425f51';roundRect(ctx,x-10,y-16,20,28,8);ctx.fill();line(ctx,{x:x-29,y:y+20},{x:x+29,y:y+20},'#8c9e8f',3);
}
function gate(ctx:CanvasRenderingContext2D,g:Gate,time:number) {
  const open=gateIsOpen(g,time),mid={x:(g.a.x+g.b.x)/2,y:(g.a.y+g.b.y)/2};
  if(g.kind==='windmill')windmill(ctx,g.a.x,g.a.y-111,1,time*TAU/g.period);
  else {castleTower(ctx,g.a.x,g.a.y-62);castleTower(ctx,g.b.x,g.b.y+55);}
  if(!open){
    line(ctx,g.a,g.b,g.kind==='castle'?'#70533e':'#a66b38',19);line(ctx,{x:g.a.x-4,y:g.a.y},{x:g.b.x-4,y:g.b.y},'#edd39b',5);
    const length=Math.hypot(g.b.x-g.a.x,g.b.y-g.a.y);for(let d=15;d<length;d+=30){const t=d/length;disk(ctx,g.a.x+(g.b.x-g.a.x)*t,g.a.y+(g.b.y-g.a.y)*t,3,'#6b4e37');}
  } else {
    ctx.save();ctx.setLineDash([4,12]);line(ctx,g.a,g.b,'#eff9bc80',3);ctx.restore();
  }
  disk(ctx,mid.x+27,mid.y,11,open?'#d8f1a3':'#e4a667');disk(ctx,mid.x+25,mid.y-3,4,'#fff5d8');
}
function button(ctx:CanvasRenderingContext2D,box:Box,label:string,primary=false,disabled=false) {
  ctx.save();ctx.globalAlpha=disabled?.45:1;
  roundRect(ctx,box.x,box.y+8,box.width,box.height,24);ctx.fillStyle=primary?'#163e32':'#6e775047';ctx.fill();
  roundRect(ctx,box.x,box.y,box.width,box.height,24);ctx.fillStyle=primary?'#275e41':PAPER;ctx.fill();ctx.strokeStyle=primary?'#5d8a5b':'#b6b88a';ctx.lineWidth=3;ctx.stroke();
  text(ctx,label,box.x+box.width/2,box.y+box.height/2,48,primary?PAPER:INK);ctx.restore();
}
function picture(ctx:CanvasRenderingContext2D,glyph:number,x:number,y:number,w:number,h:number) {
  const image=images.get(glyph);if(!image)return;
  const ratio=Math.min(w/image.naturalWidth,h/image.naturalHeight);ctx.drawImage(image,x+(w-image.naturalWidth*ratio)/2,y+(h-image.naturalHeight*ratio)/2,image.naturalWidth*ratio,image.naturalHeight*ratio);
}
function titleWorld(ctx:CanvasRenderingContext2D) {
  park(ctx);
  // Authored miniature-course cover: a quiet central lawn framed by a looping river and golf landmarks.
  ctx.strokeStyle='#437f63';ctx.lineWidth=210;ctx.beginPath();ctx.moveTo(-60,760);ctx.bezierCurveTo(220,690,270,1100,520,965);ctx.bezierCurveTo(720,810,1220,1000,1500,870);ctx.bezierCurveTo(1840,710,1660,250,1970,320);ctx.stroke();
  ctx.strokeStyle='#55b4ad';ctx.lineWidth=176;ctx.stroke();ctx.strokeStyle='#91d8c4';ctx.lineWidth=110;ctx.stroke();
  ellipse(ctx,960,430,590,360,'#669c5c');ellipse(ctx,960,415,570,335,'#85b56f');
  const random=seedRandom(283);for(let i=0;i<850;i++){const x=400+random()*1120,y=100+random()*650; if(((x-960)/565)**2+((y-415)/330)**2>1)continue;disk(ctx,x,y,1.5,i%3?'#acd18c33':'#467c5033');}
  bridge(ctx,{x:220,y:710,w:260,h:112});bridge(ctx,{x:1510,y:645,w:290,h:110});
  boulder(ctx,1550,340,120,true);tree(ctx,1475,205,65);tree(ctx,1640,225,50);flowers(ctx,1670,475,432);
  castleTower(ctx,330,480);castleTower(ctx,490,480);line(ctx,{x:350,y:490},{x:470,y:490},'#bdc5ad',36);line(ctx,{x:350,y:478},{x:470,y:478},'#e0e1ba',6);
  disk(ctx,1510,810,34,'#244636');line(ctx,{x:1510,y:810},{x:1510,y:650},PAPER,6);polygon(ctx,[{x:1510,y:650},{x:1592,y:677},{x:1510,y:703}]);ctx.fillStyle='#db8955';ctx.fill();
  disk(ctx,1455,840,21,'#fff9df');disk(ctx,1448,832,7,'#fffefa');
  for(const [x,y]of [[230,350],[490,620],[1340,200],[1360,950]])flowers(ctx,x,y,x+y);
}
function titleScreen(ctx:CanvasRenderingContext2D,s:RenderState) {
  titleBackdrop??=bake(titleWorld);ctx.drawImage(titleBackdrop,0,0);
  windmill(ctx,370,255,1.75,s.now/2600);
  text(ctx,'A LITTLE COURSE. A BIG ADVENTURE.',960,190,32,'#365c3f');
  ctx.save();ctx.letterSpacing='4px';drawTitle(ctx,{x:300,y:200,width:1320,height:410},{ink:PAPER});ctx.restore();
  text(ctx,'9 holes  ·  1–4 golfers  ·  Board Sports',960,608,40,INK);
  button(ctx,BUTTONS.play,'LET’S PLAY',true);button(ctx,BUTTONS.help,'HOW TO PUTT');
  if(s.hasSave)button(ctx,BUTTONS.continue,'CONTINUE');
  picture(ctx,1,1430,450,250,260);picture(ctx,5,220,530,230,270);
  text(ctx,'Or place your Sports piece',960,1008,32,'#234b3c');
}
function setupScreen(ctx:CanvasRenderingContext2D,s:RenderState) {
  titleBackdrop??=bake(titleWorld);ctx.drawImage(titleBackdrop,0,0);ctx.fillStyle='#dbe7bcdd';ctx.fillRect(0,0,1920,1080);
  text(ctx,'WHO’S ON THE GREEN?',960,116,72);
  text(ctx,'Choose players. Place each Sports piece at an edge.',960,200,40);
  for(let i=0;i<4;i++){
    const seat=s.seats[i],x=170+i*410,y=290;
    roundRect(ctx,x+4,y+8,350,350,30);ctx.fillStyle='#426c4133';ctx.fill();roundRect(ctx,x,y,350,350,30);ctx.fillStyle=seat?'#fff6dc':'#c1d4a7';ctx.fill();ctx.strokeStyle=seat&&seat.present?'#5f9255':'#91ad7c';ctx.lineWidth=3;ctx.stroke();
    if(seat){
      picture(ctx,seat.glyphId??i+1,x+80,y+22,190,220);
      disk(ctx,x+305,y+45,17,seat.present?'#4d8c55':'#b6be92');
      text(ctx,nameLabel(ctx,seat.name,i,40,310),x+175,y+260,40);
      text(ctx,seat.present?'READY':'PLACE AT YOUR EDGE',x+175,y+312,32,seat.present?'#4f8151':'#7c8960');
    }else{
      text(ctx,'+',x+175,y+130,72,'#92aa7f');text(ctx,'OPEN SPOT',x+175,y+265,32,'#6d8d66');
    }
  }
  button(ctx,BUTTONS.addPlayer,s.seats.length>=4?'FOUR GOLFERS READY':'ADD A GOLFER',false,s.seats.length>=4);
  button(ctx,BUTTONS.start,'TEE OFF',true,!s.canStart);button(ctx,BUTTONS.back,'BACK');
  if(s.message)text(ctx,s.message,960,1012,32);
  for(const seat of s.seats){if(!seat.present)continue;const edge=seat.edge;const p=edge==='bottom'?{x:960,y:1032}:edge==='top'?{x:960,y:48}:edge==='left'?{x:48,y:540}:{x:1872,y:540};ctx.save();ctx.translate(p.x,p.y);ctx.rotate(edgeAngle(edge));ctx.fillStyle='#397c48';roundRect(ctx,-80,-10,160,10,5);ctx.fill();ctx.restore();}
}
function ball(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,index:number,alpha=1) {
  ctx.save();ctx.globalAlpha=alpha;ellipse(ctx,x+4,y+6,r+2,r*.8,'#1a473b40');disk(ctx,x,y,r,PLAYER_COLORS[index%4]);
  ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.clip();ctx.strokeStyle=index===0?'#c9c9a4':'#fff9df';ctx.lineWidth=3;
  if(index===1){line(ctx,{x:x-r,y:y-r},{x:x+r,y:y+r},'#fff7dc',4);line(ctx,{x:x-r,y:y+r},{x:x+r,y:y-r},'#fff7dc',4);}
  else if(index===2){line(ctx,{x:x-r,y},{x:x+r,y},'#fff7dc',5);}
  else if(index===3){for(let i=0;i<3;i++)disk(ctx,x-8+i*8,y,2.5,'#fff7dc');}
  else{for(let i=0;i<4;i++)disk(ctx,x-5+(i%2)*8,y-3+Math.floor(i/2)*7,1.3,'#bfc3a0');}
  ctx.restore();ctx.strokeStyle='#2f59494d';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();disk(ctx,x-r*.3,y-r*.35,r*.26,'#ffffffaa');ctx.restore();
}
function seatHud(ctx:CanvasRenderingContext2D,s:RenderState,seat:RenderSeat,index:number,summary=false) {
  const round=s.round,player=round?.players.find(p=>p.id===seat.id),active=round?.phase==='aim'&&activePlayer(round).id===seat.id;
  const edge=seat.edge,at=edge==='bottom'?{x:960,y:1006}:edge==='top'?{x:960,y:74}:edge==='left'?{x:74,y:540}:{x:1846,y:540};
  ctx.save();ctx.translate(at.x,at.y);ctx.rotate(edgeAngle(edge));
  roundRect(ctx,-330,-144,660,170,24);ctx.fillStyle=active?'#fff3d7':'#f0ebceee';ctx.fill();ctx.strokeStyle=active?'#d59956':'#829e6e';ctx.lineWidth=active?4:2;ctx.stroke();
  ball(ctx,-285,-63,18,index);
  text(ctx,nameLabel(ctx,seat.name,index,48,255),-240,-63,48,INK,'left');
  if(player&&round){
    const strokes=player.scores[round.holeIndex],total=player.scores.reduce((a,b)=>a+b,0);
    text(ctx,summary?String(total):`${strokes} / 7`,238,-63,48,INK);
    const instructions:Record<string,string>={place:'TWIST TO PUTT',settling:'TWIST TO PUTT',clear:'TWIST TO PUTT',ready:'TWIST TO PUTT',swing:'TWIST TO PUTT'};
    const sameMissing=s.seats.filter(other=>!other.present&&other.glyphId===seat.glyphId).length;
    const returnCue=seat.glyphId!==null&&sameMissing>=2?'RETURN AT YOUR EDGE':'RETURN YOUR PIECE';
    const notices:Record<string,string>={'Round restored. Return your Sports piece.':returnCue,'Sports piece data could not load. Restart the game.':'RESTART TO LOAD PIECES'};
    const cue=summary?(winners(round).includes(seat.id)?'WINNER':'NICE ROUND'):(active?(seat.present?((notices[s.message]??s.message)||(instructions[s.club?.status??'place']??'YOUR PUTT')):returnCue):(player.finished?(player.pickedUp[round.holeIndex]?'PICKED UP':'IN THE CUP'):'TOTAL '+total));
    text(ctx,cue,0,-113,48,active?'#a26639':'#62805c');
    if(!summary)text(ctx,`HOLE ${round.holeIndex+1} · PAR ${currentHole(round).par}`,0,-10,48,'#55764e');
  }else text(ctx,seat.present?'READY':'PLACE YOUR PIECE',160,-63,48);
  ctx.restore();
}
function playScreen(ctx:CanvasRenderingContext2D,s:RenderState) {
  if(!s.round)return;const round=s.round,hole=currentHole(round);
  if(backdrop?.key!==hole.id)backdrop={key:hole.id,canvas:bake(c=>staticCourse(c,hole))};ctx.drawImage(backdrop.canvas,0,0);
  waterMotion(ctx,hole,round.time);hole.gates.forEach(g=>gate(ctx,g,round.time));
  // The hole name is a small wooden course sign; personal hole/par cues repeat at every seat.
  if(!s.seats.some(seat=>seat.edge==='top')){roundRect(ctx,590,170,740,64,16);ctx.fillStyle='#f3e8c4';ctx.fill();text(ctx,hole.name,960,202,48);}
  const active=activePlayer(round);
  const ordered=round.players.map((p,index)=>({p,index})).sort((a,b)=>Number(a.p.id===active.id)-Number(b.p.id===active.id));
  for(const {p,index} of ordered){if(p.finished||p.ball.state==='sunk')continue;const b=p.ball,isActive=p.id===active.id;
    if(isActive&&round.phase==='aim'&&b.state==='ready'){ctx.strokeStyle='#fff6cf';ctx.lineWidth=3;ctx.setLineDash([3,8]);ctx.beginPath();ctx.arc(b.x,b.y,27+Math.sin(s.now/280)*2,0,TAU);ctx.stroke();ctx.setLineDash([]);}
    if(b.state==='moving'&&Math.hypot(b.vx,b.vy)>1){const speed=Math.hypot(b.vx,b.vy);for(let i=5;i>0;i--)disk(ctx,b.x-b.vx/speed*i*9,b.y-b.vy/speed*i*9,Math.max(2,10-i),i%2?'#fff6cf33':'#fff6cf55');}
    const inPlay=(isActive||p.scores[round.holeIndex]>0)&&!round.settledForShot?.includes(p.id);
    ball(ctx,b.x,b.y,b.r,index,inPlay?1:.4);
  }
  if(s.club){
    const c=s.club,rad=c.facingDeg*Math.PI/180,end={x:c.x+Math.cos(rad)*240,y:c.y+Math.sin(rad)*240};
    line(ctx,c.start,end,'#183e3c5c',10);line(ctx,c.start,end,'#fff6ce',6);disk(ctx,end.x,end.y,4,'#fff8db');
  }
  for(const e of s.effects){const life=Math.max(0,1-e.age/1.1);if(!life)continue;ctx.save();ctx.globalAlpha=life;
    if(e.kind==='water'){for(let i=0;i<3;i++){ctx.strokeStyle='#eff6d8';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(e.x,e.y,18+e.age*100+i*12,8+e.age*48+i*5,0,0,TAU);ctx.stroke();}}
    else if(e.kind==='sink'){for(let i=0;i<14;i++){const a=i*TAU/14;disk(ctx,e.x+Math.cos(a)*e.age*140,e.y+Math.sin(a)*e.age*110-e.age*30,4+life*3,i%2?'#fff4bc':e.color);} }
    else{for(let i=0;i<7;i++){const a=i*TAU/7;line(ctx,{x:e.x+Math.cos(a)*16,y:e.y+Math.sin(a)*16},{x:e.x+Math.cos(a)*(16+e.age*85),y:e.y+Math.sin(a)*(16+e.age*85)},e.color,3);}}
    ctx.restore();
  }
  s.seats.forEach((seat,i)=>seatHud(ctx,s,seat,i));
  if(round.phase==='hole-complete'){
    roundRect(ctx,680,395,560,220,32);ctx.fillStyle='#fff3dcee';ctx.fill();text(ctx,'HOLE COMPLETE',960,465,48);text(ctx,'Next green…',960,545,48,'#5b7954');
  }
}
function helpScreen(ctx:CanvasRenderingContext2D,s:RenderState) {
  titleBackdrop??=bake(titleWorld);ctx.drawImage(titleBackdrop,0,0);ctx.fillStyle='#dce9bfeb';ctx.fillRect(0,0,1920,1080);
  const step=((s.helpStep%4)+4)%4;
  const headings=['PLACE BESIDE THE BALL','SWEEP THROUGH THE BALL','TWIST TO CONTROL POWER','FEWEST STROKES WINS'];
  const captions=['Your piece can stand on the scenery.','The line is ready right away.','Faster twist. Stronger putt.','Take one shot each. You can bump other balls.'];
  text(ctx,'HOW TO PUTT',960,110,64);text(ctx,`${step+1} / 4`,960,179,32,'#608357');
  roundRect(ctx,330,250,1260,540,36);ctx.fillStyle='#78a768';ctx.fill();ctx.strokeStyle='#a6c489';ctx.lineWidth=8;ctx.stroke();
  picture(ctx,1,390,350,250,290);text(ctx,'BOARD SPORTS',515,693,32,'#eff3cf');
  const pivot={x:820,y:440},target={x:1000,y:440},cycle=(s.now%2800)/2800;
  let angle=step===0?-20:step===1?-35:step===2?-35+Math.min(1,Math.max(0,(cycle-.25)/.35))*80:10;
  const rad=angle*Math.PI/180;
  // Help is a diagram of the real line and ball. The equipment photo remains upright.
  disk(ctx,pivot.x,pivot.y,18,'#f4eac0');text(ctx,'↻',pivot.x,pivot.y+80,64,'#f7f0ce');
  line(ctx,{x:pivot.x+Math.cos(rad)*60,y:pivot.y+Math.sin(rad)*60},{x:pivot.x+Math.cos(rad)*240,y:pivot.y+Math.sin(rad)*240},'#fff3bf',6);
  let by=target.y;if(step===2&&cycle>.56)by+=Math.min(200,(cycle-.56)*550);if(step===3)by+=Math.min(200,cycle*280);
  ball(ctx,target.x,by,18,0);
  disk(ctx,1000,670,29,'#173c31');line(ctx,{x:1003,y:670},{x:1003,y:578},PAPER,4);polygon(ctx,[{x:1003,y:578},{x:1051,y:596},{x:1003,y:613}]);ctx.fillStyle='#e9a15c';ctx.fill();
  ctx.save();ctx.setLineDash([7,10]);line(ctx,{x:1040,y:475},{x:1040,y:600},'#f5f0c8b0',3);ctx.restore();polygon(ctx,[{x:1029,y:590},{x:1040,y:609},{x:1051,y:590}]);ctx.fillStyle='#f7eec5';ctx.fill();
  text(ctx,'The ball follows the sweep',1260,472,32,'#eef2d0');text(ctx,'↘',1230,535,64,'#eef2d0');
  text(ctx,headings[step],960,825,48);text(ctx,captions[step],960,878,32);
  button(ctx,BUTTONS.back,'BACK');button(ctx,BUTTONS.next,step===3?'GOT IT':'NEXT',true);
}
function resultScreen(ctx:CanvasRenderingContext2D,s:RenderState) {
  titleBackdrop??=bake(titleWorld);ctx.drawImage(titleBackdrop,0,0);ctx.fillStyle='#dfe9c4e8';ctx.fillRect(0,0,1920,1080);
  const round=s.round;if(!round)return;const winning=winners(round);
  text(ctx,winning.length>1?'A SHARED VICTORY':'A GRAND FINISH',960,94,64);
  text(ctx,winnerNames(ctx,s.seats,winning),960,165,48,'#51784c');
  roundRect(ctx,270,237,1380,540,30);ctx.fillStyle=PAPER;ctx.fill();ctx.strokeStyle='#a4b17f';ctx.lineWidth=3;ctx.stroke();
  text(ctx,'GOLFER',320,293,32,INK,'left');for(let h=0;h<9;h++)text(ctx,String(h+1),735+h*80,293,32);text(ctx,'TOTAL',1535,293,32);
  line(ctx,{x:300,y:330},{x:1620,y:330},'#cdd1a6',2);
  text(ctx,'PAR',320,367,32,'#71845d','left');HOLES.forEach((h,i)=>text(ctx,String(h.par),735+i*80,367,32,'#71845d'));text(ctx,'27',1535,367,32,'#71845d');
  const ys=round.players.length<=2?[475,610]:[455,543,631,719];
  round.players.forEach((p,i)=>{
    const y=ys[i],seat=s.seats.find(seat=>seat.id===p.id),win=winning.includes(p.id);
    if(win){roundRect(ctx,292,y-34,1336,68,14);ctx.fillStyle='#e7edc6';ctx.fill();}
    ball(ctx,324,y,17,i);text(ctx,nameLabel(ctx,seat?.name??'Golfer',i,40,330),360,y,40,INK,'left');
    p.scores.forEach((score,h)=>text(ctx,p.pickedUp[h]?`${score}*`:String(score),735+h*80,y,40,INK));text(ctx,String(totals(round)[i].total),1535,y,48,win?'#a36d37':INK);
  });
  text(ctx,'* Picked up at seven strokes',960,810,32,'#66805b');
  button(ctx,BUTTONS.rematch,'REMATCH',true);button(ctx,BUTTONS.setup,'CHANGE SETUP');
  // Outcome cues face the top and side seats too; the table makes one shared decision.
  for(const seat of s.seats.filter(seat=>seat.edge!=='bottom')){
    const at=seat.edge==='top'?{x:1530,y:106}:seat.edge==='left'?{x:78,y:540}:{x:1842,y:540};ctx.save();ctx.translate(at.x,at.y);ctx.rotate(edgeAngle(seat.edge));text(ctx,winning.includes(seat.id)?'YOU WIN!':'NICE ROUND',0,0,40);ctx.restore();
  }
}
export function drawGame(ctx:CanvasRenderingContext2D,state:RenderState) {
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.setLineDash([]);
  if(state.mode==='title')titleScreen(ctx,state);
  else if(state.mode==='setup')setupScreen(ctx,state);
  else if(state.mode==='help')helpScreen(ctx,state);
  else if(state.mode==='over')resultScreen(ctx,state);
  else playScreen(ctx,state);
  ctx.restore();
}
