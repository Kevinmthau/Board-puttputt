// Browser-only physical-piece stand-ins. Nothing here is imported by the Board game.
(() => {
  const host = window.BoardSDK;
  if (!host?.__simulated || !host.__sim?.contacts) return;
  const sim = host.__sim;
  const svgNS = 'http://www.w3.org/2000/svg';
  const names = ['Baseball', 'Hockey', 'Cyclist', 'Soccer', 'Tennis', 'Football', 'Swimmer', 'Basketball'];
  const colors = ['#f2be4a','#ef8b69','#68c9d5','#85b474','#c4b2e3','#dfad79','#72bdb2','#df7b43'];
  const homes = [{x:520,y:900,angle:270},{x:1400,y:180,angle:90},{x:180,y:540,angle:0},{x:1740,y:540,angle:180}];
  let selected = null, nextId = 1000, drag = null, lastAt = 0, paused = false;
  let previous = [], footprints = null;
  const keys = new Set(), views = new Map();
  const normal = angle => ((angle % 360) + 360) % 360;
  const delta = (a, b) => ((a - b + 540) % 360) - 180;
  const contacts = () => sim.contacts().filter(c => c.glyph > 0);
  const current = id => contacts().find(c => c.id === id);
  const isBlocked = () => sim.menuOpen || sim.redetecting || Boolean(document.querySelector('[data-board-sim="selector"]'));
  const node = (tag, attrs = {}) => {
    const el = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    return el;
  };
  const root = document.createElement('div'); root.dataset.boardSim = 'putting';
  Object.assign(root.style, {position:'fixed', inset:'0', pointerEvents:'none', zIndex:'2147483645'});
  const surface = node('svg', {viewBox:'0 0 1920 1080', preserveAspectRatio:'none', 'aria-label':'Virtual Sports piece controls'});
  Object.assign(surface.style, {position:'fixed', width:'100%', height:'100%', overflow:'visible', touchAction:'none', pointerEvents:'none'});
  root.append(surface);
  const panel = document.createElement('details'); panel.open = true;
  Object.assign(panel.style, {position:'fixed', right:'12px', top:'12px', pointerEvents:'auto', background:'#fff9e9', color:'#163e32', border:'1px solid #a1b89d', borderRadius:'16px', boxShadow:'0 5px 24px #163e3230', padding:'10px 14px', width:'272px', font:'14px system-ui,sans-serif', userSelect:'none'});
  const summary = document.createElement('summary'); summary.textContent = 'Browser controls'; summary.style.cssText='cursor:pointer;font-weight:750;list-style-position:inside'; panel.append(summary);
  const hint = document.createElement('p'); hint.textContent = 'Place a piece at your edge. Drag it beside the ball, then drag the rear handle to twist.'; hint.style.lineHeight='1.4'; panel.append(hint);
  const choice = document.createElement('select'); choice.setAttribute('aria-label','Sports piece');
  names.forEach((name, i) => {const o = document.createElement('option'); o.value=String(i+1); o.textContent=name; choice.append(o);});
  choice.style.cssText='font:inherit;width:100%;padding:8px;border:1px solid #a1b89d;border-radius:8px;background:white;color:#163e32'; panel.append(choice);
  const row = document.createElement('div'); row.style.cssText='display:flex;gap:8px;margin:10px 0'; panel.append(row);
  const button = (label, callback) => { const b=document.createElement('button'); b.textContent=label; b.onclick=callback; b.style.cssText='font:inherit;font-weight:700;padding:10px;border:0;border-radius:9px;cursor:pointer;background:#247b50;color:white;flex:1'; row.append(b); return b; };
  const keyboard = document.createElement('p'); keyboard.textContent='Q / E: turn gently · Shift: faster\nBackspace: lift selected · P: menu'; keyboard.style.cssText='white-space:pre-line;line-height:1.5;margin-bottom:4px'; panel.append(keyboard);
  root.append(panel);
  const put = (piece, phase = 2, touched = true) => sim.emit([{id:piece.id, glyph:piece.glyph, x:piece.x, y:piece.y, orientation:normal(piece.orientation), phase, touched}]);
  const api = {
    place(glyph = Number(choice.value), x, y, orientation) {
      if (isBlocked()) return null;
      glyph = Math.max(1, Math.min(8, Math.trunc(glyph)));
      const all = contacts();
      if (all.length >= 4) return null;
      const home = homes[all.length];
      nextId = Math.max(nextId, ...all.map(c => c.id + 1));
      const piece = {id:nextId++, glyph, x:x ?? home.x, y:y ?? home.y, orientation:orientation ?? home.angle};
      put(piece, 1, false); selected=piece.id; panel.open=false;
      return piece.id;
    },
    move(id, x, y, orientation, touched = false) {
      const piece = current(id);
      if (!piece || isBlocked()) return false;
      put({...piece,x,y,orientation}, 2, touched); return true;
    },
    lift(id = selected) {
      const piece = current(id); if (!piece || isBlocked()) return false;
      put(piece, 3, false); if (selected === id) selected=null; return true;
    },
    pieces: () => contacts(),
    select(id) {if (!current(id)) return false; selected=id; return true;},
    get selected() {return selected;},
    get isDragging() {return drag !== null;},
  };
  window.TwistPuttSim = api;
  button('Place piece', () => {
    const glyph = Number(choice.value);
    const existing = contacts().find(c => c.glyph === glyph);
    if (existing) { selected=existing.id; panel.open=false; }
    else api.place(glyph);
  });
  button('Lift', () => api.lift());
  const clientPoint = e => {
    const canvas = document.querySelector('#game'); const r = canvas?.getBoundingClientRect() ?? surface.getBoundingClientRect();
    return {x:(e.clientX-r.left)*1920/r.width,y:(e.clientY-r.top)*1080/r.height};
  };
  const consume = e => { e.preventDefault(); e.stopPropagation(); };
  const endDrag = () => {
    if (drag) { const piece=current(drag.id); if (piece && !isBlocked()) put(piece, 2, false); }
    drag=null;
  };
  const startDrag = (e, id, kind) => {
    if (isBlocked()) return;
    const piece = current(id); if (!piece) return;
    consume(e); selected=id; keys.clear();
    const at = clientPoint(e);
    drag={id,kind,pointerId:e.pointerId,offsetX:at.x-piece.x,offsetY:at.y-piece.y,angle:Math.atan2(at.y-piece.y,at.x-piece.x)*180/Math.PI,orientation:piece.orientation};
    put(piece,2,true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const drawPiece = piece => {
    let view = views.get(piece.id);
    if (!view) {
      const group=node('g', {'data-piece-id':piece.id});
      const body=node('g', {role:'button',tabindex:'0','aria-label':`${names[piece.glyph-1]} piece: drag to move`});
      body.style.cssText='pointer-events:all;cursor:grab';
      const shadow=node('ellipse',{cx:'3',cy:'8',rx:'67',ry:'62',fill:'#122e3840'});
      const shape=node('path',{fill:colors[piece.glyph-1],stroke:'#173d35','stroke-width':'5'});
      const face=node('path',{d:'M 38 -19 Q 57 0 38 19 M 24 -19 L 31 -19 M 24 19 L 31 19',fill:'none',stroke:'#173d35','stroke-width':'6','stroke-linecap':'round'});
      const front=node('path',{d:'M 57 -11 L 72 0 L 57 11 Z',fill:'#fff9e9',stroke:'#173d35','stroke-width':'3'});
      const badge=node('text',{x:'-15',y:'14','text-anchor':'middle',fill:'#173d35','font-family':'system-ui,sans-serif','font-size':'38','font-weight':'800'}); badge.textContent=String(piece.glyph);
      body.append(shadow,shape,face,front,badge);
      body.addEventListener('pointerdown',e=>startDrag(e,piece.id,'move'));
      body.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){consume(e);selected=piece.id;}});
      const handle=node('g',{role:'button',tabindex:'0','aria-label':`${names[piece.glyph-1]} rotation handle: drag to twist`});
      handle.style.cssText='pointer-events:all;cursor:crosshair';
      handle.append(node('path',{d:'M -76 0 L -140 0',stroke:'#fff9e9','stroke-width':'4','stroke-dasharray':'7 7'}));
      handle.append(node('circle',{cx:'-140',cy:'0',r:'60',fill:'transparent'}));
      handle.append(node('circle',{cx:'-140',cy:'0',r:'25',fill:'#fff9e9',stroke:'#173d35','stroke-width':'4'}));
      handle.append(node('path',{d:'M -148 8 A 11 11 0 1 1 -130 5 M -130 -3 L -130 6 L -139 5',fill:'none',stroke:'#173d35','stroke-width':'3.5','stroke-linecap':'round','stroke-linejoin':'round'}));
      handle.addEventListener('pointerdown',e=>startDrag(e,piece.id,'turn'));
      group.append(handle,body); surface.append(group);
      view={group,body,shape,handle}; views.set(piece.id,view);
    }
    view.group.setAttribute('transform',`translate(${piece.x} ${piece.y}) rotate(${piece.orientation})`);
    const shape=footprints?.pieces[String(piece.glyph)];
    view.shape.setAttribute('d',shape ? shape.outlineMm.map(([x,y],i)=>`${i?'L':'M'}${-y*3.6},${-x*3.6}`).join(' ')+' Z' : 'M 65 0 C 65 78 -66 78 -66 0 C -66 -78 65 -78 65 0 Z');
    view.shape.setAttribute('stroke-width',selected===piece.id?'7':'4');
    view.handle.style.display=selected===piece.id?'':'none';
    view.group.style.opacity=isBlocked()?'0.45':'1';
  };
  window.addEventListener('pointermove',e=>{
    if (!drag || e.pointerId!==drag.pointerId) return;
    consume(e);
    if (isBlocked()) {endDrag();return;}
    const piece=current(drag.id); if(!piece){endDrag();return;}
    const at=clientPoint(e);
    if(drag.kind==='move') {
      const radius=(footprints?.pieces[String(piece.glyph)]?.radiusMm ?? 24.4)*3.6+10;
      put({...piece,x:Math.min(1920-radius,Math.max(radius,at.x-drag.offsetX)),y:Math.min(1080-radius,Math.max(radius,at.y-drag.offsetY))},2,true);
    } else {
      const angle=Math.atan2(at.y-piece.y,at.x-piece.x)*180/Math.PI;
      put({...piece,orientation:normal(drag.orientation+delta(angle,drag.angle))},2,true);
    }
  },{capture:true,passive:false});
  for(const event of ['pointerup','pointercancel']) window.addEventListener(event,e=>{
    if(drag && e.pointerId===drag.pointerId){consume(e);endDrag();}
  },{capture:true,passive:false});
  window.addEventListener('keydown',e=>{
    if(isBlocked() || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName??'')) return;
    const key=e.key.toLowerCase();
    if(key==='q'||key==='e'||key==='shift') {keys.add(key); if(key!=='shift') consume(e);}
    if(key==='backspace') {consume(e);api.lift();}
  },{capture:true});
  window.addEventListener('keyup',e=>{
    keys.delete(e.key.toLowerCase());
    if(!keys.has('q')&&!keys.has('e')) {const piece=current(selected);if(piece&&!isBlocked())put(piece,2,false);}
  },{capture:true});
  window.addEventListener('blur',()=>{keys.clear();endDrag();});
  const frame = time => {
    const dt=lastAt?Math.min(0.05,(time-lastAt)/1000):0;lastAt=time;
    const blocked=isBlocked();
    if(blocked&&!paused){keys.clear();drag=null;}
    paused=blocked;
    const all=contacts();
    if(selected!==null&&!all.some(p=>p.id===selected)) {
      const old=previous.find(p=>p.id===selected);
      selected=(old?all.find(p=>p.glyph===old.glyph&&Math.hypot(p.x-old.x,p.y-old.y)<140):all[0])?.id??null;
    }
    if(!blocked&&!drag){
      const piece=current(selected), direction=Number(keys.has('e'))-Number(keys.has('q'));
      if(piece&&direction) put({...piece,orientation:normal(piece.orientation+direction*(keys.has('shift')?480:120)*dt)},2,true);
    }
    for(const [id,view] of views) if(!all.some(p=>p.id===id)){view.group.remove();views.delete(id);}
    all.forEach(drawPiece); previous=all;
    const canvas=document.querySelector('#game');
    if(canvas){const r=canvas.getBoundingClientRect();surface.style.left=r.left+'px';surface.style.top=r.top+'px';surface.style.width=r.width+'px';surface.style.height=r.height+'px';}
    requestAnimationFrame(frame);
  };
  const install=()=>{(document.body??document.documentElement).append(root);requestAnimationFrame(frame);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  fetch('piece-footprints.json').then(r=>r.ok?r.json():null).then(data=>{footprints=data;}).catch(()=>{});
})();
