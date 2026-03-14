import { get } from 'svelte/store';
import { U_API, createInitialAudioState, syncState } from './mixer';
import { playback } from './stores/playback';
import { settings } from './stores/settings';
import { engineState } from './stores/engine';
import { library } from './stores/library';
import { BeatDetector } from './BeatDetector';
import { GridManager } from './GridManager';
import { TransitionManager } from './TransitionManager';

const comparePaths = (p1, p2) => {
    if (!p1 || !p2) return false;
    return p1.toLowerCase().replace(/\\/g, '/') === p2.toLowerCase().replace(/\\/g, '/');
};

const AUDIO_CONFIG = {
    EQ_KILL_DB: -45.0,
    MID_MIX_DIP_DB: -2.5,
    HIGH_MIX_DIP_DB: -1.5,
    GLOBAL_BASS_BOOST: 1.5,
    GLOBAL_HIGH_CUT: -2.0,
    INCOMING_SWELL_EXP: 1.2,
    BASS_CROSSOVER_WIDTH: 0.75,
    MID_CROSSOVER_WIDTH: 0.95,
    HIGH_ENTRY_DELAY: 0.45,
    STOP_DELAY_MS: 400,

    // IntelliGain & Limiter
    INTELLIGAIN_ENABLED: true,
    INTELLIGAIN_TARGET_ENERGY: 0.35,
    INTELLIGAIN_MIN_THRESHOLD: 0.05,
    LIMITER_THRESHOLD: 0.85,
    LIMITER_K_STEEP: 4.0,

    // EMA Smoothing Alphas
    EMA_ENERGY_ALPHA: 0.001,    // 0.999 fallback
    EMA_NORM_ALPHA: 0.005,      // 0.995 fallback

    // Visuals & Vibrant Bass
    VIBRANT_BASS_ENABLED: true,
    VIBRANT_BASS_BOOST: 2.5,

    // Logger
    MAX_LOG_SIZE: 500
};

export { AUDIO_CONFIG };

class AudioManager {
    constructor() {
        this.AUDIO_CONFIG = AUDIO_CONFIG;
        this.audioState = createInitialAudioState();
        this.sentState = { masterVol: -1, ...this.audioState };
        this.tm = new TransitionManager(this);

        this.playbackState = {};
        this.unsubscribe = playback.subscribe(s => { this.playbackState = s; });

        this.settingsState = {};
        this.unsubscribeSettings = settings.subscribe(s => { this.settingsState = s; });

        this.libraryState = { tracks: [] };
        this.unsubscribeLibrary = library.subscribe(s => { this.libraryState = s; });

        this.detectors = [new BeatDetector(), new BeatDetector()];
        this.lastSyncOffsetMs = 0;

        this.mods = {
            c0Vol: 1.0, c1Vol: 1.0,
            c0Pitch: 1.0, c1Pitch: 1.0,
            c0Tempo: 1.0, c1Tempo: 1.0,
            c0Reverb: 0.0, c1Reverb: 0.0,
            c0HPF: 0.0, c1HPF: 0.0,
            c0Bass: 0.0, c1Bass: 0.0,
            c0Mid: 0.0, c1Mid: 0.0,
            c0High: 0.0, c1High: 0.0
        };
        this.lastLevels = [0, 0];
        this.trackStats = [
            { avgEnergy: 0.5, normGain: 1.0, bpm: 120, meta: null },
            { avgEnergy: 0.5, normGain: 1.0, bpm: 120, meta: null }
        ];
        this.syncInProgress = false;
        this.transitionActive = false;

        this.isRecording = false;
        this.recordingBuffer = new Array(AUDIO_CONFIG.MAX_LOG_SIZE);
        this.logIndex = 0;
        this.logCount = 0;
        this.ipcFailCount = 0;
        this._lastLevelTime = 0;
        this._lastUITime = 0;
    }

    startRecording() {
        this.isRecording = true;
        this.logIndex = 0;
        this.logCount = 0;
        this.ipcFailCount = 0;
        engineState.update(s => ({ ...s, isRecording: true }));
    }

    stopRecording() {
        this.isRecording = false;
        engineState.update(s => ({ ...s, isRecording: false }));
    }

    async exportLog() {
        if (this.logCount === 0) return null;
        // Construct array from ring buffer in correct temporal order
        const out = [];
        for (let i = 0; i < this.logCount; i++) {
            const idx = (this.logIndex - this.logCount + i + AUDIO_CONFIG.MAX_LOG_SIZE) % AUDIO_CONFIG.MAX_LOG_SIZE;
            if (this.recordingBuffer[idx]) out.push(this.recordingBuffer[idx]);
        }
        return await window.peerifyAPI.saveDebugLog(out);
    }

