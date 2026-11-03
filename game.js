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

const COLORS = {
  I: '#4dd6e8',
  O: '#f2d14b',
  T: '#b06be0',
  S: '#5fd068',
  Z: '#ec5b5b',
  J: '#4f7fe8',
  L: '#f09a3e',
};

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
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

const $ = (id) => document.getElementById(id);
const boardCanvas = $('board');
const boardCtx = boardCanvas.getContext('2d');
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
}

function ghostY() {
  const p = state.piece;
  let y = p.y;
  while (!collides(p.matrix, p.x, y + 1)) y++;
  return y;
}

function lock() {
  const p = state.piece;
  let fullyHidden = true;
  p.matrix.forEach((row, r) => row.forEach((cell, c) => {
    if (!cell) return;
    const gy = p.y + r;
    if (gy >= 0) state.grid[gy][p.x + c] = p.type;
    if (gy >= HIDDEN_ROWS) fullyHidden = false;
  }));
  clearLines();
  state.holdUsed = false;
  if (fullyHidden) {
    gameOver();
  } else {
    spawn(takeFromQueue());
  }
}

function clearLines() {
  const remaining = state.grid.filter((row) => row.some((cell) => !cell));
  const cleared = TOTAL_ROWS - remaining.length;
  if (cleared === 0) return;
  while (remaining.length < TOTAL_ROWS) {
    remaining.unshift(new Array(COLS).fill(null));
  }
  state.grid = remaining;
  state.score += LINE_SCORES[cleared] * state.level;
  state.lines += cleared;
  state.level = Math.floor(state.lines / 10) + 1;
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
  state.mode = 'playing';
  overlay.hidden = true;
  spawn(takeFromQueue());
}

function gameOver() {
  state.mode = 'over';
  const isBest = state.score > state.best;
  if (isBest) {
    state.best = state.score;
    saveBest();
  }
  showOverlay(
    'Game over',
    `${isBest ? 'New best! ' : ''}Score ${state.score.toLocaleString()}\nLines ${state.lines} · Level ${state.level}`,
    'Play again',
  );
}

function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
    state.softDrop = false;
    held.clear();
    showOverlay('Paused', '', 'Resume');
  } else if (state.mode === 'paused') {
    resume();
  }
}

function resume() {
  state.mode = 'playing';
  overlay.hidden = true;
}

function showOverlay(title, text, button) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayBtn.textContent = button;
  overlay.hidden = false;
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
  if (state.mode === 'paused') resume();
  else newGame();
});

document.querySelectorAll('.touch button').forEach((btn) => {
  const action = btn.dataset.action;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (action === 'pause') togglePause();
    else press(action);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    btn.addEventListener(type, () => release(action));
  }
});

// --- Rendering ---

function drawCell(ctx, x, y, size, color) {
  const gap = Math.max(1, size * 0.04);
  ctx.fillStyle = color;
  ctx.fillRect(x + gap, y + gap, size - gap * 2, size - gap * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, .22)';
  ctx.fillRect(x + gap, y + gap, size - gap * 2, size * 0.12);
}

function drawBoard() {
  const size = boardCanvas.width / COLS;
  const ctx = boardCtx;
  ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

  ctx.strokeStyle = 'rgba(255, 255, 255, .045)';
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
      const type = state.grid[r][c];
      if (type) drawCell(ctx, c * size, (r - HIDDEN_ROWS) * size, size, COLORS[type]);
    }
  }

  const p = state.piece;
  if (!p) return;

  if (state.mode === 'playing') {
    const gy = ghostY();
    ctx.strokeStyle = COLORS[p.type];
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = Math.max(1, size * 0.06);
    forEachBlock(p.matrix, (r, c) => {
      const y = (gy + r - HIDDEN_ROWS) * size;
      if (gy + r >= HIDDEN_ROWS) {
        ctx.strokeRect(p.x * size + c * size + 2, y + 2, size - 4, size - 4);
      }
    });
    ctx.globalAlpha = 1;
  }

  forEachBlock(p.matrix, (r, c) => {
    if (p.y + r >= HIDDEN_ROWS) {
      drawCell(ctx, (p.x + c) * size, (p.y + r - HIDDEN_ROWS) * size, size, COLORS[p.type]);
    }
  });
}

function forEachBlock(matrix, fn) {
  matrix.forEach((row, r) => row.forEach((cell, c) => {
    if (cell) fn(r, c);
  }));
}

function drawPreview(ctx, type, centerX, centerY, size) {
  if (!type) return;
  const blocks = [];
  forEachBlock(SHAPES[type], (r, c) => blocks.push([r, c]));
  const rows = blocks.map(([r]) => r);
  const cols = blocks.map(([, c]) => c);
  const w = Math.max(...cols) - Math.min(...cols) + 1;
  const h = Math.max(...rows) - Math.min(...rows) + 1;
  const ox = centerX - (w * size) / 2 - Math.min(...cols) * size;
  const oy = centerY - (h * size) / 2 - Math.min(...rows) * size;
  for (const [r, c] of blocks) {
    drawCell(ctx, ox + c * size, oy + r * size, size, COLORS[type]);
  }
}

function drawSidePanels() {
  const holdCanvas = holdCtx.canvas;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  holdCtx.globalAlpha = state.holdUsed ? 0.35 : 1;
  drawPreview(holdCtx, state.held, holdCanvas.width / 2, holdCanvas.height / 2, 20);
  holdCtx.globalAlpha = 1;

  const nextCanvas = nextCtx.canvas;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const wide = nextCanvas.width > nextCanvas.height;
  const slot = (wide ? nextCanvas.width : nextCanvas.height) / NEXT_COUNT;
  state.queue.slice(0, NEXT_COUNT).forEach((type, i) => {
    const offset = slot * i + slot / 2;
    if (wide) drawPreview(nextCtx, type, offset, nextCanvas.height / 2, 18);
    else drawPreview(nextCtx, type, nextCanvas.width / 2, offset, 20);
  });
}

function drawStats() {
  $('score').textContent = state.score.toLocaleString();
  $('best').textContent = Math.max(state.best, state.score).toLocaleString();
  $('level').textContent = state.level;
  $('lines').textContent = state.lines;
}

// Match the canvas backing store to its displayed size so blocks stay crisp.
function resizeCanvas() {
  const rect = boardCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);
  if (width && height && (boardCanvas.width !== width || boardCanvas.height !== height)) {
    boardCanvas.width = width;
    boardCanvas.height = height;
  }

  // The phone layout has room for the next queue as a row, not a column.
  const next = nextCtx.canvas;
  const [nextW, nextH] = window.matchMedia(COMPACT_QUERY).matches ? [240, 108] : [96, 264];
  if (next.width !== nextW || next.height !== nextH) {
    next.width = nextW;
    next.height = nextH;
  }
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
  drawBoard();
  drawSidePanels();
  drawStats();
  requestAnimationFrame(frame);
}

showOverlay('Tetris', 'Clear lines. Stay alive.', 'Play');
resizeCanvas();
requestAnimationFrame(frame);
