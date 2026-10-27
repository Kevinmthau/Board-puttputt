// Browser-only player-selector bridge. Native games always use Board's real selector.
(() => {
  const host = window.BoardSDK;
  if (!host?.__simulated) return;
  const originalPlayers = host.getPlayers.bind(host);
  const names = new Map();
  let requestId = 500000, guestId = 20, open = false;
  host.getPlayers = () => JSON.stringify(JSON.parse(originalPlayers()).map(p => ({ ...p, ...(names.has(p.sessionId) ? {name:names.get(p.sessionId)} : {}) })));
  const choose = replaceId => {
    const id = requestId++;
    if (open) { setTimeout(() => window.__board?.resolve(id, 'false')); return id; }
    open = true;
    const roster = JSON.parse(host.getPlayers());
    const root = document.createElement('div');
    root.dataset.boardSim = 'selector';
    Object.assign(root.style, {position:'fixed', inset:'0', background:'rgba(16,43,35,.72)', display:'grid', placeItems:'center', zIndex:'2147483647', pointerEvents:'auto', fontFamily:'system-ui,sans-serif', color:'#163e32'});
    const card = document.createElement('section');
    Object.assign(card.style, {background:'#fff9e9', borderRadius:'28px', padding:'32px', width:'min(420px,80vw)', boxShadow:'0 18px 60px #1235'});
    const title = document.createElement('h2'); title.textContent = replaceId === undefined ? 'Add a golfer' : 'Change golfer'; title.style.margin = '0 0 12px';
    const help = document.createElement('p'); help.textContent = 'Play together on this screen. Each golfer uses a different Sports piece.'; help.style.fontSize = '18px';
    card.append(title, help);
    const finish = name => {
      if (name) {
        let sessionId = replaceId;
        if (sessionId === undefined) { sessionId = guestId++; host.addGuest(sessionId); }
        names.set(sessionId, name);
      }
      open = false; root.remove();
      window.__board?.onPlayersChanged();
      window.__board?.resolve(id, JSON.stringify(Boolean(name)));
    };
    const option = (label, callback, primary = false) => {
      const b = document.createElement('button'); b.textContent = label;
      Object.assign(b.style, {display:'block', width:'100%', padding:'18px', marginTop:'14px', border:'0', borderRadius:'14px', background:primary?'#22724a':'#e1ead7', color:primary?'white':'#163e32', fontSize:'20px', fontWeight:'750', cursor:'pointer'});
      b.onclick = callback; card.append(b);
    };
    if (replaceId !== undefined || roster.length < 4) {
      const ordinal = replaceId === undefined ? roster.length + 1 : Math.max(1, roster.findIndex(p => p.sessionId === replaceId) + 1);
      option(`Player ${ordinal} · Local golfer`, () => finish(`Player ${ordinal}`), true);
    } else {
      const full = document.createElement('p'); full.textContent = 'Four golfers are already seated.'; card.append(full);
    }
    option('Cancel', () => finish(null));
    root.append(card); (document.body ?? document.documentElement).append(root);
    return id;
  };
  host.presentAddPlayerSelector = () => choose(undefined);
  host.presentReplacePlayerSelector = sessionId => choose(sessionId);
})();