    _recordState(error = null) {
        if (!this.isRecording) return;
        const now = performance.now();

        this.recordingBuffer[this.logIndex] = {
            t: now,
            state: JSON.parse(JSON.stringify(this.audioState)),
            syncOffsetMs: this.lastSyncOffsetMs || 0,
            ipcError: error,
            ipcFailCount: this.ipcFailCount
        };

        this.logIndex = (this.logIndex + 1) % AUDIO_CONFIG.MAX_LOG_SIZE;
        this.logCount = Math.min(AUDIO_CONFIG.MAX_LOG_SIZE, this.logCount + 1);
    }

    destroy() {
        if (this.unsubscribe) this.unsubscribe();
        if (this.unsubscribeSettings) this.unsubscribeSettings();
        if (this.unsubscribeLibrary) this.unsubscribeLibrary();
    }

    resetMods(activeChannel) {
        const other = activeChannel === 0 ? 1 : 0;
        this.mods[`c${activeChannel}Vol`] = 1.0;
        this.mods[`c${other}Vol`] = 0.0;

        // Reset the 'other' channel speed/pitch, keep active as is (to preserve sync)
        this.mods[`c${other}Pitch`] = 1.0;
        this.mods[`c${other}Tempo`] = 1.0;

        for (let i = 0; i <= 1; i++) {
            this.mods[`c${i}Bass`] = 0;
            this.mods[`c${i}Mid`] = 0;
            this.mods[`c${i}High`] = 0;
            this.mods[`c${i}HPF`] = 0;
            this.mods[`c${i}Reverb`] = 0;
        }

        // Commit derived state immediately
        this.commitState();
    }

    /**
     * UNIDIRECTIONAL ARCHITECTURE: Derived logic that maps mods -> audioState
     * This avoids scattered manual assignments and ensures consistency.
     */
    commitState() {
        const masterVol = this.playbackState.volume || 1.0;
        const { pitchFactor, reverbActive, reverbLevel, activeChannel, isCrossfading } = this.playbackState;

        // 1. Core EQ and DSP Derivation
        for (let i = 0; i < 2; i++) {
            // Separated Speed (Tempo/KeyLock) and Harmonic Pitch (Pitch)
            // mods.tempo is the sync speed, mods.pitch is harmonic shift
            // globals.pitchFactor is usually for global effects (Nightcore, etc.)
            this.audioState[`c${i}Tempo`] = this.mods[`c${i}Tempo`];
            this.audioState[`c${i}Pitch`] = this.mods[`c${i}Pitch`] * (pitchFactor || 1.0);

            // Reverb derivation
            const baseRev = reverbActive ? reverbLevel : 0.0;
            // Transitions handle their own reverb, otherwise deck-based
            if (!isCrossfading) {
                this.audioState[`c${i}Reverb`] = (activeChannel === i) ? Math.max(baseRev, this.mods[`c${i}Reverb`]) : 0;
            } else {
                this.audioState[`c${i}Reverb`] = this.mods[`c${i}Reverb`];
            }

            // EQ Derivation
            const [eb, em, eh] = this.getAppliedEQ(i, this.mods[`c${i}Bass`], this.mods[`c${i}Mid`], this.mods[`c${i}High`]);
            this.audioState[`c${i}Bass`] = eb;
            this.audioState[`c${i}Mid`] = em;
            this.audioState[`c${i}High`] = eh;
            this.audioState[`c${i}HPF`] = this.mods[`c${i}HPF`];
        }

        // 2. Volume Derivation (handled by IntelliGain during sync, or here if no IntelliGain)
        if (!this.settingsState.intelliGainEnabled || this.transitionActive) {
            this.audioState.c0Vol = this.mods.c0Vol * masterVol;
            this.audioState.c1Vol = this.mods.c1Vol * masterVol;
        }
    }

