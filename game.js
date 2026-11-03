'use strict';

const COLS = 10;
const ROWS = 20;
const HIDDEN_ROWS = 2; // Pieces spawn above the visible board.
const TOTAL_ROWS = ROWS + HIDDEN_ROWS;

const LOCK_DELAY = 500;
const MAX_LOCK_RESETS = 15;
const DAS = 150; // Delay before a held key starts repeating.
const ARR = 40; // Interval between repeats once it has started.
const SOFT_DROP_INTERVAL = 40;
const NEXT_COUNT = 3;
const BEST_KEY = 'tetris-best';
const COMPACT_QUERY = '(max-width: 640px), (pointer: coarse)'; // Keep in sync with style.css.

// Feedback thresholds for a placed piece.
const SNUG_CONTACTS = 5; // Block sides touching walls, floor, or the stack.
const BAD_NEW_HOLES = 2; // Empty cells newly buried beneath the stack.
const POP_LIFETIME = 900;
const FLASH_LIFETIME = 260;

// Nonzero values are 1-based tile numbers from that piece's art in theme.js,
// so each block keeps its own tile as the piece rotates.
const SHAPES = {
  I: [[0, 0, 0, 0], [1, 2, 3, 4], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 2], [3, 4]],
  T: [[0, 1, 0], [2, 3, 4], [0, 0, 0]],
  S: [[0, 2, 1], [4, 3, 0], [0, 0, 0]],
  Z: [[1, 2, 0], [0, 3, 4], [0, 0, 0]],
  J: [[1, 0, 0], [2, 3, 4], [0, 0, 0]],
  L: [[0, 0, 1], [2, 3, 4], [0, 0, 0]],
};

// SRS wall kicks as [dx, dy] with y pointing down, keyed by "from>to" rotation.
const KICKS_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

const KICKS_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

const LINE_SCORES = [0, 100, 300, 500, 800];
const CLEAR_WORDS = ['', 'NICE!', 'DOUBLE!', 'TRIPLE!', 'BRICKFALL!'];

const $ = (id) => document.getElementById(id);
const boardCanvas = $('board');
const boardCtx = boardCanvas.getContext('2d');
const boardWrap = $('board-wrap');
const holdCtx = $('hold').getContext('2d');
const nextCtx = $('next').getContext('2d');
const overlay = $('overlay');
const overlayTitle = $('overlay-title');
const overlayText = $('overlay-text');
const overlayBtn = $('overlay-btn');

const state = {
  mode: 'menu', // menu | playing | paused | over
  grid: [],
  piece: null,
  queue: [],
  bag: [],
  held: null,
  holdUsed: false,
  score: 0,
  lines: 0,
  level: 1,
  best: loadBest(),
  dropTimer: 0,
  lockTimer: 0,
  lockResets: 0,
  softDrop: false,
  pop: null, // Floating feedback text: { text, color, row, age }
  flash: null, // Cleared-row flash: { rows, age }
};

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest() {
  try {
    localStorage.setItem(BEST_KEY, String(state.best));
  } catch {
    // Storage can be blocked; the best score just won't persist.
  }
}

function rotateMatrix(matrix) {
  const n = matrix.length;
  return matrix.map((row, y) => row.map((_, x) => matrix[n - 1 - x][y]));
}

function refillBag() {
  const bag = Object.keys(SHAPES);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  state.bag.push(...bag);
}

function takeFromQueue() {
  while (state.queue.length <= NEXT_COUNT) {
    if (state.bag.length === 0) refillBag();
    state.queue.push(state.bag.shift());
  }
  return state.queue.shift();
}

function makePiece(type) {
  const matrix = SHAPES[type];
  return {
    type,
    matrix,
    rotation: 0,
    x: Math.floor((COLS - matrix[0].length) / 2),
    y: 1, // Bottom row of the piece shows at the top of the board right away.
  };
}

function collides(matrix, x, y) {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const gx = x + c;
      const gy = y + r;
      if (gx < 0 || gx >= COLS || gy >= TOTAL_ROWS) return true;
      if (gy >= 0 && state.grid[gy][gx]) return true;
    }
  }
  return false;
}

function isGrounded() {
  const p = state.piece;
  return collides(p.matrix, p.x, p.y + 1);
}

