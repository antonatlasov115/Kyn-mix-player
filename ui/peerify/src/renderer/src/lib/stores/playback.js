import { writable } from 'svelte/store';

export const playback = writable({
    isPlaying: false,
    trackPath: '',
    duration: 0,
    volume: 1.0,
    activeChannel: 0,
    bpm: 0,
    isCrossfading: false,
    isSwitching: false,
    statusMessage: 'IDLE',
    playQueue: [],
    playHistory: [],
    repeatMode: 'none',
    shuffleMode: false,
    mixMode: true,
    activeEffect: 'none',
    pitchFactor: 1.0,
    reverbActive: false,
    reverbLevel: 0.3,
    automixMode: 'ai', // 'ai' or 'sequential'
    drop_pos: 0,
    outro_start: 0
});

export const playbackProgress = writable({
    value: 0,
    lastUpdate: Date.now()
});

export const audioVisuals = writable({
    audioLevel: 0,
    kickLevel: 0,
    bassLevel: 0,
    vocalLevel: 0,
    spectrum: Array(32).fill(0)
});
