'use strict';

// Each piece is a jungle item made of 8x8 pixel tiles. In a tile, "." shows the
// piece's base color and any other letter looks up its palette.
const PIECES = {
  I: {
    name: 'Vine',
    base: '#1f6b1a',
    accent: '#c5e84a',
    palette: { V: '#7bc142', L: '#c5e84a' },
    tiles: [
      ['........', '.LL.....', 'LLLLL...', '.LLLLVVV', '...VVVVV', '...LL...', '..LLL...', '........'],
      ['..LL....', '..LLL...', '...L....', 'VVVVVVVV', 'VVVVVVVV', '......L.', '.....LL.', '........'],
      ['........', '....LL..', '...LLL..', 'VVVVVVVV', 'VVVVVVVV', '..L.....', '.LLL....', '..LL....'],
      ['........', '.....LL.', '....LLLL', 'VVVVLLL.', 'VVVV....', '..LL....', '.LLLL...', '..LL....'],
    ],
  },
  O: {
    name: 'Gold bar',
    base: '#e8c020',
    accent: '#fff08a',
    palette: { H: '#fff08a', D: '#9a7408' },
    tiles: [
      ['HHHHHHHH', 'H.......', 'H..HH...', 'H.HHHH..', 'H..HH...', 'H.......', 'H.....DD', 'H.....D.'],
      ['HHHHHHHH', '.......D', '.......D', '.......D', '.......D', '.......D', 'DD.....D', '.D.....D'],
      ['H.....D.', 'H.....DD', 'H.......', 'H.......', 'H.......', 'H.......', 'H.......', 'DDDDDDDD'],
      ['.D.....D', 'DD.....D', '.......D', '...HH..D', '..HHHH.D', '...HH..D', '.......D', 'DDDDDDDD'],
    ],
  },
  T: {
    name: 'Monkey',
    base: '#b8561a',
    accent: '#f2cf9a',
    palette: { F: '#4a2508', C: '#f2cf9a', K: '#111111' },
    tiles: [
      ['..FFFF..', '.FFFFFF.', 'CFCCCCFC', '.CKCCKC.', '.CCCCCC.', '.CKKKKC.', '..CCCC..', '..FFFF..'],
      ['........', '........', 'CC......', 'CCFFFFFF', 'CCFFFFFF', 'CC......', '........', '........'],
      ['..FFFF..', 'FFFFFFFF', 'FFCCCCFF', 'FFCCCCFF', 'FFCCCCFF', '.FFFFFF.', '.FF..FF.', '.FF..FF.'],
      ['........', '........', '......CC', 'FFFFFFCC', 'FFFFFFCC', '......CC', '........', '........'],
    ],
  },
  S: {
    name: 'Alligator',
    base: '#0f6e66',
    accent: '#5ecb3c',
    palette: { G: '#5ecb3c', D: '#2c7d1e', L: '#c8e87a', W: '#ffffff', R: '#d8203a', K: '#111111' },
    tiles: [
      ['..GG....', '.GKGG...', 'GGGGGGGG', 'GGGGGGGG', 'WGWGWGWG', 'RRRRRRRR', 'WGWGWGW.', 'GGGGGGG.'],
      ['D.D.D.D.', 'GGGGGGGG', 'GDGGDGGD', 'GGGGGGGG', 'GGDGGDGG', 'GGGGGGGG', 'LLLLLLLL', 'LLLLLLLL'],
      ['D.D.D.D.', 'GGGGGGGG', 'GGDGGDGG', 'GGGGGGGG', 'GDGGDGGD', 'GGGGGGGG', 'LLLLLLLL', 'LLLLLLLL'],
      ['........', '.....D.D', '....GGGG', '...GGGDG', '..GGGGGG', '.GGGDGGG', 'GGGGGLLL', 'GGLLLLLL'],
    ],
  },
  Z: {
    name: 'Water splash',
    base: '#1c50c8',
    accent: '#6db4ff',
    palette: { L: '#6db4ff', W: '#ffffff' },
    tiles: [
      ['W......W', '.W..W...', '...WW.L.', '.L.WW...', '..LWWL..', '.LLLLLL.', 'LLLLLLLL', '.L.L.L.L'],
      ['........', '..LL....', '.L..L..L', 'L....LL.', '...W....', '..WWW...', '.LL..LL.', 'L..LL..L'],
      ['.W....W.', '...L....', '.L......', '....W...', 'LL..W.LL', '..LL.L..', '....L...', 'LL....LL'],
      ['W...W...', '..W...W.', '.L.WW...', '...WW.L.', '.LLWWLL.', 'LLLLLLLL', 'L.L.L.L.', '.L.L.L.L'],
    ],
  },
  J: {
    name: 'Rolling log',
    base: '#6b3d14',
    accent: '#d59a55',
    palette: { N: '#a9692a', D: '#4a2a0c', H: '#d59a55' },
    tiles: [
      ['.NNNNNN.', 'NNDDDDNN', 'NDHHHHDN', 'NDHDDHDN', 'NDHDDHDN', 'NDHHHHDN', 'NNDDDDNN', '.NNNNNN.'],
      ['DDDDDDDD', 'NNNNNNNN', 'NNDDNNNN', 'NNNNNDDN', 'DDNNNNNN', 'NNNNDDNN', 'NNNNNNNN', 'DDDDDDDD'],
      ['DDDDDDDD', 'NNNNNNNN', 'NNNNDDNN', 'DDNNNNNN', 'NNNDDNNN', 'NNNNNNDD', 'NNNNNNNN', 'DDDDDDDD'],
      ['.NNNNNN.', 'NNDDDDNN', 'NDHHHHDN', 'NDHDDHDN', 'NDHDDHDN', 'NDHHHHDN', 'NNDDDDNN', '.NNNNNN.'],
    ],
  },
  L: {
    name: 'Scorpion',
    base: '#7a1430',
    accent: '#ff7a9a',
    palette: { W: '#f4f1e4', K: '#111111', R: '#ff5a5a' },
    tiles: [
      ['..WWWW..', '.WW..WW.', '.W....WW', 'R......W', 'RW.....W', '.......W', '......WW', '......WW'],
      ['.WWW....', 'W..WW...', '.WWWWWWW', '...WWWWW', '..WKWWWW', '.WWWWWWW', 'W..WWWWW', '.WWW.W.W'],
      ['........', '........', '.WWWWWW.', 'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW', 'W.W.W.W.', '........'],
      ['......WW', '......WW', '.....WWW', '....WWW.', 'WWWWWWW.', 'WWWWWW..', 'W.W.W...', '........'],
    ],
  },
};

