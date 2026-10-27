import './style.css';
import { Board, BoardContactType, BoardContactPhase, type BoardContact, type BoardPlayer } from '@board.fun/web-sdk';
import { createSurface, clientToWorld, loadTitleFont, startInput, gameAudio, gameFont } from './runtime';
import { loadPieceFootprints, pieceFootprint, frontPoint, type PieceFootprints } from './piece-footprints';
import { noteContacts, seated, pickPlayer, selectorOpen } from './seats';
import { Splashes, nearestEdge, type Edge } from './fx';
import { SwingController } from './swing';
import { PieceTracker, type TrackedPiece } from './tracking';
import { createRound, currentHole, activePlayer, strike, stepRound, advanceHole, restoreRound, totals, type Round } from './round';
import { drawGame, loadArt, BUTTONS, type RenderSeat, type RenderState } from './render';
import { sound, ambience } from './audio';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = createSurface(canvas), tracker = new PieceTracker(), swing = new SwingController(), splashes = new Splashes();
const EDGES: Edge[] = ['bottom','top','left','right'];
type Seat = { player: BoardPlayer; edge: Edge | null; glyphId: number | null };
type Save = { schema: 1; round: Round; seats: { id:string;playerId:string;edge:Edge|null;glyphId:number|null }[] };
let seats: Seat[] = [], footprints: PieceFootprints | null = null, round: Round | null = null;
let mode: RenderState['mode'] = 'title', beforeHelp: RenderState['mode'] = 'title', helpStep = 0;
let running = true, last = 0, completionAt = 0, rosterAt = -Infinity, ambientAt = 0, savedAt = 0;
let message = '', messageUntil = 0, lastTurn = '', lastEpoch = '', saved: Save | null = null;
const contacts = new Map<number, BoardContact>();
let taps: {x:number;y:number}[] = [];
let firstFrame = true;
const effects: RenderState['effects'] = [];
const say = (text:string, seconds=3) => {message=text;messageUntil=performance.now()+seconds*1000;};
const pieceFor = (id:number) => tracker.identities.find(p=>p.owner===id&&p.present);
const canStart = () => seats.length>0 && seats.length<=4 && seats.every(s=>pieceFor(s.player.sessionId));