// Moving or rotating a grounded piece buys more time, up to a limit so it can't stall forever.
function resetLockOnAction() {
  if (state.lockResets < MAX_LOCK_RESETS) {
    state.lockTimer = 0;
    state.lockResets++;
  }
}

function spawn(type) {
  state.piece = makePiece(type);
  state.dropTimer = 0;
  state.lockTimer = 0;
  state.lockResets = 0;
  if (collides(state.piece.matrix, state.piece.x, state.piece.y)) {
    gameOver();
  }
}

function move(dx) {
  const p = state.piece;
  if (collides(p.matrix, p.x + dx, p.y)) return false;
  p.x += dx;
  resetLockOnAction();
  return true;
}

function rotate(dir) {
  const p = state.piece;
  if (p.type === 'O') return;
  const matrix = dir > 0
    ? rotateMatrix(p.matrix)
    : rotateMatrix(rotateMatrix(rotateMatrix(p.matrix)));
  const to = (p.rotation + dir + 4) % 4;
  const kicks = (p.type === 'I' ? KICKS_I : KICKS_JLSTZ)[`${p.rotation}>${to}`];
  for (const [dx, dy] of kicks) {
    if (!collides(matrix, p.x + dx, p.y + dy)) {
      p.matrix = matrix;
      p.rotation = to;
      p.x += dx;
      p.y += dy;
      resetLockOnAction();
      Sound.rotate();
      return;
    }
  }
}

function hardDrop() {
  const p = state.piece;
  const y = ghostY();
  state.score += (y - p.y) * 2;
  p.y = y;
  lock();
}

function hold() {
  if (state.holdUsed) return;
  const current = state.piece.type;
  const swapped = state.held;
  state.held = current;
  spawn(swapped || takeFromQueue());
  state.holdUsed = true;
  Sound.hold();
}

function ghostY() {
  const p = state.piece;
  let y = p.y;
  while (!collides(p.matrix, p.x, y + 1)) y++;
  return y;
}

// Empty cells with a filled cell somewhere above them in the same column.
function countHoles() {
  let holes = 0;
  for (let c = 0; c < COLS; c++) {
    let covered = false;
    for (let r = 0; r < TOTAL_ROWS; r++) {
      if (state.grid[r][c]) covered = true;
      else if (covered) holes++;
    }
  }
  return holes;
}

// How many sides of the piece touch a wall, the floor, or the existing stack.
// Call before the piece is written to the grid.
function countContacts(p) {
  let contacts = 0;
  forEachBlock(p.matrix, (r, c) => {
    const gx = p.x + c;
    const gy = p.y + r;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (nx < 0 || nx >= COLS || ny >= TOTAL_ROWS) contacts++;
      else if (ny >= 0 && state.grid[ny][nx]) contacts++;
    }
  });
  return contacts;
}

function stackHeight() {
  const top = state.grid.findIndex((row) => row.some(Boolean));
  return top === -1 ? 0 : TOTAL_ROWS - top;
}

function lock() {
  const p = state.piece;
  const contacts = countContacts(p);
  const holesBefore = countHoles();
  let fullyHidden = true;
  forEachBlock(p.matrix, (r, c, tile) => {
    const gy = p.y + r;
    if (gy >= 0) state.grid[gy][p.x + c] = { type: p.type, tile, rotation: p.rotation };
    if (gy >= HIDDEN_ROWS) fullyHidden = false;
  });
  const newHoles = countHoles() - holesBefore;
  const row = p.y;
  const cleared = clearLines();
  state.holdUsed = false;
  Sound.land();
  giveFeedback(cleared, contacts, newHoles, row);
  if (fullyHidden) {
    gameOver();
  } else {
    spawn(takeFromQueue());
  }
}

function giveFeedback(cleared, contacts, newHoles, row) {
  if (cleared > 0) {
    Sound.good(cleared);
    state.pop = { text: CLEAR_WORDS[cleared], color: '#f7e04b', row, age: 0 };
  } else if (newHoles >= BAD_NEW_HOLES) {
    Sound.bad();
    state.pop = { text: 'OOPS!', color: '#ff7a5a', row, age: 0 };
  } else if (newHoles === 0 && contacts >= SNUG_CONTACTS) {
    Sound.good(1);
    state.pop = { text: 'NICE!', color: '#f7e04b', row, age: 0 };
  }
}

