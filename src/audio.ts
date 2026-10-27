import { gameAudio } from './runtime';
let lastBounce = -Infinity;
function tone(frequency: number, duration: number, volume: number, delay = 0, bus: 'music' | 'sfx' = 'sfx', end = frequency) {
  const a = gameAudio(), now = a.ctx.currentTime + delay;
  const voice = a.ctx.createOscillator(), gain = a.ctx.createGain();
  voice.type = 'sine'; voice.frequency.setValueAtTime(frequency, now);
  voice.frequency.exponentialRampToValueAtTime(Math.max(20,end), now + duration);
  gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(volume, now + .012);
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  voice.connect(gain); gain.connect(a[bus]); voice.start(now); voice.stop(now + duration + .02);
}
export function sound(kind: string, strength = 1) {
  if (kind === 'putt') { tone(440,.085,.13,0,'sfx',110); tone(1450,.045,.035); }
  else if(kind === 'place') { tone(330,.16,.07);tone(495,.19,.055,.07); }
  else if(kind === 'bounce') { const now=performance.now();if(now-lastBounce<85)return;lastBounce=now;tone(280+Math.min(strength,1000)*.25,.08,.035,0,'sfx',170); }
  else if(kind === 'water') { for(let i=0;i<6;i++)tone(640-i*75,.2,.04,i*.045,'sfx',70); }
  else if(kind === 'sink') { [523,659,784,1047].forEach((n,i)=>tone(n,.38,.075,i*.09)); }
  else if(kind === 'tunnel') { tone(160,.28,.06,0,'sfx',680); }
  else if(kind === 'complete') { [523,659,784,1047,1318].forEach((n,i)=>tone(n,.65,.07,i*.14)); }
  else if(kind === 'turn') tone(620,.12,.025);
}
export function ambience() { tone(1550,.16,.012,0,'music',2200);tone(1800,.2,.01,.26,'music',1300); }