function syncRoster(){
 const people = seated().slice(0,4);
 if(mode==='play'||mode==='help'||mode==='over') {
  for(const s of seats){const p=people.find(p=>p.sessionId===s.player.sessionId);if(p)s.player=p;}
  return;
 }
 seats = people.map(player => seats.find(s=>s.player.sessionId===player.sessionId) ?? {player,edge:null,glyphId:null});
 for(const s of seats){const p=people.find(p=>p.sessionId===s.player.sessionId);if(p)s.player=p;}
 for(const p of tracker.identities)if(!seats.some(s=>s.player.sessionId===p.owner))p.owner=null;
}
function bind(p:TrackedPiece){
 if(p.owner!==null&&seats.some(s=>s.player.sessionId===p.owner))return;
 const missing = seats.filter(s=>s.glyphId===p.glyphId&&!pieceFor(s.player.sessionId));
 if(missing.length===1){p.owner=missing[0].player.sessionId;return;}
 const edge=nearestEdge(p.x,p.y), gap={bottom:1080-p.y,top:p.y,left:p.x,right:1920-p.x}[edge];
 // Identical pieces lifted together are intentionally ambiguous after a far return.
 // Returning one to its owner's original edge is an explicit recovery gesture.
 if(mode!=='setup'){
  const returning=gap<=240?missing.find(s=>s.edge===edge):null;
  if(returning)p.owner=returning.player.sessionId;
  return;
 }
 if(gap>300)return;
 const occupied=seats.find(s=>s.edge===edge&&pieceFor(s.player.sessionId));
 if(occupied)return;
 const s=seats.find(s=>s.edge===edge&&!pieceFor(s.player.sessionId))??seats.find(s=>s.edge===null);
 if(s){s.edge=edge;s.glyphId=p.glyphId;p.owner=s.player.sessionId;}
}
async function addPlayer(){
 if(seats.length>=4||selectorOpen())return;
 try{await pickPlayer();syncRoster();}catch{say('Player selection is unavailable. Try again.');}
}
function saveRun(){
 if(!round)return;
 saved={schema:1,round:JSON.parse(JSON.stringify(round)),seats:seats.map(s=>({id:String(s.player.sessionId),playerId:s.player.playerId,edge:s.edge,glyphId:s.glyphId}))};
 BoardPlatform.state.save(saved);
}
function readSave(){
 const value=BoardPlatform.state.load<Save>();
 const validRound=value?.schema===1?restoreRound(value.round):null;
 const validSeats=validRound&&Array.isArray(value?.seats)&&value.seats.length===validRound.players.length
  &&value.seats.every(s=>s&&typeof s.id==='string'&&typeof s.playerId==='string'
    &&(s.edge===null||EDGES.includes(s.edge))&&(s.glyphId===null||(Number.isInteger(s.glyphId)&&s.glyphId>=1&&s.glyphId<=8))
    &&validRound.players.some(p=>p.id===s.id))
  &&new Set(value.seats.map(s=>s.id)).size===value.seats.length;
 saved=validRound&&validSeats?{...value!,round:validRound}:null;
}
function continueRun(){
 if(!saved)return;
 syncRoster();const restored=restoreRound(saved.round);if(!restored)return;
 const roster=seated();
 const mapped=saved.seats.map(s=>({old:s,player:s.playerId?roster.find(p=>p.playerId===s.playerId):roster.find(p=>String(p.sessionId)===s.id)}));
 if(mapped.some(s=>!s.player)||new Set(mapped.map(s=>s.player?.sessionId)).size!==mapped.length){say('Add the saved players, then choose Continue.',8);mode='setup';return;}
 seats=mapped.map(({old,player})=>({player:player!,edge:old.edge,glyphId:old.glyphId}));
 const ids=new Map(mapped.map(({old,player})=>[old.id,String(player!.sessionId)]));
 for(const p of restored.players)p.id=ids.get(p.id)!;
 if(restored.settledForShot)restored.settledForShot=restored.settledForShot.map(id=>ids.get(id)!);
 for(const p of tracker.identities)p.owner=null;
 round=restored;mode=round.phase==='complete'?'over':'play';completionAt=0;lastTurn='';swing.reset();
 for(const p of tracker.identities.filter(p=>p.present))bind(p);
 say('Round restored. Return your Sports piece.',3);
}
function newRound(){
 if(!canStart()){say('Place one Sports piece at each player’s edge.');return;}
 round=createRound(seats.map(s=>String(s.player.sessionId)));mode='play';completionAt=0;lastTurn='';swing.reset();
 message='';saveRun();
}
function setup(){
 saveRun();mode='setup';round=null;swing.reset();completionAt=0;
 for(const p of tracker.identities)p.owner=null;
 for(const s of seats){s.edge=null;s.glyphId=null;}
 syncRoster();
}
function help(){if(mode==='help')return;beforeHelp=mode;mode='help';helpStep=0;swing.reset();saveRun();}
function closeHelp(){mode=beforeHelp;swing.reset();last=0;}