    _applyIntelliGain(enabled, levels, v0, v1) {
        if (!enabled) { this.audioState.c0Vol = v0; this.audioState.c1Vol = v1; return; }
        this._limiterFired = false;
        const calc = (ch) => {
            const stats = this.trackStats[ch];
            const level = levels[ch] || 0;

            // EMA smoothing using centrally defined alphas
            const eA = AUDIO_CONFIG.EMA_ENERGY_ALPHA;
            stats.avgEnergy = stats.avgEnergy * (1 - eA) + level * eA;

            const target = AUDIO_CONFIG.INTELLIGAIN_TARGET_ENERGY;
            const threshold = AUDIO_CONFIG.INTELLIGAIN_MIN_THRESHOLD;
            const normGain = stats.avgEnergy > threshold ? Math.min(1.5, target / stats.avgEnergy) : 1.0;

            const nA = AUDIO_CONFIG.EMA_NORM_ALPHA;
            stats.normGain = stats.normGain * (1 - nA) + normGain * nA;

            const boost = Math.max(0, this.audioState[`c${ch}Bass`], this.audioState[`c${ch}Mid`], this.audioState[`c${ch}High`]);
            const eqGain = Math.pow(10, -boost / 20);
            let gain = (ch === 0 ? v0 : v1) * eqGain * stats.normGain;

            const limit = AUDIO_CONFIG.LIMITER_THRESHOLD;
            if (gain > limit) {
                const limited = limit + ((gain - limit) / (1 + (gain - limit) * AUDIO_CONFIG.LIMITER_K_STEEP));
                this._limiterFired = true;
                return eqGain * stats.normGain * (limited / gain);
            }
            return eqGain * stats.normGain;
        };
        this.audioState.c0Vol = v0 * calc(0);
        this.audioState.c1Vol = v1 * calc(1);
    }

    getAppliedEQ(ch, b, m, h) {
        let outB = b + AUDIO_CONFIG.GLOBAL_BASS_BOOST;
        let outM = m;
        let outH = h + AUDIO_CONFIG.GLOBAL_HIGH_CUT;
        if (this.settingsState.vibrantBassEnabled) {
            outB += AUDIO_CONFIG.VIBRANT_BASS_BOOST;
            outM -= 1.0;
        }
        return [outB, outM, outH];
    }

    async sync(masterVolume) {
        if (!this.playbackState.isPlaying) return;
        const { activeChannel, isCrossfading, trackPath, progress } = this.playbackState;
        const { intelliGainEnabled, spatialProfile } = this.settingsState;

        try {
            // 1. Fetch Levels and Process Detectors (THROTTLED TO 32ms)
            const now = performance.now();
            const lastLevelTime = this._lastLevelTime || 0;
            if (now - lastLevelTime > 32) {
                this._lastLevelTime = now;
                for (let i = 0; i < 2; i++) {
                    const detector = this.detectors[i];
                    const baseBpm = this.trackStats[i].bpm || 120.0;
                    detector.setFallbackBpm(baseBpm * (this.audioState[`c${i}Tempo`] || 1.0));

                    try {
                        const level = await window.peerifyAPI.mixer.getLevel(i);
                        detector.process(level);
                        this.lastLevels[i] = level;
                    } catch (ipcErr) {
                        this.ipcFailCount++;
                        console.error(`[IPC] Deck ${i} error:`, ipcErr);
                    }
                }
            }

            // 2. GRID-BASED PHASE REFINEMENT
            const deckIdx = activeChannel || 0;
            const currentTrack = this.libraryState.tracks.find(t => comparePaths(t.filePath, trackPath));
            const stableBpm = (this.trackStats[deckIdx].bpm || 120.0) * (this.audioState[`c${deckIdx}Tempo`] || 1.0);
            const activeBpm = this.detectors[deckIdx].getEstimatedBpm() || stableBpm;

            let masterPh = this.detectors[deckIdx].getPhaseOffset();
            let masterBarPh = this.detectors[deckIdx].getBarPhaseOffset();

            if (currentTrack) {
                const gridInfo = GridManager.getPhaseAtTime(currentTrack, progress, stableBpm);
                masterPh = gridInfo.phase;
                masterBarPh = gridInfo.barPhase;
                this.trackStats[deckIdx].gridInfo = gridInfo;
            }

            // Calculate sync offset between decks (for debug overlay)
            const otherIdx = deckIdx === 0 ? 1 : 0;
            const otherPh = this.detectors[otherIdx].getPhaseOffset() || 0;
            let diff = (masterPh || 0) - (otherPh || 0);
            if (diff > 0.5) diff -= 1.0; else if (diff < -0.5) diff += 1.0;
            this.lastSyncOffsetMs = diff * (60000 / (stableBpm || 120));
            if (isNaN(this.lastSyncOffsetMs)) this.lastSyncOffsetMs = 0;

        } catch (e) {
            console.error('[SYNC] Internal error:', e);
        }

        if (!isCrossfading) {
            const profRev = (spatialProfile === 'maikiwi') ? 0.72 : (spatialProfile === 'minimal' ? 0.45 : (spatialProfile === 'live' ? 0.85 : 0));
            const eW = (spatialProfile === 'maikiwi') ? 0.28 : (spatialProfile === 'minimal' ? 0.15 : (spatialProfile === 'live' ? 0.4 : 0));
            const eF = (spatialProfile === 'maikiwi') ? 0.46 : (spatialProfile === 'minimal' ? 0.3 : (spatialProfile === 'live' ? 0.5 : 0));
            const eD = (spatialProfile === 'maikiwi') ? 370 : (spatialProfile === 'minimal' ? 200 : (spatialProfile === 'live' ? 150 : 0));

            if (spatialProfile !== 'none') {
                this.mods[`c${activeChannel}Reverb`] = profRev;
                U_API.setEcho(activeChannel, eW, eF, eD);
            } else {
                U_API.setEcho(activeChannel, 0, 0, 0);
            }
        }

        // CRITICAL: Block main loop from sending mixer commands if a transition is active
        if (this.transitionActive) {
            this._recordState();
            return;
        }

        // Commit all mods to derivation state
        this.commitState();

        const v0 = this.mods.c0Vol * masterVolume, v1 = this.mods.c1Vol * masterVolume;

        this._applyIntelliGain(intelliGainEnabled, this.lastLevels, v0, v1);

        // UI THROTTLING: Update Svelte store at max 30-33 FPS
        const now = performance.now();
        const lastUI = this._lastUITime || 0;
        if (now - lastUI > 32) {
            this._lastUITime = now;
            engineState.update(s => {
                s.isCrossfading = isCrossfading;
                s.masterBpm = this.detectors[activeChannel || 0].getEstimatedBpm() || (this.trackStats[activeChannel || 0].bpm || 120.0);
                s.syncOffsetMs = this.lastSyncOffsetMs || 0;
                s.limiterActive = this._limiterFired;
                for (let i = 0; i < 2; i++) {
                    const d = s.decks[i];
                    d.vol = this.audioState[`c${i}Vol`]; d.bass = this.audioState[`c${i}Bass`]; d.mid = this.audioState[`c${i}Mid`]; d.high = this.audioState[`c${i}High`];
                    d.hpf = this.audioState[`c${i}HPF`]; d.reverb = this.audioState[`c${i}Reverb`]; d.pitch = this.audioState[`c${i}Pitch`];
                    d.level = this.lastLevels[i]; d.normGain = this.trackStats[i].normGain;
                }
                return s;
            });
        }

        if (!this.syncInProgress) {
            this.syncInProgress = true;
            syncState(this.audioState, this.sentState, masterVolume).then(ns => {
                this.sentState = ns;
                this.syncInProgress = false;
            }).catch(() => { this.syncInProgress = false; });
        }
    }

