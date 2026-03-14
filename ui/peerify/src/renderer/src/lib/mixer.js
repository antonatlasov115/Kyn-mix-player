/**
 * Peerify Mixer Engine Utility
 * Centralizes all BASS/Miniaudio calls and state synchronization.
 */

// API Cache to avoid nested property lookups in hot loops
const API_CACHE = {
    setVolume: null,
    setPitch: null,
    setTempo: null, // Key Lock / Time Stretching
    setEq: null,
    setFilters: null,
    setReverb: null,
    stop: null,
    setEcho: null,
    setLoop: null,
    setVolumeMaster: null,
    syncAll: null
};

/**
 * Resolves and caches API methods. Call this once at startup or on first use.
 */
function resolveAPI() {
    const api = window.peerifyAPI;
    if (!api) return;

    const m = api.mixer;
    API_CACHE.setVolume = m?.setVolume || api.setVolume;
    API_CACHE.setPitch = m?.setPitch || api.setPitch;
    API_CACHE.setTempo = m?.setTempo; // Usually handled via BASS_FX or similar
    API_CACHE.setEq = m?.setEq || api.setEq;
    API_CACHE.setFilters = m?.setFilters;
    API_CACHE.setReverb = m?.setReverb || api.setReverb;
    API_CACHE.stop = m?.stop || api.stopTrack;
    API_CACHE.setEcho = m?.setEcho;
    API_CACHE.setLoop = m?.setLoop;
    API_CACHE.setVolumeMaster = api.setVolumeMaster;
    API_CACHE.syncAll = m?.syncAll;
}

// Initial resolution
resolveAPI();

export const U_API = {
    setVol: (ch, v) => API_CACHE.setVolume?.(ch, v),
    setPitch: (ch, p) => API_CACHE.setPitch?.(ch, p),
    setTempo: (ch, v) => API_CACHE.setTempo?.(ch, v),
    setEq: (ch, b, m, h) => API_CACHE.setEq?.(ch, b, m, h),
    setFilters: (ch, hpf) => API_CACHE.setFilters?.(ch, hpf),
    setReverb: (ch, r) => API_CACHE.setReverb?.(ch, r),
    stop: (ch) => API_CACHE.stop?.(ch),
    setEcho: (ch, wet, feedback, delayMs) => API_CACHE.setEcho?.(ch, wet, feedback, delayMs),
    setLoop: (ch, startSec, endSec) => API_CACHE.setLoop?.(ch, startSec, endSec)
}

export function createInitialAudioState() {
    return {
        c0Vol: 1.0,
        c1Vol: 1.0,
        c0Pitch: 1.0,
        c1Pitch: 1.0,
        c0Tempo: 1.0,
        c1Tempo: 1.0,
        c0Reverb: 0.0,
        c1Reverb: 0.0,
        c0Bass: 0.0,
        c0Mid: 0.0,
        c0High: 0.0,
        c0HPF: 0.0,
        c1Bass: 0.0,
        c1Mid: 0.0,
        c1High: 0.0,
        c1HPF: 0.0
    }
}

/**
 * Efficiently syncs the entire state to the backend in one IPC call.
 */
export async function syncState(currentState, sentState, masterVolume) {
    // Re-resolve API if cache is empty (e.g. if loaded before peerifyAPI was ready)
    if (!API_CACHE.setVolumeMaster) resolveAPI();

    let nextSentState = { ...sentState };

    // 1. Sync Master Volume if changed
    if (sentState.masterVol !== masterVolume) {
        API_CACHE.setVolumeMaster?.(masterVolume);
        nextSentState.masterVol = masterVolume;
    }

    // 2. Batch Sync if available (High Performance)
    if (API_CACHE.syncAll) {
        await API_CACHE.syncAll(currentState);
        return { ...nextSentState, ...currentState };
    }

    // 3. Fallback: Individual Sync (Detects changes)
    for (let i = 0; i < 2; i++) {
        const v = currentState[`c${i}Vol`];
        const p = currentState[`c${i}Pitch`];
        const t = currentState[`c${i}Tempo`];
        const r = currentState[`c${i}Reverb`];
        const h = currentState[`c${i}HPF`];
        const bass = currentState[`c${i}Bass`];
        const mid  = currentState[`c${i}Mid`];
        const high = currentState[`c${i}High`];

        if (v !== sentState[`c${i}Vol`]) U_API.setVol(i, v);
        
        // TEMPO FALLBACK: If setTempo is missing, we use pitch as a fallback 
        // (losing Key Lock but keeping the correct speed)
        if (t !== (sentState[`c${i}Tempo`] || 1.0)) {
            if (API_CACHE.setTempo) {
                U_API.setTempo(i, t);
            } else {
                U_API.setPitch(i, p * t);
            }
        } else if (p !== sentState[`c${i}Pitch`] && !API_CACHE.setTempo) {
            U_API.setPitch(i, p * t);
        } else if (p !== sentState[`c${i}Pitch`] && API_CACHE.setTempo) {
            U_API.setPitch(i, p);
        }

        if (bass !== sentState[`c${i}Bass`] || mid !== sentState[`c${i}Mid`] || high !== sentState[`c${i}High`]) {
            U_API.setEq(i, bass, mid, high);
        }
        if (h !== sentState[`c${i}HPF`]) U_API.setFilters(i, h);
        if (r !== sentState[`c${i}Reverb`]) U_API.setReverb(i, r);
    }

    return { ...nextSentState, ...currentState };
}