startInput((batch,active)=>{
 noteContacts(batch);contacts.clear();
 for(const c of active.values())if(c.type===BoardContactType.Glyph&&c.glyphId>=0&&c.glyphId<=8)contacts.set(c.contactId,c);
 for(const c of batch)if(c.type===BoardContactType.Finger&&c.phase===BoardContactPhase.Began)taps.push(c);
},()=>{saveRun();tracker.paused(performance.now());swing.reset();contacts.clear();taps=[];});
canvas.addEventListener('pointerdown',e=>{if(!Board.isOnDevice)taps.push(clientToWorld(canvas,e.clientX,e.clientY));});
function tapped(key:keyof typeof BUTTONS){const b=BUTTONS[key];return taps.some(p=>p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height);}
function handleUI(){
 if(mode==='title'){
  if(tapped('continue')&&saved)continueRun();else if(tapped('play')){mode='setup';syncRoster();}else if(tapped('help'))help();
 }else if(mode==='setup'){
  if(tapped('addPlayer'))void addPlayer();else if(tapped('start'))newRound();else if(tapped('back'))mode='title';
 }else if(mode==='help'){
  if(tapped('back'))closeHelp();else if(tapped('next')){if(helpStep>=3)closeHelp();else helpStep++;}
 }else if(mode==='over'){
  if(tapped('rematch')){round=createRound(seats.map(s=>String(s.player.sessionId)));mode='play';completionAt=0;lastTurn='';swing.reset();saveRun();}
  else if(tapped('setup'))setup();
 }
}
function play(now:number,dt:number):RenderState['club']{
 if(!round)return null;
 const active=activePlayer(round), p=pieceFor(Number(active.id));
 const turn=`${round.holeIndex}:${round.turnIndex}:${active.scores[round.holeIndex]}`;
 const epoch=p?`${p.id}:${p.epoch}`:'';
 if(lastTurn!==turn||lastEpoch!==epoch){swing.reset();lastTurn=turn;lastEpoch=epoch;}
 const fp=p?pieceFootprint(footprints,p):null, front=fp?frontPoint(fp,6):null;
 const pose=p&&fp&&front?{x:p.x,y:p.y,facingDeg:fp.facingDeg,frontReach:Math.hypot(front.x-p.x,front.y-p.y)}:null;
 const hit=swing.update(pose,active.ball,now,round.phase==='aim');
 if(hit&&strike(round,{x:hit.vx,y:hit.vy})){
  console.info('[twist-putt] stroke '+JSON.stringify({hole:round.holeIndex+1,seat:round.turnIndex+1,twist:Math.round(hit.angularSpeed),speed:Math.round(hit.speed)}));
  sound('putt');effects.push({x:active.ball.x,y:active.ball.y,kind:'putt',age:0,color:'#FFF3BF'});saveRun();
 }
 const events=stepRound(round,dt);
 for(const event of events){
  if(['sink','water','bounce','tunnel'].includes(event.type)){sound(event.type,event.strength);effects.push({x:event.x,y:event.y,kind:event.type,age:0,color:event.type==='water'?'#8EE3DF':'#FFF0A6'});}
  if(event.type==='turn'){swing.reset();sound('turn');}
  if(event.type==='water')say('Splash! +1 stroke',2.4);
  if(event.type==='sink')say('In the cup!',2.4);
  if(event.type==='complete'){mode='over';sound('complete');BoardPlatform.state.progress.set('best',Math.min(BoardPlatform.state.progress.get('best',999),...totals(round).map(s=>s.total)));}
 }
 if(events.length)saveRun();
 if(round.phase==='roll'&&now-savedAt>1000){savedAt=now;saveRun();}
 if(round.phase==='hole-complete'){
  completionAt ||= now;
  if(now-completionAt>2600){advanceHole(round);completionAt=0;swing.reset();lastTurn='';message='';saveRun();}
 }
 if(round.phase==='complete'&&mode==='play')mode='over';
 return p&&fp&&front?{x:p.x,y:p.y,facingDeg:fp.facingDeg,start:front,status:swing.status}:null;
}
function renderSeats():RenderSeat[]{return seats.map((s,i)=>({id:String(s.player.sessionId),name:s.player.name,edge:s.edge??EDGES[i],glyphId:s.glyphId,present:!!pieceFor(s.player.sessionId)}));}
function frame(now:number){
 if(!running)return;
 if(firstFrame){firstFrame=false;console.info('[twist-putt] first frame '+JSON.stringify({hidden:document.hidden,canvas:canvas.getBoundingClientRect().width}));}
 const dt=Math.min(.05,last?(now-last)/1000:0);last=now;
 const changes=tracker.update([...contacts.values()],now);
 if(mode==='title'&&changes.arrivals.length){mode='setup';syncRoster();}
 for(const p of changes.arrivals){console.info('[twist-putt] Sports glyph '+p.glyphId+' placed');const fp=pieceFootprint(footprints,p);splashes.at(p.x,p.y,{inner:fp?.radiusPx??90,color:'#FFF2AD',sound:()=>sound('place')});}
 if(mode==='setup'&&now-rosterAt>1000){rosterAt=now;syncRoster();}
 for(const p of tracker.identities.filter(p=>p.present))bind(p);
 if(mode==='setup'&&seats.length<4&&changes.arrivals.some(p=>p.owner===null)&&!selectorOpen()){
  const p=changes.arrivals.find(p=>p.owner===null)!;if(Math.min(p.x,1920-p.x,p.y,1080-p.y)<300)void addPlayer();
 }
 handleUI();
 const club=mode==='play'?play(now,dt):null;
 if(mode==='help')helpStep=Math.min(3,helpStep);
 if(now>messageUntil)message='';
 if((mode==='play'||mode==='title')&&now>ambientAt){ambientAt=now+12000;ambience();}
 for(const e of effects)e.age+=dt;
 while(effects.length>100)effects.shift();
 for(let i=effects.length-1;i>=0;i--)if(effects[i].age>1.2)effects.splice(i,1);
 drawGame(ctx,{mode,seats:renderSeats(),round,now,message,canStart:canStart(),hasSave:!!saved,helpStep,club,effects});
 splashes.update(dt);splashes.draw(ctx);taps=[];requestAnimationFrame(frame);
}
Board.application.onPause(()=>{console.info('[twist-putt] paused');saveRun();running=false;last=0;swing.reset();});
Board.application.onResume(()=>{console.info('[twist-putt] resumed');tracker.resumed(performance.now());swing.reset();taps=[];if(!running){running=true;last=0;requestAnimationFrame(frame);}});
void(async()=>{
 await BoardPlatform.state.ready();syncRoster();readSave();
 BoardPlatform.state.onRestore(()=>{syncRoster();readSave();});
 if(Board.isOnDevice)Board.session.onPlayersChanged(syncRoster);
 BoardPlatform.menu.setButtons([{id:'help',title:'How to putt',icon:'square'},{id:'restart',title:'Restart course',icon:'circular_arrow'},{id:'setup',title:'Change players',icon:'left_arrow'}]);
 BoardPlatform.menu.onButton(id=>{if(id==='help')help();if(id==='restart'&&seats.length){round=createRound(seats.map(s=>String(s.player.sessionId)));mode='play';lastTurn='';completionAt=0;swing.reset();saveRun();}if(id==='setup')setup();});
 [footprints]=await Promise.all([loadPieceFootprints(),loadTitleFont(),loadArt()]);
 gameAudio();
 if(!footprints)say('Sports piece data could not load. Restart the game.',3600);
 const host=window as unknown as {BoardSDK?:{__sim?:unknown}};
 if(host.BoardSDK?.__sim)Object.defineProperty(window,'__twistPuttSnapshot',{configurable:true,get:()=>JSON.parse(JSON.stringify({mode,round,seats:renderSeats(),swing:swing.status,pieces:tracker.identities}))});
 console.info('[twist-putt] ready: Sports, nine holes, app '+BoardPlatform.game.appId+'; running='+running+' hidden='+document.hidden);
 drawGame(ctx,{mode,seats:renderSeats(),round,now:performance.now(),message,canStart:canStart(),hasSave:!!saved,helpStep,club:null,effects});
 requestAnimationFrame(frame);
})().catch(error=>{console.error('[twist-putt] boot failed',error);ctx.fillStyle='#173F2E';ctx.fillRect(0,0,1920,1080);ctx.font=gameFont(48);ctx.textAlign='center';ctx.fillStyle='#FFF3D9';ctx.fillText('The game could not load. Please restart it.',960,540);});
