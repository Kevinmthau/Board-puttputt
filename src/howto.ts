// The optional How-to-play screen: help that shows how rather than tells. Each step is one idea, an
// animated stand-in performing the real input on loop (a piece put down, slid, lifted) with a few
// words under it. Replace the stand-in with the game's own piece art and what it acts on, so every
// step shows input -> consequence exactly as the rules work; write the steps from the how-to-play
// lines in docs/PLAN.md. Help stays optional: a placed piece starts play from the title or from here.
import { gameFont } from "./runtime";

export interface Box { x: number; y: number; width: number; height: number }
export type Motion = "place" | "slide" | "lift";
export interface HowToStep { motion: Motion; text: string } // text: a few words, read from a seat

// Placeholder steps, not a genre: swap in docs/PLAN.md's how-to-play steps.
export const HOW_TO_STEPS: HowToStep[] = [
  { motion: "place", text: "Put a piece down" },
  { motion: "slide", text: "Slide it" },
  { motion: "lift", text: "Lift it" },
];

// Touch targets: at least 120 px tall, 48 px in from the bezel, in different corners so one tap
// can never hit both. Move them to suit the art; keep them clear of the title.
export const HOW_TO_BUTTON: Box = { x: 1920 - 48 - 440, y: 1080 - 48 - 140, width: 440, height: 140 };
export const BACK_BUTTON: Box = { x: 48, y: 1080 - 48 - 140, width: 260, height: 140 };

export const hit = (box: Box, x: number, y: number) =>
  x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function drawButton(ctx: CanvasRenderingContext2D, box: Box, label: string) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 4;
  rounded(ctx, box.x, box.y, box.width, box.height, 28); ctx.fill(); ctx.stroke();
  let px = 48; // shrink the label to fit, never under 32 px
  do ctx.font = gameFont(px); while (px-- > 32 && ctx.measureText(label).width > box.width - 48);
  ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, box.x + box.width / 2, box.y + box.height / 2);
  ctx.restore();
}

// One step's stand-in at (cx, cy): a rounded square with a notch marking its front.
function drawStandIn(ctx: CanvasRenderingContext2D, motion: Motion, cx: number, cy: number, t: number) {
  const cycle = (t % 2000) / 2000; // each animation loops every 2 s
  let x = cx, y = cy, scale = 1, alpha = 1, ring = 0;
  if (motion === "place") { const down = Math.min(cycle / 0.4, 1); scale = 1.4 - 0.4 * down; alpha = down; ring = cycle > 0.4 ? (cycle - 0.4) / 0.6 : 0; }
  if (motion === "slide") x = cx + Math.sin(cycle * Math.PI * 2) * 90;
  if (motion === "lift") { const up = Math.max((cycle - 0.3) / 0.5, 0); scale = 1 + 0.4 * Math.min(up, 1); alpha = 1 - Math.min(up, 1); }
  ctx.save();
  if (ring > 0) { // the consequence of putting it down: a brief ring on the glass
    ctx.strokeStyle = `rgba(255,255,255,${1 - ring})`; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, 70 + ring * 70, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.fillStyle = "#E8EEF8"; rounded(ctx, -60, -60, 120, 120, 24); ctx.fill();
  ctx.fillStyle = "#101827"; ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(18, -24); ctx.lineTo(-18, -24); ctx.fill();
  ctx.restore();
}

/** The How-to-play screen: the steps side by side, each animated, with its words under it. */
export function drawHowTo(ctx: CanvasRenderingContext2D, now: number, steps: HowToStep[] = HOW_TO_STEPS) {
  const width = 1920 / steps.length;
  ctx.save();
  steps.forEach((step, i) => {
    const cx = width * (i + 0.5);
    drawStandIn(ctx, step.motion, cx, 420, now + i * 300);
    ctx.fillStyle = "#FFFFFF"; ctx.font = gameFont(48); ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(step.text, cx, 620);
  });
  ctx.restore();
  drawButton(ctx, BACK_BUTTON, "BACK");
}
