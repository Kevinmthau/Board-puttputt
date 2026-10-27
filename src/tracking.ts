/** Identity reconciliation for a maintained snapshot of live Glyph contacts.
 * The caller filters SDK contact type/phases; omitted stationary contacts must remain in its map. */
export interface TrackingContact { contactId: number; glyphId: number; x: number; y: number; orientation: number }
export interface TrackedPiece extends TrackingContact {
  id: number; present: boolean; lifted: boolean; owner: number | null;
  epoch: number; lastSeen: number; missingSince: number | null;
}
export interface TrackingChanges { arrivals: TrackedPiece[]; recovered: TrackedPiece[] }
export const TRACKING = { rebindRadius: 140, rebindMs: 900, liftDebounceMs: 150, glyphFlapMs: 250 } as const;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const valid = (c: TrackingContact) => Number.isInteger(c.contactId) && Number.isInteger(c.glyphId) && c.glyphId >= 0
  && [c.x, c.y, c.orientation].every(Number.isFinite);

export class PieceTracker {
  readonly identities: TrackedPiece[] = [];
  private nextId = 1;
  private pauseCandidates = new Set<number>();
  private flapping = new Set<number>();
  private pausedState = false;

  clear(): void {
    this.identities.length = 0; this.nextId = 1; this.pauseCandidates.clear(); this.flapping.clear();
    this.pausedState = false;
  }

  paused(now: number): void {
    this.pausedState = true;
    this.flapping.clear();
    // A second menu visit may happen before the detector has returned the first
    // epoch's pieces. Keep those unresolved identities until actually observed.
    for (const p of this.identities) if (p.present) this.pauseCandidates.add(p.id);
    for (const p of this.identities) {
      p.present = false; p.missingSince = now; p.lifted = false; p.epoch++;
      // Contact IDs are invalid across the epoch, even if the host reuses a number.
      p.contactId = -1;
    }
  }

  resumed(_now: number): void { this.pausedState = false; }

  update(liveGlyphContacts: readonly TrackingContact[], now: number): TrackingChanges {
    const result: TrackingChanges = { arrivals: [], recovered: [] };
    if (this.pausedState || !Number.isFinite(now)) return result;
    const contacts = liveGlyphContacts.filter(valid);
    const byId = new Map(contacts.map(c => [c.contactId, c]));
    const claimed = new Set<number>();
    const observe = (p: TrackedPiece, c: TrackingContact) => {
      p.contactId = c.contactId; p.x = c.x; p.y = c.y; p.orientation = c.orientation;
      p.present = true; p.lifted = false; p.lastSeen = now; p.missingSince = null;
    };
    // A live binding wins before nearby identities get a chance to recover it.
    for (const p of this.identities) {
      const c = p.present ? byId.get(p.contactId) : undefined;
      // The detector can briefly lose the glyph classification while still tracking a piece.
      // Preserve presence/owner, freeze its pose, and invalidate swing intent at both boundaries.
      if (c && c.glyphId === 0 && now - p.lastSeen <= TRACKING.glyphFlapMs && !claimed.has(c.contactId)) {
        claimed.add(c.contactId);
        if (!this.flapping.has(p.id)) { this.flapping.add(p.id); p.epoch++; }
        continue;
      }
      if (c && c.glyphId === p.glyphId && !claimed.has(c.contactId)) {
        if (this.flapping.delete(p.id)) p.epoch++;
        claimed.add(c.contactId); observe(p, c); continue;
      }
      if (p.present) { p.present = false; p.missingSince = now; p.contactId = -1; p.epoch++; }
      if (p.missingSince !== null) p.lifted = now - p.missingSince >= TRACKING.liftDebounceMs;
    }
    // Match the nearest pair globally so shuffled same-glyph contacts cannot steal owners.
    const candidates = contacts.filter(c => !claimed.has(c.contactId)).flatMap(c => this.identities
      .filter(p => !p.present && p.glyphId === c.glyphId
        // The menu hides observation, not physical movement. A piece may travel
        // anywhere while paused; the ordinary blink radius must not create a
        // new identity and landing splash when the same glyph returns.
        && (this.pauseCandidates.has(p.id)
          || (distance(p, c) <= TRACKING.rebindRadius && now - p.lastSeen <= TRACKING.rebindMs)))
      .map(p => ({ p, c, distance: distance(p, c) })))
      .sort((a, b) => a.distance - b.distance || a.p.id - b.p.id || a.c.contactId - b.c.contactId);
    const recovered = new Set<number>();
    for (const { p, c } of candidates) {
      if (claimed.has(c.contactId) || recovered.has(p.id)) continue;
      claimed.add(c.contactId); recovered.add(p.id); this.pauseCandidates.delete(p.id);
      observe(p, c); p.epoch++; result.recovered.push(p);
    }
    for (const c of contacts) {
      if (claimed.has(c.contactId) || c.glyphId < 1) continue;
      const p: TrackedPiece = { ...c, id: this.nextId++, present: true, lifted: false, owner: null,
        epoch: 0, lastSeen: now, missingSince: null };
      this.identities.push(p); claimed.add(c.contactId); result.arrivals.push(p);
    }
    return result;
  }
}