    getMasterBeatInfo() {
        const activeIdx = this.playbackState.activeChannel || 0;
        const d = this.detectors[activeIdx];
        const stats = this.trackStats[activeIdx];

        // Use stable metadata BPM if available
        const stableBpm = (stats.bpm || 120.0) * (this.audioState[`c${activeIdx}Tempo`] || 1.0);

        // Use grid info if available from sync() loop
        if (stats.gridInfo) {
            return {
                bpm: stableBpm,
                phase: stats.gridInfo.phase,
                barPhase: stats.gridInfo.barPhase,
                energyTrend: d.getEnergyTrend()
            };
        }

        return {
            bpm: d.getEstimatedBpm() || stableBpm,
            phase: d.getPhaseOffset() || 0,
            barPhase: d.getBarPhaseOffset() || 0,
            energyTrend: d.getEnergyTrend() || 0
        };
    }

    async prepareForTransition(from, to) {
        const m = this.playbackState.volume || 1.0;
        this.mods[`c${from}Vol`] = 1.0;
        this.mods[`c${to}Vol`] = 0.0;
        for (let b of ['Bass', 'Mid', 'High']) {
            this.mods[`c${to}${b}`] = AUDIO_CONFIG.EQ_KILL_DB;
        }
        this.commitState();
        this.sentState = await syncState(this.audioState, this.sentState, m);
    }

    async startTransition(p) { return this.tm.start(p); }
    async finishTransition(id, to, from) { return this.tm.finish(id, to, from); }
    updateTrackStats(ch, bpm, path) {
        if (ch >= 0 && ch <= 1) {
            this.trackStats[ch].bpm = parseFloat(bpm) || 120.0;
            this.trackStats[ch].filePath = path;
        }
    }
    resetDetectors() { this.detectors.forEach(d => d.reset()); this.lastSyncOffsetMs = 0; }

    _determineAutoStyle(outBpm, inBpm, energyTrend) {
        const bpmDiff = Math.abs(outBpm - inBpm);
        const bpmDiffPct = bpmDiff / (outBpm || 120);
        const roll = Math.random();

        if (bpmDiffPct > 0.05) return roll > 0.5 ? 'vinyl_brake' : 'tempo_ramp';
        if (energyTrend < -0.3) return 'wash_out';
        if (inBpm > 130 && roll > 0.6) return 'slam';
        return 'smooth';
    }
}

export const audioManager = new AudioManager();
