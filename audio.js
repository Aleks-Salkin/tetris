'use strict';

// All sound is synthesized live with Web Audio, in the spirit of an Atari sound
// chip: square, triangle, and sawtooth tones plus filtered noise. There are no
// audio files. The tune is an original jungle loop in A minor.

const Sound = (() => {
  const MUTE_KEY = 'brickfall-muted';
  const LOOKAHEAD = 0.15;
  const BASE_BPM = 104;
  const MAX_BPM = 196;

  // Sixteenth notes, four bars. "-" holds the previous note and "." is a rest.
  const MELODY = parseLine(`
    E5 - . E5 - . G5 - A5 - . G5 E5 - D5 -
    E5 - - - - - . . . . C5 D5 E5 - D5 C5
    A4 - . A4 - . C5 - D5 - . C5 A4 - G4 -
    B4 - - - - - . . E5 - D5 - B4 - G#4 -
  `);
  const BASS_ROOTS = [45, 43, 41, 40]; // A G F E, one per bar.
  const BASS_PATTERN = { 0: 0, 3: 0, 6: -5, 8: 0, 11: 0, 14: -5 };
  const ARPEGGIOS = [[69, 72, 76, 81], [67, 71, 74, 79], [65, 69, 72, 77], [64, 68, 71, 76]];
  const STEPS = MELODY.length;

  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let noiseBuffer = null;
  let timer = null;
  let nextStepTime = 0;
  let muted = readMuted();

  // Live music values; game.js reads `tier` to light up the danger warning.
  const state = { bpm: BASE_BPM, targetBpm: BASE_BPM, intensity: 0, tier: 0, step: 0, transpose: 0, playing: false };

  function parseLine(text) {
    const tokens = text.trim().split(/\s+/);
    const line = new Array(tokens.length).fill(null);
    let current = -1;
    tokens.forEach((token, i) => {
      if (token === '-') {
        if (current >= 0) line[current].length++;
      } else if (token === '.') {
        current = -1;
      } else {
        line[i] = { midi: noteToMidi(token), length: 1 };
        current = i;
      }
    });
    return line;
  }

  function noteToMidi(name) {
    const offsets = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const sharp = name[1] === '#' ? 1 : 0;
    return 12 * (Number(name.slice(1 + sharp)) + 1) + offsets[name[0]] + sharp;
  }

  function hz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function readMuted() {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  }

  // Browsers only allow audio after a user gesture, so this runs from input handlers.
  function unlock() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.connect(master);
      sfxBus = ctx.createGain();
      sfxBus.connect(master);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const samples = noiseBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    // Besides "suspended", iOS reports "interrupted" after a phone call or lock screen.
    if (ctx.state !== 'running') ctx.resume();
  }

  function tone(bus, type, freq, start, length, volume, endFreq) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + length);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.setValueAtTime(volume, start + length * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(start);
    osc.stop(start + length + 0.01);
  }

  function noise(bus, start, length, volume, cutoff) {
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = noiseBuffer;
    filter.type = 'highpass';
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    source.start(start);
    source.stop(start + length);
  }

  // --- Music ---

  // The stack height and the level each push the music up, and they compound.
  function setPressure(stackFraction, level) {
    const speed = Math.min(level - 1, 14) / 14;
    const height = Math.max(0, (stackFraction - 0.25) / 0.75);
    state.intensity = 1 - (1 - speed) * (1 - height);
    state.targetBpm = BASE_BPM + state.intensity * (MAX_BPM - BASE_BPM);
    state.tier = Math.min(3, Math.floor(state.intensity * 4));
  }

  function scheduleStep(step, t, stepLength) {
    const { tier } = state;
    const inBar = step % 16;
    const bar = Math.floor(step / 16);
    if (inBar === 0) state.transpose = tier >= 3 ? 2 : 0;
    const shift = state.transpose;

    const note = MELODY[step];
    if (note) {
      const freq = hz(note.midi + shift);
      const length = note.length * stepLength * 0.95;
      tone(musicBus, 'square', freq, t, length, 0.11);
      if (tier >= 3) tone(musicBus, 'square', freq * 2, t, length, 0.05);
    }

    const offset = BASS_PATTERN[inBar];
    if (offset !== undefined) {
      const midi = BASS_ROOTS[bar] + offset + shift;
      tone(musicBus, 'triangle', hz(midi), t, stepLength * 1.8, 0.3);
      if (tier >= 2) tone(musicBus, 'square', hz(midi), t, stepLength * 1.2, 0.05);
    }

    // Tom pattern is always there; the other layers join as the tiers climb.
    if (inBar === 0 || inBar === 6 || inBar === 10) {
      tone(musicBus, 'triangle', 170, t, 0.12, 0.3, 60);
    }
    if (tier >= 1 && (inBar === 4 || inBar === 12)) noise(musicBus, t, 0.09, 0.14, 1500);
    if (tier >= 1 && inBar % 2 === 0) noise(musicBus, t, 0.03, 0.05, 7000);
    if (tier >= 2) {
      if (inBar % 2 === 1) noise(musicBus, t, 0.02, 0.04, 8000);
      const arp = ARPEGGIOS[bar];
      tone(musicBus, 'square', hz(arp[inBar % arp.length] + 12 + shift), t, stepLength * 0.6, 0.035);
    }
    if (tier >= 3 && inBar % 4 === 2) tone(musicBus, 'square', hz(93 + shift), t, stepLength * 0.5, 0.05);
  }

  function schedule() {
    if (ctx.state !== 'running') return;
    while (nextStepTime < ctx.currentTime + LOOKAHEAD) {
      state.bpm += (state.targetBpm - state.bpm) * 0.08;
      const stepLength = 60 / state.bpm / 4;
      scheduleStep(state.step, nextStepTime, stepLength);
      nextStepTime += stepLength;
      state.step = (state.step + 1) % STEPS;
    }
  }

  function startMusic() {
    unlock();
    if (!ctx) return;
    stopMusic();
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(1, ctx.currentTime);
    state.step = 0;
    state.bpm = BASE_BPM;
    state.playing = true;
    nextStepTime = ctx.currentTime + 0.08;
    timer = setInterval(schedule, 25);
    schedule();
  }

  function stopMusic() {
    if (timer) clearInterval(timer);
    timer = null;
    state.playing = false;
    if (ctx) musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
  }

  // Suspending freezes the clock, so the scheduler picks up exactly where it left off.
  function pause() {
    if (ctx) ctx.suspend();
  }

  function resume() {
    if (ctx) ctx.resume();
  }

  // --- Sound effects ---

  function now() {
    return ctx && ctx.state === 'running' ? ctx.currentTime : null;
  }

  // Bright two-note chime: a short note jumping up to a long ringing one.
  function coin(start) {
    tone(sfxBus, 'square', hz(83), start, 0.08, 0.28);
    tone(sfxBus, 'square', hz(88), start + 0.08, 0.42, 0.28);
  }

  function good(lines) {
    const t = now();
    if (t === null) return;
    coin(t);
    // Bigger clears climb higher after the chime.
    [91, 95, 100].slice(0, Math.max(0, lines - 1)).forEach((midi, i) => {
      tone(sfxBus, 'square', hz(midi), t + 0.2 + i * 0.09, 0.28, 0.24);
    });
  }

  function whompNote(start, from, to, length, volume) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1300, start);
    filter.frequency.exponentialRampToValueAtTime(280, start + length);
    filter.connect(sfxBus);
    tone(filter, 'sawtooth', from, start, length, volume, to);
    tone(filter, 'square', from / 2, start, length, volume * 0.5, to / 2);
  }

  // Quiet "whomp", then a lower, longer, louder "WHOMP".
  function bad() {
    const t = now();
    if (t === null) return;
    whompNote(t, 196, 165, 0.26, 0.32);
    whompNote(t + 0.3, 147, 92, 0.6, 0.55);
  }

  function land() {
    const t = now();
    if (t !== null) tone(sfxBus, 'triangle', 150, t, 0.07, 0.35, 70);
  }

  function rotate() {
    const t = now();
    if (t !== null) tone(sfxBus, 'square', 620, t, 0.035, 0.05, 820);
  }

  function hold() {
    const t = now();
    if (t === null) return;
    tone(sfxBus, 'square', 390, t, 0.05, 0.08);
    tone(sfxBus, 'square', 520, t + 0.05, 0.06, 0.08);
  }

  function levelUp() {
    const t = now();
    if (t === null) return;
    [76, 79, 84, 88].forEach((midi, i) => tone(sfxBus, 'square', hz(midi), t + i * 0.07, 0.14, 0.14));
  }

  function gameOver() {
    stopMusic();
    const t = now();
    if (t === null) return;
    [69, 65, 62, 57].forEach((midi, i) => tone(sfxBus, 'square', hz(midi), t + 0.1 + i * 0.2, 0.2, 0.16));
    whompNote(t + 0.95, 130, 62, 1.1, 0.5);
  }

  function isMuted() {
    return muted;
  }

  function toggleMute() {
    muted = !muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Storage can be blocked; the choice just won't persist.
    }
    if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.01);
    return muted;
  }

  return {
    state,
    unlock,
    setPressure,
    startMusic,
    stopMusic,
    pause,
    resume,
    good,
    bad,
    land,
    rotate,
    hold,
    levelUp,
    gameOver,
    isMuted,
    toggleMute,
  };
})();