function clearLines() {
  const rows = [];
  state.grid.forEach((row, r) => {
    if (row.every(Boolean)) rows.push(r);
  });
  if (rows.length === 0) return 0;
  const remaining = state.grid.filter((_, r) => !rows.includes(r));
  while (remaining.length < TOTAL_ROWS) {
    remaining.unshift(new Array(COLS).fill(null));
  }
  state.grid = remaining;
  state.score += LINE_SCORES[rows.length] * state.level;
  state.lines += rows.length;
  state.flash = { rows, age: 0 };
  const level = Math.floor(state.lines / 10) + 1;
  if (level > state.level) Sound.levelUp();
  state.level = level;
  return rows.length;
}

// Guideline gravity: seconds per row = (0.8 - (level - 1) * 0.007) ^ (level - 1).
function gravityInterval() {
  const l = state.level - 1;
  return Math.pow(0.8 - l * 0.007, l) * 1000;
}

function update(dt) {
  const interval = state.softDrop
    ? Math.min(SOFT_DROP_INTERVAL, gravityInterval())
    : gravityInterval();

  if (isGrounded()) {
    state.dropTimer = 0;
    state.lockTimer += dt;
    if (state.lockTimer >= LOCK_DELAY) lock();
    return;
  }

  state.dropTimer += dt;
  while (state.dropTimer >= interval && !isGrounded()) {
    state.dropTimer -= interval;
    state.piece.y++;
    if (state.softDrop) state.score += 1;
  }
}

function newGame() {
  state.grid = Array.from({ length: TOTAL_ROWS }, () => new Array(COLS).fill(null));
  state.queue = [];
  state.bag = [];
  state.held = null;
  state.holdUsed = false;
  state.score = 0;
  state.lines = 0;
  state.level = 1;
  state.softDrop = false;
  state.pop = null;
  state.flash = null;
  state.mode = 'playing';
  overlay.hidden = true;
  Sound.setPressure(0, 1);
  Sound.startMusic();
  spawn(takeFromQueue());
}

function gameOver() {
  state.mode = 'over';
  Sound.gameOver();
  const isBest = state.score > state.best;
  if (isBest) {
    state.best = state.score;
    saveBest();
  }
  showOverlay(
    'Game over',
    `${isBest ? 'New best!\n' : ''}Score ${state.score.toLocaleString()}\nLines ${state.lines}\nLevel ${state.level}`,
    'Play again',
  );
}

function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
    state.softDrop = false;
    held.clear();
    Sound.pause();
    showOverlay('Paused', '', 'Resume');
  } else if (state.mode === 'paused') {
    resume();
  }
}

function resume() {
  state.mode = 'playing';
  overlay.hidden = true;
  Sound.resume();
}

function showOverlay(title, text, button) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayBtn.textContent = button;
  overlay.hidden = false;
}

function toggleSound() {
  if (state.mode !== 'paused') Sound.unlock(); // Unlocking would wake a paused game's music.
  Sound.toggleMute();
  updateSoundLabels();
}

function updateSoundLabels() {
  const label = Sound.isMuted() ? 'Sound off' : 'Sound on';
  document.querySelectorAll('[data-sound-label]').forEach((el) => {
    el.textContent = label;
  });
}

// --- Input ---

const held = new Map(); // action -> { elapsed, repeating }

function press(action) {
  if (state.mode !== 'playing') return;
  switch (action) {
    case 'left': move(-1); startRepeat('left'); held.delete('right'); break;
    case 'right': move(1); startRepeat('right'); held.delete('left'); break;
    case 'down': state.softDrop = true; break;
    case 'rotate': rotate(1); break;
    case 'rotateBack': rotate(-1); break;
    case 'drop': hardDrop(); break;
    case 'hold': hold(); break;
  }
}

function release(action) {
  if (action === 'down') state.softDrop = false;
  held.delete(action);
}

function startRepeat(action) {
  held.set(action, { elapsed: 0, repeating: false });
}

function updateRepeat(dt) {
  for (const [action, info] of held) {
    info.elapsed += dt;
    while (info.elapsed >= (info.repeating ? ARR : DAS)) {
      info.elapsed -= info.repeating ? ARR : DAS;
      info.repeating = true;
      if (!move(action === 'left' ? -1 : 1)) break;
    }
  }
}

