import './style.css';
import { Board, BoardContactType, BoardContactPhase, type BoardContact } from '@board.fun/web-sdk';
import { createSurface, clientToWorld, loadTitleFont, startInput, gameFont } from './runtime';
import { loadPieceFootprints, pieceFootprint, frontPoint, type PieceFootprints } from './piece-footprints';
import { drawTitle } from './title';
import { noteContacts, seated, pickPlayer } from './seats';
import { Splashes } from './fx';
import { SwingController } from './swing';
import { PieceTracker } from './tracking';
import { HOLES } from './course';
import { createRound, currentHole, activePlayer, strike, stepRound, advanceHole } from './round';
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = createSurface(canvas), tracker = new PieceTracker(), swing = new SwingController(), splashes = new Splashes();
let footprints: PieceFootprints | null = null;
let mode = 'title', running = true, last = 0, completionAt = 0;
let round = createRound(['1']);
const contacts = new Map<number, BoardContact>();
let taps: {x:number;y:number}[] = [];
startInput((batch, active) => {
  noteContacts(batch); contacts.clear();
  for (const c of active.values()) if (c.type === BoardContactType.Glyph && c.glyphId >= 1 && c.glyphId <= 8) contacts.set(c.contactId,c);
  for (const c of batch) if(c.type === BoardContactType.Finger && c.phase === BoardContactPhase.Began) taps.push(c);
}, () => {tracker.paused(performance.now()); swing.reset(); contacts.clear();});
canvas.addEventListener('pointerdown',e=>taps.push(clientToWorld(canvas,e.clientX,e.clientY)));
const stroke = (color:string,width:number,points:{x:number;y:number}[],closed=false) => {
  if(!points.length)return;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))ctx.lineTo(p.x,p.y);if(closed)ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
};
function frame(now:number){
 if(!running)return;const dt=Math.min(.05,last?(now-last)/1000:0);last=now;
 const changes=tracker.update([...contacts.values()],now);
 for(const p of changes.arrivals){splashes.at(p.x,p.y,{inner:90,color:'#FFF2AD'});if(mode==='title')mode='setup';}
 if(changes.recovered.length)swing.reset();
 if(mode==='setup'&&taps.some(p=>p.x>600&&p.x<1320&&p.y>740)) {const roster=seated();if(roster.length){round=createRound(roster.slice(0,4).map(p=>String(p.sessionId)));mode='play';}}
 if(mode==='play'){
  const p=tracker.identities.find(p=>p.present);const ball=activePlayer(round)?.ball;
  const fp=p?pieceFootprint(footprints,p):null;
  const hit=ball&&fp?swing.update({x:p!.x,y:p!.y,facingDeg:fp.facingDeg,frontReach:Math.hypot(frontPoint(fp,6).x-p!.x,frontPoint(fp,6).y-p!.y)},ball,now,round.phase==='aim'):null;
  if(hit)strike(round,{x:hit.vx,y:hit.vy});
  const before=round.phase;stepRound(round,dt);if(before==='roll'&&round.phase!=='roll')swing.reset();
  if(round.phase==='hole-complete'){completionAt ||= now;if(now-completionAt>2000){advanceHole(round);completionAt=0;swing.reset();}}
  if(round.phase==='complete')mode='over';
 }
 ctx.fillStyle='#DDE5C2';ctx.fillRect(0,0,1920,1080);
 ctx.fillStyle='#173F2E';ctx.font=gameFont(48);ctx.textAlign='center';
 if(mode==='title'){drawTitle(ctx,{x:500,y:80,width:920,height:700},{ink:'#173F2E'});ctx.fillText('Place a Sports piece to play',960,880);}
 if(mode==='setup'){ctx.fillText('Place your Sports piece beside the ball',960,360);ctx.fillText('Twist the line through it to putt',960,450);ctx.fillStyle='#173F2E';ctx.fillRect(600,740,720,140);ctx.fillStyle='#FFF5D7';ctx.fillText('TEE OFF',960,830);}
 if(mode==='play'||mode==='over'){
  const h=currentHole(round)??HOLES[0];ctx.beginPath();ctx.moveTo(h.outline[0].x,h.outline[0].y);for(const p of h.outline.slice(1))ctx.lineTo(p.x,p.y);ctx.closePath();ctx.fillStyle='#69A868';ctx.fill();stroke('#AB784B',20,h.outline,true);
  ctx.fillStyle='#143A2B';ctx.beginPath();ctx.arc(h.cup.x,h.cup.y,h.cup.r,0,Math.PI*2);ctx.fill();
  for(const player of round.players){const b=player.ball;ctx.beginPath();ctx.arc(b.x,b.y,14,0,Math.PI*2);ctx.fillStyle='#FFF9E9';ctx.fill();}
  const p=tracker.identities.find(p=>p.present);if(p){const fp=pieceFootprint(footprints,p);if(fp)stroke('#FFF7CD',6,[frontPoint(fp,6),{x:p.x+fp.facing.x*240,y:p.y+fp.facing.y*240}]);}
  ctx.fillStyle='#173F2E';ctx.fillText(`${round.holeIndex+1} / 9   ${h.name}   PAR ${h.par}`,960,120);
  if(mode==='over')ctx.fillText('COURSE COMPLETE',960,540);
 }
 splashes.update(dt);splashes.draw(ctx);taps=[];requestAnimationFrame(frame);
}
Board.application.onPause(()=>{running=false;});
Board.application.onResume(()=>{running=true;last=0;tracker.resumed(performance.now());swing.reset();requestAnimationFrame(frame);});
void(async()=>{await BoardPlatform.state.ready();[footprints]=await Promise.all([loadPieceFootprints(),loadTitleFont()]);requestAnimationFrame(frame);})();
