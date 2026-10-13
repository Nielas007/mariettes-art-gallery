// The collection. Titles, sizes and prices are PLACEHOLDERS until Mariëtte confirms them.
export const CURRENCY = 'R';

export const WORKS = [
  {
    id: 'tree', title: 'Tree & Pavilion', year: 2026,
    medium: 'Plaster relief on round panel, warm LED backlight',
    shape: 'circle', size: [90, 90], frame: null, glow: true, price: 18500,
    note: 'A windswept tree leans over a quiet pavilion. Every leaf is built up by hand, so the scene changes with each hour of light.',
  },
  {
    id: 'drift', title: 'Drift', year: 2026,
    medium: 'Textured plaster on canvas, oak floating frame',
    shape: 'rect', size: [90, 115], frame: 'oak', glow: false, price: 14500,
    note: 'Ridges pulled through wet plaster like wind over sand. Raking light turns each line into a shadow.',
  },
  {
    id: 'feather', title: 'Feather', year: 2026,
    medium: 'Textured plaster on canvas',
    shape: 'rect', size: [80, 120], frame: null, glow: false, price: 13500,
    note: 'One soft fold, combed with thousands of fine strokes. It reads best with a single lamp from the side.',
  },
  {
    id: 'strata', title: 'Strata', year: 2026,
    medium: 'Layered plaster on canvas, oak floating frame',
    shape: 'rect', size: [150, 76], frame: 'oak', glow: false, price: 19500,
    note: 'Sheets of plaster folded over each other like rock layers or a slow tide.',
  },
];

export const byId = id => WORKS.find(w => w.id === id);
export const fmtPrice = n => `${CURRENCY} ${n.toLocaleString('en-ZA').replace(/,/g, ' ')}`;
export const fmtSize = w => w.shape === 'circle' ? `Ø ${w.size[0]} cm` : `${w.size[0]} × ${w.size[1]} cm`;
