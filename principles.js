// The coaching principles behind the outcome checks. The checks in coach.js read their
// thresholds from here, so this table is exactly what runs. Each principle says what it
// protects, the threshold, and where the threshold comes from.

export const PRINCIPLES = [
  { id: 'P1', name: 'Range', principle: 'Every session runs from 15 to 60 minutes.',
    threshold: { min: 15, max: 60 }, source: 'Product decision: one length range for every session.' },
  { id: 'P2', name: 'Shape', principle: 'The main set keeps its shape at every length: equal pieces differ by at most one coach step; pyramids rise then fall symmetrically; ladders descend within each climb.',
    threshold: {}, source: 'Grammar rule 2.' },
  { id: 'P3', name: 'Growth', principle: 'Each length is a step of the session\'s single growth sequence, so a longer session is the shorter one plus more.',
    threshold: {}, source: 'Grammar rule 3.' },
  { id: 'P4', name: 'Dose', principle: 'Hard minutes never decrease as the session gets longer.',
    threshold: {}, source: 'Progression: more time means at least as much of the session\'s own work.' },
  { id: 'P5', name: 'Steps', principle: 'A growth step adds at most 5 minutes, so every stepper position has its own plan. Known exceptions are listed with their reason.',
    threshold: { max: 5, exceptions: { pyramid: 'Adding a level to a symmetric pyramid cannot be done in a small step.', ladder: 'A new climb starts with its longest rung plus a minute of rest.' } },
    source: 'Stepper moves in 5-minute steps.' },
  { id: 'P6', name: 'Frame', principle: 'Warm-ups and cool-downs stay close to the library: warm-ups at most 8 minutes with no stretch of easy rowing over 4 minutes, cool-downs normally at most 5, and never over 8 when they absorb leftover time.',
    threshold: { warmMax: 8, warmEasyMax: 4, coolNormal: 5, coolMax: 8 }, source: 'Dark Horse Rowing: 5 min warm-up and cool-down; RowAlong: 4 min warm-up; beginner guide: 5 min warm-up.' },
  { id: 'P7', name: 'Identity', principle: 'From 25 minutes, at least half the session is its own main set (work and the rests within it).',
    threshold: { from: 25, min: 0.5 }, source: 'A session dominated by warm-up, cool-down or filler has become something else.' },
  { id: 'P8', name: 'Rest character', principle: 'Rests keep each session\'s character: short for sustained work, near equal for race pace, long for sprints.',
    threshold: { tempo: [0, 0.35], threshold: [0, 0.5], vo2: [0.5, 1.5], power: [1.5, 3], pyramid: [0, 1], ladder: [0, 0.15] },
    source: 'Pete Plan: 3x10 min / 2 min, 4x1000 m / 3 min, 5x1500 m / 5 min; RowAlong: 10 x 1 min sprints / 2 min; Concept2 WOD pyramid / 1 min.' },
  { id: 'P9', name: 'Load', principle: 'Load (minutes x intensity weight) is reported for every plan; longer sessions are allowed to be more demanding than their references.',
    threshold: { weights: { easy: 1, pick: 1, recover: 1, cool: 1, build: 1.5, firm: 3, steady: 2, tempo: 3, threshold: 4, race: 5, sprint: 6, rung: { 20: 2, 22: 2.5, 24: 3, 26: 3.5, 28: 4 } } },
    source: 'Edwards-style intensity zones; reported, not a gate.' },
];

export const byId = Object.fromEntries(PRINCIPLES.map((p) => [p.id, p]));