const KEYMAP = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'down',
  ArrowUp: 'rotate',
  KeyX: 'rotate',
  KeyZ: 'rotateBack',
  Space: 'drop',
  KeyC: 'hold',
  ShiftLeft: 'hold',
};

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!e.repeat) togglePause();
    e.preventDefault();
    return;
  }
  if (e.code === 'KeyM') {
    if (!e.repeat) toggleSound();
    e.preventDefault();
    return;
  }
  if (e.code === 'Enter' && !overlay.hidden) {
    if (!e.repeat) overlayBtn.click();
    e.preventDefault();
    return;
  }
  const action = KEYMAP[e.code];
  if (!action) return;
  e.preventDefault();
  if (!e.repeat) press(action);
});

document.addEventListener('keyup', (e) => {
  const action = KEYMAP[e.code];
  if (action) release(action);
});

// Don't let a piece keep sliding if focus leaves while a key is down.
window.addEventListener('blur', () => {
  held.clear();
  state.softDrop = false;
  if (state.mode === 'playing') togglePause();
});

overlayBtn.addEventListener('click', () => {
  overlayBtn.blur();
  Sound.unlock();
  if (state.mode === 'paused') resume();
  else newGame();
});

$('sound-btn').addEventListener('click', (e) => {
  toggleSound();
  e.currentTarget.blur();
});

document.querySelectorAll('.touch button').forEach((btn) => {
  const action = btn.dataset.action;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (action === 'pause') togglePause();
    else if (action === 'sound') toggleSound();
    else press(action);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    btn.addEventListener(type, () => release(action));
  }
});

// --- Rendering ---

function drawBoard() {
  const size = boardCanvas.width / COLS;
  const ctx = boardCtx;
  ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

  ctx.strokeStyle = 'rgba(167, 209, 41, .07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < COLS; c++) {
    ctx.moveTo(c * size + 0.5, 0);
    ctx.lineTo(c * size + 0.5, boardCanvas.height);
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.moveTo(0, r * size + 0.5);
    ctx.lineTo(boardCanvas.width, r * size + 0.5);
  }
  ctx.stroke();

  if (state.grid.length === 0) return;

  for (let r = HIDDEN_ROWS; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = state.grid[r][c];
      if (cell) drawBlock(ctx, c * size, (r - HIDDEN_ROWS) * size, size, cell.type, cell.tile, cell.rotation);
    }
  }

  const p = state.piece;
  if (!p) return;

  if (state.mode === 'playing') {
    const gy = ghostY();
    ctx.strokeStyle = PIECES[p.type].accent;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(1, Math.round(size * 0.08));
    forEachBlock(p.matrix, (r, c) => {
      const y = (gy + r - HIDDEN_ROWS) * size;
      if (gy + r >= HIDDEN_ROWS) {
        ctx.strokeRect((p.x + c) * size + 2, y + 2, size - 4, size - 4);
      }
    });
    ctx.globalAlpha = 1;
  }

  forEachBlock(p.matrix, (r, c, tile) => {
    if (p.y + r >= HIDDEN_ROWS) {
      drawBlock(ctx, (p.x + c) * size, (p.y + r - HIDDEN_ROWS) * size, size, p.type, tile, p.rotation);
    }
  });

  drawEffects(ctx, size);
}