function buildTile(rows, base, palette) {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 8, 8);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    ctx.fillStyle = palette[ch];
    ctx.fillRect(x, y, 1, 1);
  }));
  return canvas;
}

for (const piece of Object.values(PIECES)) {
  piece.images = piece.tiles.map((rows) => buildTile(rows, piece.base, piece.palette));
}

// Draws one block. `tile` is 1-based, matching the values in the piece shapes,
// and `rotation` is the number of clockwise quarter turns.
function drawBlock(ctx, x, y, size, type, tile, rotation) {
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate(rotation * Math.PI / 2);
  ctx.drawImage(PIECES[type].images[tile - 1], -size / 2, -size / 2, size, size);
  ctx.restore();
  ctx.strokeStyle = 'rgba(0, 0, 0, .4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

// --- Background: a pixel jungle in the colors of early-80s cartridge box art ---

const SCENE_PIXEL = 4;

function drawScene(canvas) {
  const w = Math.ceil(window.innerWidth / SCENE_PIXEL);
  const h = Math.ceil(window.innerHeight / SCENE_PIXEL);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const rect = (color, x, y, width, height) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  };

  const groundY = h * 0.72;
  const waterY = h * 0.8;
  const floorY = h * 0.91;

  rect('#a7d129', 0, 0, w, groundY);

  // Rainbow swing arc, sweeping down from the canopy.
  const bands = ['#f7e04b', '#f7a531', '#ec6a24', '#c9302c'];
  const arcX = w * 0.04;
  const arcY = groundY;
  const arcR = Math.min(w * 0.3, h * 0.55);
  const bandW = Math.max(3, arcR * 0.06);
  for (let y = 0; y < groundY; y++) {
    for (let x = 0; x < w; x++) {
      const band = Math.floor((Math.hypot(x - arcX, y - arcY) - arcR) / bandW);
      if (band >= 0 && band < bands.length) rect(bands[band], x, y, 1, 1);
    }
  }

  // Trees: trunks with a scalloped canopy above them.
  for (let x = 6; x < w; x += 46) {
    const trunk = x % 92 === 6 ? 7 : 5;
    rect('#5a3414', x, h * 0.12, trunk, groundY - h * 0.12);
    rect('#3f2209', x + trunk - 1, h * 0.12, 1, groundY - h * 0.12);
    rect('#5a3414', x - 7, h * 0.3, 8, 2);
    rect('#5a3414', x + trunk, h * 0.38, 9, 2);
    rect('#3f8f2a', x - 11, h * 0.26, 11, 6);
    rect('#3f8f2a', x + trunk + 5, h * 0.34, 10, 6);
  }
  rect('#2f6b22', 0, 0, w, h * 0.13);
  for (let x = 0; x < w; x += 12) {
    const drop = 3 + ((x * 7) % 5);
    rect('#2f6b22', x, h * 0.13, 9, drop);
    rect('#3f8f2a', x + 2, h * 0.13 + drop, 5, 2);
  }

  // Vines hanging from the canopy.
  for (let x = 29; x < w; x += 46) {
    const length = h * (0.2 + ((x * 13) % 17) / 60);
    rect('#2f6b22', x, h * 0.13, 1, length);
    rect('#2f6b22', x - 1, h * 0.13 + length, 3, 2);
  }

  // Ground, water, and the floor beneath.
  rect('#f1dfa0', 0, groundY, w, waterY - groundY);
  rect('#c9b271', 0, waterY - 1, w, 1);
  rect('#1c50c8', 0, waterY, w, floorY - waterY);
  for (let y = waterY + 2, row = 0; y < floorY - 1; y += 3, row++) {
    for (let x = (row % 2) * 6; x < w; x += 13) rect('#6db4ff', x, y, 5, 1);
  }
  rect('#f1dfa0', 0, floorY, w, h - floorY);

  // Brick pillar and ladder, down through the water to the floor.
  const pillarX = Math.round(w * 0.9);
  rect('#c9302c', pillarX, waterY, 12, floorY - waterY);
  for (let y = waterY, row = 0; y < floorY; y += 3, row++) {
    rect('#7a1430', pillarX, y, 12, 1);
    rect('#7a1430', pillarX + (row % 2 ? 3 : 8), y, 1, 3);
  }
  const ladderX = Math.round(w * 0.08);
  rect('#5a3414', ladderX, groundY, 1, h - groundY);
  rect('#5a3414', ladderX + 6, groundY, 1, h - groundY);
  for (let y = groundY + 2; y < h; y += 4) rect('#5a3414', ladderX, y, 7, 1);
}
