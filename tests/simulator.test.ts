import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext, runInContext} from 'node:vm';

// Exercise the actual browser host and virtual controls with a small DOM boundary.
// It catches coordinate conversion, event ownership and pause-epoch errors without a GPU.
function browser() {
  const elements: any[] = [], listeners = new Map<string, Function[]>();
  let now = 0, frames: Function[] = [];
  class Element {
    style: Record<string,string> = {}; dataset: Record<string,string> = {}; children: any[] = [];
    attrs: Record<string,string> = {}; handlers = new Map<string, Function[]>(); parent: Element | null = null;
    innerHTML = ''; textContent = ''; value = ''; tagName: string; open = false; hidden = false;
    constructor(tag: string) {this.tagName=tag.toUpperCase();elements.push(this);}
    setAttribute(k: string,v: any) {this.attrs[k]=String(v);if(k==='data-board-sim')this.dataset.boardSim=String(v);}
    append(...children: any[]) {for(const child of children){this.children.push(child);child.parent=this;}}
    appendChild(child: any) {this.append(child);return child;}
    remove() {if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}
    addEventListener(type: string, cb: Function) {this.handlers.set(type,[...(this.handlers.get(type)??[]),cb]);}
    querySelector(q: string) {if(q==='.bs-label'||q==='.bs-menu'){const e=new Element('div');this.append(e);return e;}return null;}
    closest(q: string): Element | null {return q==='[data-board-sim]'&&this.dataset.boardSim!==undefined?this:this.parent?.closest(q)??null;}
    getBoundingClientRect() {return {left:20,top:30,width:960,height:540};}
    setPointerCapture() {}
  }
  const body = new Element('body'), canvas = new Element('canvas'); body.append(canvas);
  const document = {
    body,documentElement:body,readyState:'complete',
    createElement:(tag:string)=>new Element(tag),createElementNS:(_ns:string,tag:string)=>new Element(tag),
    querySelector:(q:string)=>q==='#game'?canvas:q==='[data-board-sim="selector"]'?elements.find(e=>e.dataset.boardSim==='selector'&&e.parent):null,
    addEventListener() {},
  };
  const window: any = {document,performance:{now:()=>now},__board:{onAppVisibility(){},onPauseResult(){},onPlayersChanged(){},resolve(){},reject(){}},
    addEventListener:(type:string,cb:Function)=>listeners.set(type,[...(listeners.get(type)??[]),cb]),
    requestAnimationFrame:(cb:Function)=>{frames.push(cb);return frames.length;},location:{reload(){}},
  };
  const context = createContext({window,document,performance:window.performance,requestAnimationFrame:window.requestAnimationFrame,
    TextEncoder,MessageEvent,setTimeout,Date,console,fetch:async()=>({ok:false})});
  for(const file of ['browser-host.js','player-selector.js','putting-controls.js'])runInContext(readFileSync(`dev/${file}`,'utf8'),context);
  const dispatch = (type:string,props:any={}) => {
    const event={type,key:'',target:canvas,preventDefault(){},stopPropagation(){},...props};
    for(const cb of listeners.get(type)??[])cb(event);
    return event;
  };
  const tick = (count=1) => {for(let i=0;i<count;i++){now+=1000/60;const batch=frames;frames=[];batch.forEach(cb=>cb(now));}};
  return {window,sim:window.BoardSDK.__sim,api:window.TwistPuttSim,dispatch,tick,elements,canvas};
}

test('browser piece placement, translation, rotation and lift use one SDK contact',()=>{
  const b=browser(), id=b.api.place(5,620,740,270);
  b.tick();
  assert.equal(b.api.pieces().length,1);
  assert.equal(b.api.move(id,680,700,315),true);
  b.tick();
  const pose=b.api.pieces()[0];
  assert.equal(pose.id,id);assert.equal(pose.glyph,5);assert.equal(pose.orientation,315);assert.equal(pose.x,680);
  assert.equal(b.api.lift(id),true);b.tick();assert.equal(b.api.pieces().length,0);
});

test('native-like pointer poses use canvas world coordinates and exclude simulator controls',()=>{
  const b=browser();
  b.dispatch('pointerdown',{pointerId:1,clientX:500,clientY:300,shiftKey:true});
  b.tick();
  assert.equal(b.sim.contacts()[0].x,960);assert.equal(b.sim.contacts()[0].y,540);
  const control=b.elements.find(e=>e.dataset.boardSim==='putting');
  b.dispatch('pointerdown',{pointerId:2,clientX:200,clientY:100,shiftKey:false,target:control});
  assert.equal(b.sim.contacts().length,1,'control clicks must not inject fingers');
});

test('keyboard angular speed is bounded and Shift provides a stronger twist',()=>{
  const b=browser(),id=b.api.place(1,600,700,0);b.tick();
  b.dispatch('keydown',{key:'e'});b.tick(30);b.dispatch('keyup',{key:'e'});
  const gentle=b.api.pieces()[0].orientation;
  assert.ok(gentle>50&&gentle<70);
  b.api.move(id,600,700,0);b.dispatch('keydown',{key:'Shift'});b.dispatch('keydown',{key:'e'});b.tick(30);
  b.dispatch('keyup',{key:'e'});b.dispatch('keyup',{key:'Shift'});
  assert.ok(b.api.pieces()[0].orientation>225&&b.api.pieces()[0].orientation<250);
});

test('pause freezes virtual input and resumes the same piece under a fresh contact ID',()=>{
  const b=browser(),id=b.api.place(3,600,700,123);b.tick();
  b.dispatch('keydown',{key:'p'});b.tick(5);
  assert.equal(b.sim.menuOpen,true);assert.equal(b.api.move(id,700,700,180),false);
  b.dispatch('keydown',{key:'e'});b.tick(5);assert.equal(b.api.pieces()[0].orientation,123);
  b.dispatch('keydown',{key:'p'});b.tick(10);
  const piece=b.api.pieces()[0];
  assert.notEqual(piece.id,id);assert.equal(piece.glyph,3);assert.equal(piece.orientation,123);
  assert.equal(b.api.selected,piece.id);assert.equal(b.api.pieces().length,1);
  b.tick(30);assert.equal(b.api.pieces()[0].orientation,123,'a paused key cannot fire on resume');
});

test('grabbing a rotation handle preserves the existing angle before relative movement',()=>{
  const b=browser(),id=b.api.place(1,600,700,45);b.tick();
  const handle=b.elements.find(e=>(e.attrs['aria-label']??'').includes('rotation handle'));
  const start={pointerId:1,clientX:250,clientY:380,currentTarget:handle,target:handle,preventDefault(){},stopPropagation(){}};
  handle.handlers.get('pointerdown')[0](start);
  assert.equal(b.api.pieces()[0].orientation,45);
  b.dispatch('pointermove',{...start,clientX:300,clientY:330});
  assert.notEqual(b.api.pieces()[0].orientation,45);
  b.dispatch('pointerup',start);assert.equal(b.api.isDragging,false);assert.equal(b.api.pieces()[0].id,id);
});

test('browser allows at most four virtual pieces and Backspace lifts only the selected one',()=>{
  const b=browser();
  for(let glyph=1;glyph<=4;glyph++)assert.ok(b.api.place(glyph));
  assert.equal(b.api.place(5),null);b.tick();
  b.dispatch('keydown',{key:'Backspace'});b.tick();
  assert.equal(b.api.pieces().length,3);assert.ok(b.api.pieces().every((p:any)=>p.glyph!==4));
});
