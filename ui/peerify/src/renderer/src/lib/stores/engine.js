import { writable } from 'svelte/store';

// Real-time engine state for the Debug Overlay
export const engineState = writable({
    decks: [
        { vol: 1.0, bass: 0, mid: 0, high: 0, hpf: 0, reverb: 0, pitch: 1.0, normGain: 1.0, level: 0 },
        { vol: 1.0, bass: 0, mid: 0, high: 0, hpf: 0, reverb: 0, pitch: 1.0, normGain: 1.0, level: 0 }
    ],
    limiterActive: false,
    masterBpm: 120,
    isCrossfading: false,
    isRecording: false,
    syncOffsetMs: 0,
    transitionProgress: 0,
    fromChannel: 0,
    toChannel: 1
});