function drawEffects(ctx, size) {
  if (state.flash) {
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 1 - state.flash.age / FLASH_LIFETIME;
    for (const r of state.flash.rows) {
      if (r >= HIDDEN_ROWS) ctx.fillRect(0, (r - HIDDEN_ROWS) * size, boardCanvas.width, size);
    }
    ctx.globalAlpha = 1;
  }
  if (state.pop) {
    const { text, color, row, age } = state.pop;
    const progress = age / POP_LIFETIME;
    const fontSize = Math.round(size * 0.62);
    const y = Math.max(size, (row - HIDDEN_ROWS) * size) - progress * size;
    ctx.font = `${fontSize}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = Math.min(1, 2 - progress * 2);
    ctx.lineWidth = Math.max(2, Math.round(fontSize / 4));
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, boardCanvas.width / 2, y);
    ctx.fillStyle = color;
    ctx.fillText(text, boardCanvas.width / 2, y);
    ctx.globalAlpha = 1;
  }
}

function updateEffects(dt) {
  if (state.flash) {
    state.flash.age += dt;
    if (state.flash.age >= FLASH_LIFETIME) state.flash = null;
  }
  if (state.pop) {
    state.pop.age += dt;
    if (state.pop.age >= POP_LIFETIME) state.pop = null;
  }
}

function forEachBlock(matrix, fn) {
  matrix.forEach((row, r) => row.forEach((cell, c) => {
    if (cell) fn(r, c, cell);
  }));
}

function drawPreview(ctx, type, centerX, centerY, size) {
  if (!type) return;
  const blocks = [];
  forEachBlock(SHAPES[type], (r, c, tile) => blocks.push([r, c, tile]));
  const rows = blocks.map(([r]) => r);
  const cols = blocks.map(([, c]) => c);
  const w = Math.max(...cols) - Math.min(...cols) + 1;
  const h = Math.max(...rows) - Math.min(...rows) + 1;
  const ox = centerX - (w * size) / 2 - Math.min(...cols) * size;
  const oy = centerY - (h * size) / 2 - Math.min(...rows) * size;
  for (const [r, c, tile] of blocks) {
    drawBlock(ctx, ox + c * size, oy + r * size, size, type, tile, 0);
  }
}

function drawSidePanels() {
  const holdCanvas = holdCtx.canvas;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  holdCtx.globalAlpha = state.holdUsed ? 0.35 : 1;
  drawPreview(holdCtx, state.held, holdCanvas.width / 2, holdCanvas.height / 2, 40);
  holdCtx.globalAlpha = 1;

  const nextCanvas = nextCtx.canvas;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const wide = nextCanvas.width > nextCanvas.height;
  const slot = (wide ? nextCanvas.width : nextCanvas.height) / NEXT_COUNT;
  state.queue.slice(0, NEXT_COUNT).forEach((type, i) => {
    const offset = slot * i + slot / 2;
    if (wide) drawPreview(nextCtx, type, offset, nextCanvas.height / 2, 32);
    else drawPreview(nextCtx, type, nextCanvas.width / 2, offset, 40);
  });
}

function drawStats() {
  $('score').textContent = state.score.toLocaleString();
  $('best').textContent = Math.max(state.best, state.score).toLocaleString();
  $('level').textContent = state.level;
  $('lines').textContent = state.lines;
}

// Match the canvas backing store to its displayed size, with a whole number of
// pixels per cell so the pixel art stays crisp.
function resizeCanvas() {
  const rect = boardCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cell = Math.max(1, Math.round((rect.width * dpr) / COLS));
  const width = cell * COLS;
  const height = cell * ROWS;
  if (rect.width && (boardCanvas.width !== width || boardCanvas.height !== height)) {
    boardCanvas.width = width;
    boardCanvas.height = height;
  }

  // The phone layout has room for the next queue as a row, not a column.
  const next = nextCtx.canvas;
  const [nextW, nextH] = window.matchMedia(COMPACT_QUERY).matches ? [480, 216] : [192, 528];
  if (next.width !== nextW || next.height !== nextH) {
    next.width = nextW;
    next.height = nextH;
  }

  drawScene($('scene'));
}

window.addEventListener('resize', resizeCanvas);

// --- Main loop ---

let last = performance.now();

function frame(now) {
  // Clamp so returning from a background tab doesn't apply a huge time step.
  const dt = Math.min(now - last, 100);
  last = now;
  if (state.mode === 'playing') {
    updateRepeat(dt);
    update(dt);
  }
  if (state.mode === 'playing') {
    Sound.setPressure(stackHeight() / ROWS, state.level);
  }
  boardWrap.classList.toggle('danger', state.mode === 'playing' && Sound.state.tier >= 3);
  updateEffects(dt);
  drawBoard();
  drawSidePanels();
  drawStats();
  requestAnimationFrame(frame);
}

showOverlay('Brickfall!', 'Snug fits earn gold.\nBad gaps go whomp.', 'Play');
updateSoundLabels();
resizeCanvas();
requestAnimationFrame(frame);
