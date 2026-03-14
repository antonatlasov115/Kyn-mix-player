import { get } from 'svelte/store';
import { library } from './stores/library';
import { playback } from './stores/playback';
import { engineState } from './stores/engine';
import { comparePaths } from './utils';
import { U_API, syncState } from './mixer';

export const TRANSITION_CONFIG = {
    STOP_DELAY_MS: 4000
};

export class TransitionManager {
    constructor(audioManager) {
        this.am = audioManager;
        this.transitionId = 0;
        this.activeTransitionId = null;
    }

    dbCurve(t, expo = 3.5) {
        const EQ_CUT = -45.0;
        if (isNaN(t) || t <= 0) return EQ_CUT;
        if (t >= 1) return 0;
        return EQ_CUT * (1.0 - Math.pow(t, expo));
    }

    async start({ durationMs, fromChannel, toChannel, outBpm, inBpm, curve = 'equal', style = 'smooth', inSeekMs = 0, syncMode = 'none', dropSwapMs = 0 }) {
        const id = ++this.transitionId;
        this.activeTransitionId = id;
        this.am.transitionActive = true;

        playback.update(s => ({ ...s, isCrossfading: true }));

        const tracks = get(library).tracks;
        const fromPath = this.am.trackStats[fromChannel]?.filePath;
        const toPath = this.am.trackStats[toChannel]?.filePath;

        const fromTrack = tracks.find(t => comparePaths(t.filePath, fromPath)) || 
                          tracks.find(t => t.filePath?.split(/[\\/]/).pop() === fromPath?.split(/[\\/]/).pop());
        const toTrack = tracks.find(t => comparePaths(t.filePath, toPath)) ||
                        tracks.find(t => t.filePath?.split(/[\\/]/).pop() === toPath?.split(/[\\/]/).pop());

        // Style resolution
        let activeStyle = style;
        if (style === 'auto') {
            // FIX: Use correctly available beat info instead of hallucinated masterDetector
            const beatInfo = this.am.getMasterBeatInfo();
            activeStyle = this.am._determineAutoStyle(outBpm, inBpm, beatInfo.energyTrend);
        }

        const start = performance.now();
        const EQ_CUT = this.am.AUDIO_CONFIG.EQ_KILL_DB;

        this.am.resetDetectors();

        const outBpmNative = parseFloat(this.am.trackStats[fromChannel]?.bpm) || outBpm || 120.0;
        const inBpmNative = parseFloat(this.am.trackStats[toChannel]?.bpm) || inBpm || 120.0;

        const startPitchOut = this.am.audioState[`c${fromChannel}Pitch`] || 1.0;
        const startBpm = outBpmNative * startPitchOut;
        const finalBpm = inBpmNative * (this.am.playbackState.pitchFactor || 1.0);

        const loop = async () => {
            if (this.activeTransitionId !== id) return;

            try {
                const now = performance.now();
                const elapsed = now - start;
                let t = Math.min(1, elapsed / durationMs);

                // 30 FPS Throttling for calculation & IPC
                const lastUI = this._lastUITime || 0;
                if (now - lastUI > 32 || t >= 1) {
                    this._lastUITime = now;

                    const currentBpm = startBpm + (finalBpm - startBpm) * t;
                    const conf = this.am.settingsState;
                    const proBass = conf.proBassCrossover ?? 0.75;
                    const proMid = conf.proMidCrossover ?? 0.95;
                    const proHigh = conf.proHighEntryDelay ?? 0.45;
                    const proExpo = conf.proCurveExpo ?? 3.5;
                    const proSwell = conf.proIncomingSwell ?? 1.2;

                    let volOut = 1.0, volIn = 1.0;
                    let tempoOut = currentBpm / outBpmNative;
                    let tempoIn = currentBpm / inBpmNative;
                    const baseTempoOut = tempoOut;
                    const baseTempoIn = tempoIn;

                    // ACTIVE PHASE STEERING (Software Nudge)
                    const offsetMs = this.am.lastSyncOffsetMs || 0;
                    const beatMs = 60000 / (currentBpm || 120);
                    const K_STEER = 0.08;
                    const nudge = 1.0 - (offsetMs / (beatMs * 2)) * K_STEER;
                    tempoIn *= Math.max(0.98, Math.min(1.02, nudge));

                    let outHPF = 0, outReverb = 0;
                    let bOut = 0, mOut = 0, hOut = 0;
                    let bIn = EQ_CUT, mIn = EQ_CUT, hIn = EQ_CUT;

                    const baseRev = this.am.playbackState.reverbActive ? this.am.playbackState.reverbLevel : 0.0;
                    const globalPitch = this.am.playbackState.pitchFactor || 1.0;

                    if (style === 'smooth') {
                        volOut = Math.cos(t * Math.PI * 0.5);
                        volIn = Math.sin(t * Math.PI * 0.5);
                        volIn = Math.pow(volIn, proSwell);
                        const bT = Math.min(1, t / proBass), mT = Math.min(1, t / proMid);
                        const hT = t < proHigh ? 0 : (t - proHigh) / (1 - proHigh);
                        bIn = this.dbCurve(bT, proExpo); mIn = this.dbCurve(mT, proExpo * 0.7); hIn = this.dbCurve(hT, proExpo * 0.6);
                        if (t > 0.3) bOut = ((t - 0.3) / 0.7) * EQ_CUT;
                    } else if (style === 'wash_out') {
                        volOut = Math.cos(t * Math.PI * 0.5); volIn = Math.sin(t * Math.PI * 0.5);
                        const washStart = 0.4; const w = t < washStart ? 0 : (t - washStart) / (1 - washStart);
                        outHPF = w * 0.7; outReverb = Math.max(baseRev, w * 0.9);
                        if (t > washStart) { bOut = EQ_CUT; mOut = EQ_CUT * 0.5; }
                    } else if (style === 'vinyl_brake') {
                        const brakeStart = 0.6; volIn = Math.pow(Math.sin(t * Math.PI * 0.5), proSwell);
                        if (t < brakeStart) { volOut = 1.0; tempoOut = baseTempoOut; }
                        else {
                            const bt = (t - brakeStart) / (1 - brakeStart);
                            tempoOut = baseTempoOut * Math.max(0.01, Math.pow(1 - bt, 4));
                            volOut = Math.cos(bt * Math.PI * 0.5); outHPF = 0.2 + bt * 0.5;
                        }
                    } else if (style === 'slam') {
                        const swapT = dropSwapMs > 0 ? (dropSwapMs / durationMs) : 0.5;
                        if (t < swapT) { volOut = 1.0; volIn = 0.0; bIn = EQ_CUT; mIn = EQ_CUT; hIn = EQ_CUT; }
                        else { volOut = 0.0; volIn = 1.0; bIn = 0; mIn = 0; hIn = 0; }
                    } else if (style === 'echo_out') {
                        volOut = Math.max(0, 1.0 - t * 1.2); volIn = Math.pow(t, 1.5); outReverb = Math.min(1.0, baseRev + t * 0.8);
                        outHPF = t * 0.6; bIn = this.dbCurve(t, proExpo); mIn = this.dbCurve(t, proExpo * 0.8); hIn = this.dbCurve(t, proExpo * 0.7);
                    } else if (style === 'power_mix') {
                        volOut = Math.cos(t * Math.PI * 0.5); volIn = Math.sin(t * Math.PI * 0.5);
                        if (t < 0.5) {
                            bOut = 0; bIn = EQ_CUT;
                            mIn = this.dbCurve(t * 2, proExpo * 0.8); hIn = this.dbCurve(t * 2, proExpo * 0.6);
                        } else {
                            const t2 = (t - 0.5) * 2;
                            bOut = this.dbCurve(t2, proExpo); bIn = 0; mIn = 0; hIn = 0;
                        }
                        if (t > 0.3) outHPF = (t - 0.3) * 0.4;
                    } else {
                        volOut = Math.cos(t * Math.PI * 0.5); volIn = Math.sin(t * Math.PI * 0.5);
                        bIn = (1.0 - t) * EQ_CUT;
                    }

                    this.am.audioState[`c${fromChannel}Vol`] = volOut * (this.am.playbackState.volume || 1.0);
                    this.am.audioState[`c${toChannel}Vol`] = volIn * (this.am.playbackState.volume || 1.0);
                    this.am.audioState[`c${fromChannel}Tempo`] = tempoOut;
                    this.am.audioState[`c${toChannel}Tempo`] = tempoIn;
                    this.am.audioState[`c${fromChannel}Pitch`] = globalPitch;
                    this.am.audioState[`c${toChannel}Pitch`] = globalPitch;
                    this.am.audioState[`c${fromChannel}Bass`] = bOut; this.am.audioState[`c${fromChannel}Mid`] = mOut; this.am.audioState[`c${fromChannel}High`] = hOut;
                    this.am.audioState[`c${fromChannel}HPF`] = outHPF; this.am.audioState[`c${fromChannel}Reverb`] = outReverb;
                    this.am.audioState[`c${toChannel}Bass`] = bIn; this.am.audioState[`c${toChannel}Mid`] = mIn; this.am.audioState[`c${toChannel}High`] = hIn;

                    for (let ch of [fromChannel, toChannel]) {
                        const [eb, em, eh] = this.am.getAppliedEQ(ch, this.am.audioState[`c${ch}Bass`], this.am.audioState[`c${ch}Mid`], this.am.audioState[`c${ch}High`]);
                        this.am.audioState[`c${ch}Bass`] = eb; this.am.audioState[`c${ch}Mid`] = em; this.am.audioState[`c${ch}High`] = eh;
                    }

                    syncState(this.am.audioState, this.am.sentState, this.am.playbackState.volume || 1.0)
                        .then(ns => { this.am.sentState = ns; })
                        .catch(e => console.error('[Transition] Sync error:', e));

                    engineState.update(s => {
                        s.isCrossfading = true;
                        s.transitionProgress = t;
                        for (let i = 0; i < 2; i++) {
                            const d = s.decks[i];
                            d.vol = this.am.audioState[`c${i}Vol`]; d.bass = this.am.audioState[`c${i}Bass`]; d.mid = this.am.audioState[`c${i}Mid`]; d.high = this.am.audioState[`c${i}High`];
                            d.level = this.am.lastLevels[i];
                        }
                        return s;
                    });
                }

                if (t < 1) requestAnimationFrame(loop);
                else this.finish(id, toChannel, fromChannel);
            } catch (err) {
                console.error('[Transition] Loop error:', err);
                this.finish(id, toChannel, fromChannel); // Safe exit
            }
        };

        requestAnimationFrame(loop);
    }

    async finish(id, toChannel, fromChannel) {
        if (this.activeTransitionId !== id) return;
        try {
            this.activeTransitionId = null;
            this.am.transitionActive = false;
            this.am.resetMods(toChannel);

            playback.update(s => ({ ...s, isCrossfading: false, activeChannel: toChannel }));
            
            engineState.update(s => {
                s.isMixingZone = false;
                s.decks[0].waveform = [];
                s.decks[1].waveform = [];
                return s;
            });

            const curVol = this.am.playbackState.volume || 1.0;
            this.am.sentState = await syncState(this.am.audioState, this.am.sentState, curVol);

            setTimeout(() => {
                if (this.activeTransitionId === null) U_API.stop(fromChannel);
            }, TRANSITION_CONFIG.STOP_DELAY_MS);
        } catch (err) {
            console.error('[Transition] Finish error:', err);
            this.am.transitionActive = false;
        }
    }
}
