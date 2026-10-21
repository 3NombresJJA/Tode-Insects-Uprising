import { MUSIC_CONFIG } from '../Config.js';
import { getAssetUrl } from '../utils/assetUrl.js';

let currentAudio = null;
let currentTrack = null;
let currentBpm = MUSIC_CONFIG.MAIN.bpm;
let playbackRate = 1;
let masterVolume = 0.5;
let unlocked = false;
let fadeFrame = null;
let transitionId = 0;
let fadingOut = false;

export function getBeatFactor(audioElement, bpm) {
  if (!audioElement || audioElement.paused) return 0;
  const bps = bpm / 60;
  return Math.pow(Math.sin(audioElement.currentTime * bps * Math.PI), 2);
}

function cancelFade() {
  transitionId += 1;
  if (fadeFrame !== null) cancelAnimationFrame(fadeFrame);
  fadeFrame = null;
  fadingOut = false;
  return transitionId;
}

function runFade(audio, from, to, duration, token, complete) {
  if (fadeFrame !== null) cancelAnimationFrame(fadeFrame);
  const startTime = performance.now();
  audio.volume = from;

  const step = (now) => {
    if (token !== transitionId || audio !== currentAudio) return;
    const progress = duration <= 0 ? 1 : Math.min((now - startTime) / (duration * 1000), 1);
    audio.volume = from + (to - from) * progress;
    if (progress < 1 && !audio.paused) fadeFrame = requestAnimationFrame(step);
    else {
      fadeFrame = null;
      if (complete) complete();
    }
  };

  fadeFrame = requestAnimationFrame(step);
}

function createTrack(track, fadeDuration = 3) {
  const audio = new Audio(getAssetUrl(track.src));
  currentAudio = audio;
  currentTrack = track;
  currentBpm = track.bpm;
  audio.loop = true;
  audio.playbackRate = playbackRate;
  const targetVolume = Math.min(1, Math.max(0, (track.volume ?? 1) * masterVolume));
  audio.volume = fadeDuration > 0 ? 0 : targetVolume;
  audio.play().then(() => {
    if (audio !== currentAudio) return;
    if (fadeDuration > 0) runFade(audio, 0, targetVolume, fadeDuration, transitionId);
  }).catch(() => {});
}

export function fadeIn(audio, targetVolume = 1, duration = 3) {
  if (!audio) return;
  const token = cancelFade();
  currentAudio = audio;
  audio.volume = 0;
  audio.play().then(() => runFade(audio, 0, Math.min(1, Math.max(0, targetVolume * masterVolume)), duration, token)).catch(() => {});
}

export function fadeOut(audio = currentAudio, duration = 2, callback) {
  if (!audio) {
    callback?.();
    return;
  }
  const token = cancelFade();
  fadingOut = true;
  const startVolume = audio.volume;
  runFade(audio, startVolume, 0, duration, token, () => {
    if (token !== transitionId) return;
    audio.pause();
    audio.currentTime = 0;
    if (audio === currentAudio) {
      currentAudio = null;
      currentTrack = null;
    }
    fadingOut = false;
    callback?.();
  });
}

export function startMusic(track = MUSIC_CONFIG.MAIN, fadeDuration = 1) {

  if (!unlocked) return;
  if (currentTrack?.src === track.src && currentAudio) {
    currentAudio.loop = true;
    currentAudio.playbackRate = playbackRate;
    if (currentAudio.paused) fadeIn(currentAudio, track.volume ?? 1, fadeDuration);
    return;
  }

  const wasFadingOut = fadingOut;
  const token = cancelFade();
  const oldAudio = currentAudio;
  const beginTrack = () => {
    if (token !== transitionId) return;
    if (oldAudio) {
      oldAudio.pause();
      oldAudio.currentTime = 0;
    }
    createTrack(track, fadeDuration);
  };

  if (wasFadingOut && oldAudio) {
    oldAudio.pause();
    oldAudio.currentTime = 0;
    currentAudio = null;
    currentTrack = null;
    fadingOut = false;
    beginTrack();
  } else if (oldAudio && !oldAudio.paused && oldAudio.volume > 0) {
    runFade(oldAudio, oldAudio.volume, 0, 2, token, beginTrack);
  } else {
    beginTrack();
  }
}

export function unlockMusic() {
  unlocked = true;
  startMusic(currentTrack || MUSIC_CONFIG.MAIN);
}

export function setMusicPlaybackRate(rate) {
  playbackRate = rate;
  if (currentAudio) currentAudio.playbackRate = rate;
}

export function setMusicVolume(volume) {
  masterVolume = Math.min(1, Math.max(0, Number(volume) || 0));
  if (currentAudio && !fadingOut) currentAudio.volume = Math.min(1, Math.max(0, (currentTrack?.volume ?? 1) * masterVolume));
}

export function pauseMusic() {
  cancelFade();
  currentAudio?.pause();
}

export function resumeMusic() {
  if (unlocked && currentAudio) currentAudio.play().catch(() => {});
}

export function getMusicState() {
  return { audio: currentAudio, bpm: currentBpm };
}
