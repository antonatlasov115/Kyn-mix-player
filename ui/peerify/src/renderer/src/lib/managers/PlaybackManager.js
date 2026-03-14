import { playback, audioVisuals, playbackProgress } from '../stores/playback';
import { library } from '../stores/library';
import { settings } from '../stores/settings';
import { get } from 'svelte/store';
import { t } from '../i18n';
import { audioManager } from '../audioManager';
import { U_API } from '../mixer';
import { GridManager } from '../GridManager';
import { normalizePath, comparePaths } from '../utils';
import { LyricsManager, currentLyrics } from '../LyricsManager';

const PLAYBACK_CONFIG = {
    DEFAULT_BPM: 120.0,
    POLL_INTERVAL_MS: 100,
    SYNC_CHECK_INTERVAL_MS: 2000,
    SYNC_CHECK_WINDOW_MS: 200,

    // Timing & Debounce
    MEDIA_EVENT_DEBOUNCE_MS: 350,
    TRACK_SWITCH_DEBOUNCE_MS: 1500,
    PREVIOUS_TRACK_SEEK_THRESHOLD: 3, // seconds

    // Automix & Phrasing
    ENGINE_FADE_MIN_MS: 100,
    PHRASE_MEASURES: [16, 8, 4, 2],
    DOWNBEAT_TOLERANCE: 0.05,
    FALLBACK_BEAT_TOLERANCE_S: 0.08, // seconds (80ms) - compared against timeToNextBeat which is in seconds
    FORCE_TRIGGER_END_THRESHOLD: 0.1,
    FORCE_TRIGGER_DELAY_COEFF: 0.5,

    // Automix Trigger
    MIN_DURATION_FOR_MIX: 5,
    MIN_PROGRESS_FOR_MIX: 2,

    // Energy & Style Thresholds
    HIGH_ENERGY_BPM: 135,
    WASH_OUT_BPM: 130,
    TEMPO_RAMP_THRESHOLD: 0.05, // 5% difference
    KICK_TRIGGER_THRESHOLD: 0.8,

    // Pitch Effects
    PITCH_SLOWED: 0.85,
    PITCH_SUPER_SLOWED: 0.67,
    PITCH_NIGHTCORE: 1.3,

    // UI/Mascot
    DROP_ANNOUNCEMENT_WINDOW_PRE: 0.2,
    DROP_ANNOUNCEMENT_WINDOW_POST: 0.5,

    // Sync & Latency
    ENGINE_LATENCY_MS: 85
};

class PlaybackManager {
    constructor() {
        this.currentTransitionId = 0;
        this.switchingInProgress = false;
        this.lastSwitchTime = 0;
        this.lastMediaEventTime = 0;
        this.pollInterval = null;
        this.animationFrame = null;
        this.lastDropTriggered = '';
        this.lastUsedStyle = ''; // Tracks last DJ style to avoid repetition
        this.customSlowedPitch = PLAYBACK_CONFIG.PITCH_SLOWED;
        this.cleanupHandlers = [];

        // Store Caches (The source of truth for hot loops)
        this.playbackState = {};
        this.libraryState = { tracks: [] };
        this.settingsState = {};
        this.visualsState = { kickLevel: 0 };

        // Smooth Interpolation State
        this.lastEngineTime = 0;
        this.lastFetchTimestamp = 0;
        this._lastUITime = 0;
        this.progressState = { value: 0 };
        this.lyricsState = [];
    }

    init() {
        // Clear existing handlers if any
        this.cleanupHandlers.forEach(fn => fn());
        this.cleanupHandlers = [];

        // 1. Core Subscriptions (Subscription-based Caching)
        this.cleanupHandlers.push(playback.subscribe(s => { this.playbackState = s; }));
        this.cleanupHandlers.push(playbackProgress.subscribe(s => { this.progressState = s; }));
        this.cleanupHandlers.push(library.subscribe(s => { this.libraryState = s; }));
        this.cleanupHandlers.push(audioVisuals.subscribe(s => { this.visualsState = s; }));
        this.cleanupHandlers.push(currentLyrics.subscribe(s => { this.lyricsState = s; }));
        this.cleanupHandlers.push(settings.subscribe(s => {
            this.settingsState = s;
            if (s.isLoaded && window.peerifyAPI?.setNormalization) {
                window.peerifyAPI.setNormalization(s.normalization);
            }
        }));

        if (window.peerifyAPI?.onMediaPlayPause) {
            this.cleanupHandlers.push(window.peerifyAPI.onMediaPlayPause(() => this.handleToggle()));
        }
        if (window.peerifyAPI?.onMediaNextTrack) {
            this.cleanupHandlers.push(window.peerifyAPI.onMediaNextTrack(() => this.handleHybridAutomix()));
        }
        if (window.peerifyAPI?.onMediaPreviousTrack) {
            this.cleanupHandlers.push(window.peerifyAPI.onMediaPreviousTrack(() => this.handlePrevious()));
        }
        if (window.peerifyAPI?.onStateChanged) {
            this.cleanupHandlers.push(
                window.peerifyAPI.onStateChanged((val) => {
                    const playing = val === 2;
                    this.setPlayback({ isPlaying: playing, statusMessage: playing ? this.playbackState.statusMessage : 'Paused' });
                    this.updateMediaSession();
                })
            );
        }

        // Migration: Reset old 'acapella' style if it remains in settings
        if (this.settingsState.mixStyle === 'acapella') {
            console.log('[DJ] Migrating old "acapella" style to "smooth"');
            settings.update(s => ({ ...s, mixStyle: 'smooth' }));
        }

        this.initialized = true;
        this.initMediaSession();
        this.startPolling();
        this.startRendering();
    }

    destroy() {
        this.stopPolling();
        this.stopRendering();
        this.cleanupHandlers.forEach(fn => fn());
        this.cleanupHandlers = [];
    }

    setPlayback(patch) {
        let changed = false;
        for (const key in patch) {
            if (this.playbackState[key] !== patch[key]) {
                changed = true;
                break;
            }
        }
        if (changed) {
            playback.update((s) => ({ ...s, ...patch }));
        }
    }

    /**
     * PHRASING ENGINE: Calculates precise alignment points for transitions
     */
    _calculatePhraseAlignment(meta, requestedFadeMs) {
        const s = this.settingsState;
        const trackBpm = meta?.bpm ? parseFloat(meta.bpm) : PLAYBACK_CONFIG.DEFAULT_BPM;
        const beatDuration = 60000 / trackBpm;
        const barDuration = beatDuration * 4;

        let actualFadeMs = requestedFadeMs;
        let inSeekMs = 0;
        let dropSwapMs = requestedFadeMs / 2;

        // 1. Phrasing Logic: Align transition duration to bar multiples
        const requestedBars = requestedFadeMs / barDuration;
        let phraseBars = 4;
        if (requestedBars >= 12) phraseBars = 16;
        else if (requestedBars >= 6) phraseBars = 8;
        else if (requestedBars >= 3) phraseBars = 4;
        else phraseBars = 2;

        actualFadeMs = phraseBars * barDuration;

        // 2. Alignment Logic
        if (s.useDropAlignment && meta?.drop_pos) {
            inSeekMs = Math.max(0, Math.floor(meta.drop_pos * 1000) - actualFadeMs);
            dropSwapMs = actualFadeMs; // Double Drop / Climax swap
        } else if (s.autoCutSilence && (meta?.intro_end || meta?.outro_start)) {
            // Standard intro/outro alignment
            const referencePoint = (meta.intro_end || 0) * 1000;
            inSeekMs = Math.max(0, Math.floor(referencePoint));
            dropSwapMs = actualFadeMs / 2;
        }

        return { inSeekMs, dropSwapMs, actualFadeMs };
    }

    async handleToggle() {
        const p = this.playbackState;
        if (!p.trackPath || p.isSwitching || this.switchingInProgress || p.isCrossfading) return;

        const now = performance.now();
        if (now - this.lastMediaEventTime < PLAYBACK_CONFIG.MEDIA_EVENT_DEBOUNCE_MS) return;
        this.lastMediaEventTime = now;

        await window.peerifyAPI.togglePlay();
        const playing = await window.peerifyAPI.isPlaying();
        this.setPlayback({ isPlaying: playing });
        this.updateMediaSession();
    }

    async handleSeek(eOrTime) {
        const p = this.playbackState;
        if (!p.duration) return;
        let newTime;
        if (typeof eOrTime === 'number') {
            newTime = eOrTime;
        } else if (eOrTime && eOrTime.target && eOrTime.target.value !== undefined) {
            newTime = parseFloat(eOrTime.target.value);
        } else {
            const rect = eOrTime.currentTarget.getBoundingClientRect();
            newTime = ((eOrTime.clientX - rect.left) / rect.width) * p.duration;
        }
        await window.peerifyAPI.seekTo(newTime);
        playbackProgress.set({ value: newTime, lastUpdate: Date.now() });
    }

    async handlePrevious() {
        const p = this.playbackState;
        if (p.isSwitching || this.switchingInProgress || p.isCrossfading) return;
        if (this.progressState.value > PLAYBACK_CONFIG.PREVIOUS_TRACK_SEEK_THRESHOLD) {
            await window.peerifyAPI.seekTo(0);
            playbackProgress.set({ value: 0, lastUpdate: Date.now() });
            return;
        }
        if (p.playHistory.length > 0) {
            const newHistory = [...p.playHistory];
            const prevTrack = newHistory.pop();
            this.setPlayback({ playHistory: newHistory });
            await this.playLocalTrack(prevTrack);
        }
    }

    async playLocalTrack(track, options = {}) {
        const p = this.playbackState;
        const l = this.libraryState;
        const s = this.settingsState;

        if (!track?.filePath || p.isSwitching || this.switchingInProgress || p.isCrossfading) {
            return;
        }
        const now = performance.now();
        if (now - this.lastSwitchTime < PLAYBACK_CONFIG.TRACK_SWITCH_DEBOUNCE_MS) return;
        this.lastSwitchTime = now;

        this.setPlayback({ isSwitching: true });
        this.switchingInProgress = true;
        const myTransId = ++this.currentTransitionId;
        const bpm = track.bpm ? parseFloat(track.bpm) : PLAYBACK_CONFIG.DEFAULT_BPM;

        let masterIdx = p.activeChannel;
        let targetIdx = masterIdx === 0 ? 1 : 0;

        try {
            if (p.mixMode && p.isPlaying && p.trackPath) {
                const trackToPlay = track.filePath;
                const meta = await window.peerifyAPI.getTrackMetadata(trackToPlay);

                const currentCrossfadeMs = (options.crossfade ?? s.crossfadeSeconds) * 1000;
                const curveType = options.curve || 'equal';
                const providedOffset = options.offset || 0;

                const trackBpm = meta?.bpm ? parseFloat(meta.bpm) : PLAYBACK_CONFIG.DEFAULT_BPM;

                let { inSeekMs, dropSwapMs } = this._calculatePhraseAlignment(meta, currentCrossfadeMs);

                // Manual offset overrides phrase calculator
                if (providedOffset > 0) {
                    inSeekMs = Math.floor(providedOffset * 1000);
                    dropSwapMs = currentCrossfadeMs;
                }

                // Correct inSeekMs for engine latency (+ skip ahead)
                inSeekMs = Math.max(0, inSeekMs + PLAYBACK_CONFIG.ENGINE_LATENCY_MS);

                // SYNC METADATA: Tell AudioManager about native BPMs
                const outTrackObj = l.tracks.find(t => comparePaths(t.filePath, p.trackPath));
                audioManager.updateTrackStats(masterIdx, outTrackObj?.bpm || PLAYBACK_CONFIG.DEFAULT_BPM, p.trackPath);
                audioManager.updateTrackStats(targetIdx, trackBpm, trackToPlay);

                await audioManager.prepareForTransition(masterIdx, targetIdx);
                await Promise.resolve(); // Micro-task tick to ensure IPC sync finishes reliably

                const success = await window.peerifyAPI.automix(
                    trackToPlay,
                    bpm,
                    PLAYBACK_CONFIG.ENGINE_FADE_MIN_MS, // Decoupled: use very short engine fade, let UI handle the curve
                    curveType,
                    dropSwapMs,
                    inSeekMs
                );

                if (success) {
                    const currentTrackObj = l.tracks.find(t => comparePaths(t.filePath, p.trackPath));
                    this.setPlayback({
                        trackPath: track.filePath,
                        duration: 0,
                        drop_pos: meta?.drop_pos ? parseFloat(meta.drop_pos) : 0,
                        outro_start: meta?.outro_start ? parseFloat(meta.outro_start) : 0,
                        statusMessage: `${get(t)('smooth_transition')} (${currentCrossfadeMs / 1000}s)...`
                    });
                    playbackProgress.set({ value: 0, lastUpdate: Date.now() });

                    const userMixStyle = this.settingsState.mixStyle || 'auto';
                    let playStyle = 'smooth';
                    if (userMixStyle !== 'auto') {
                        playStyle = userMixStyle;
                    } else {
                        // Auto: only gentle styles for regular playback
                        const gentleStyles = ['smooth', 'wash_out'];
                        playStyle = gentleStyles[Math.floor(Math.random() * gentleStyles.length)];
                    }
                    console.log(`[DJ] playTrack Style: ${playStyle} (mode: ${userMixStyle})`);

                    LyricsManager.clear();
                    audioManager.startTransition({
                        durationMs: currentCrossfadeMs,
                        fromChannel: masterIdx,
                        toChannel: targetIdx,
                        outBpm: currentTrackObj?.bpm ? parseFloat(currentTrackObj.bpm) : PLAYBACK_CONFIG.DEFAULT_BPM,
                        inBpm: bpm,
                        curve: curveType,
                        style: playStyle,
                        dropSwapMs,
                        inSeekMs,
                        automation: options.automation
                    });

                    // Update global FX state if track has specific settings
                    if (options.pitch) this.setPlayback({ pitchFactor: options.pitch });
                    if (options.reverb !== undefined) this.setPlayback({ reverbActive: options.reverb });

                    setTimeout(() => LyricsManager.loadLyrics(track.filePath), 200);

                    return;
                }
            }

            const currentTrackObj = l.tracks.find(t => comparePaths(t.filePath, p.trackPath));
            if (currentTrackObj && !p.playHistory.find((t) => t.filePath === currentTrackObj.filePath)) {
                this.setPlayback({ playHistory: [...p.playHistory, currentTrackObj] });
            }

            const trackMeta = await window.peerifyAPI.getTrackMetadata(track.filePath);
            this.setPlayback({
                trackPath: track.filePath,
                duration: 0,
                drop_pos: trackMeta?.drop_pos ? parseFloat(trackMeta.drop_pos) : 0,
                outro_start: trackMeta?.outro_start ? parseFloat(trackMeta.outro_start) : 0,
                isCrossfading: false,
                statusMessage: get(t)('loading')
            });
            playbackProgress.set({ value: 0, lastUpdate: Date.now() });

            U_API.stop(0);
            U_API.stop(1);

            const isSuccess = await window.peerifyAPI.playTrack(track.filePath, bpm);
            if (isSuccess) {
                this.setPlayback({
                    isPlaying: true,
                    activeChannel: 0,
                    bpm: bpm,
                    statusMessage: get(t)('playing')
                });
                audioManager.resetMods(0);

                // Apply track-specific settings
                if (options.pitch) this.setPlayback({ pitchFactor: options.pitch });
                if (options.reverb !== undefined) this.setPlayback({ reverbActive: options.reverb });

                setTimeout(() => LyricsManager.loadLyrics(track.filePath), 200);
            } else {
                this.setPlayback({
                    statusMessage: get(t)('playback_error'),
                    isPlaying: false
                });
            }
        } finally {
            this.setPlayback({ isSwitching: false });
            this.switchingInProgress = false;
        }
    }

    async handleHybridAutomix() {
        const p = this.playbackState;
        const l = this.libraryState;
        const s = this.settingsState;

        if (!p.trackPath || p.isSwitching || this.switchingInProgress || p.isCrossfading) {
            return;
        }
        const now = performance.now();
        if (now - this.lastSwitchTime < PLAYBACK_CONFIG.TRACK_SWITCH_DEBOUNCE_MS) return;
        this.lastSwitchTime = now;

        this.setPlayback({ isSwitching: true });
        this.switchingInProgress = true;

        let masterIdx = p.activeChannel;
        let targetIdx = masterIdx === 0 ? 1 : 0;

        try {
            const currentTrackObj = l.tracks.find(t => comparePaths(t.filePath, p.trackPath));
            const outgoingTrack = currentTrackObj;
            let nextTrackPathLocal = null,
                currentCrossfadeMs = p.mixMode ? s.crossfadeSeconds * 1000 : 0,
                curveType = 'equal',
                nextItem = null;

            if (p.playQueue.length > 0) {
                let nextIdx = p.shuffleMode ? Math.floor(Math.random() * p.playQueue.length) : 0;
                nextItem = p.playQueue[nextIdx];
                nextTrackPathLocal = nextItem.track.filePath;
                if (p.mixMode) currentCrossfadeMs = (nextItem.crossfade ?? s.crossfadeSeconds) * 1000;
                curveType = nextItem.curve || 'equal';
                const newQueue = [...p.playQueue];
                newQueue.splice(nextIdx, 1);
                this.setPlayback({ playQueue: newQueue });
            } else {
                try {
                    if (p.mixMode && window.peerifyAPI?.getHybridNextTrack && p.automixMode === 'ai')
                        nextTrackPathLocal = await window.peerifyAPI.getHybridNextTrack(p.trackPath);
                } catch (apiErr) {
                    console.error('API error getting next track:', apiErr);
                }
                if (!nextTrackPathLocal && l.tracks.length > 0) {
                    if (p.shuffleMode) {
                        const others = l.tracks.filter((t) => !comparePaths(t.filePath, p.trackPath));
                        const src = others.length > 0 ? others : l.tracks;
                        nextTrackPathLocal = src[Math.floor(Math.random() * src.length)].filePath;
                    } else {
                        const curIdx = l.tracks.findIndex((t) => comparePaths(t.filePath, p.trackPath));
                        nextTrackPathLocal =
                            curIdx !== -1 && curIdx + 1 < l.tracks.length
                                ? l.tracks[curIdx + 1].filePath
                                : l.tracks[0].filePath;
                    }
                }
            }

            const canRepeat = p.repeatMode === 'all' || p.playQueue.length > 0 || !nextTrackPathLocal;
            if (nextTrackPathLocal && (!comparePaths(nextTrackPathLocal, p.trackPath) || canRepeat)) {
                const nextPathToUse = nextTrackPathLocal;
                this.setPlayback({
                    trackPath: nextPathToUse,
                    duration: 0
                });
                playbackProgress.set({ value: 0, lastUpdate: Date.now() });

                const targetTrackObj = l.tracks.find((t) => comparePaths(t.filePath, nextPathToUse));
                const masterBeat = audioManager.getMasterBeatInfo();

                const currentBpm = outgoingTrack?.bpm ? parseFloat(outgoingTrack.bpm) : PLAYBACK_CONFIG.DEFAULT_BPM;
                const activeBpm = masterBeat.bpm > PLAYBACK_CONFIG.HIGH_ENERGY_BPM / 2 ? masterBeat.bpm : currentBpm;

                // BPM SYNC TOLERANCE (±8%)
                const MAX_SYNC_TOLERANCE = 0.08;
                const targetBpmRaw = activeBpm;
                const bpmDelta = Math.abs(currentBpm - targetBpmRaw) / (currentBpm || 120);

                let targetBpm;
                let forceFXTransition = false;

                if (bpmDelta <= MAX_SYNC_TOLERANCE) {
                    targetBpm = targetBpmRaw;
                } else {
                    // Difference too high: Stay at original BPM and use a dramatic FX transition
                    targetBpm = currentBpm;
                    forceFXTransition = true;
                    console.log(`[DJ] Sync Delta too high (${(bpmDelta * 100).toFixed(1)}%). Forcing original BPM & FX fallback.`);
                }

                if (p.mixMode) {
                    this.setPlayback({ isCrossfading: true });

                    const meta = await window.peerifyAPI.getTrackMetadata(nextPathToUse);
                    const dropPos = meta?.drop_pos ? parseFloat(meta.drop_pos) : 0;

                    const providedOffset = nextItem?.offset || 0;
                    const providedAutomation = nextItem?.automation || null;
                    const providedPitch = (nextItem?.pitch !== undefined) ? nextItem.pitch : p.pitchFactor;
                    const providedReverb = (nextItem?.reverb !== undefined) ? nextItem.reverb : p.reverbActive;

                    const beatDurRaw = 60000 / targetBpm;
                    const barDurRaw = beatDurRaw * 4.0;

                    let { inSeekMs: baseSeekMs, dropSwapMs, actualFadeMs } = this._calculatePhraseAlignment(meta, currentCrossfadeMs);

                    if (providedOffset > 0) {
                        baseSeekMs = Math.floor(providedOffset * 1000);
                        dropSwapMs = currentCrossfadeMs;
                    } else if (s.doubleDropMode && dropPos > 0) {
                        const reqBars = (s.crossfadeSeconds * 1000) / barDurRaw;
                        const phraseBars = reqBars >= 8 ? 16 : 8;
                        actualFadeMs = phraseBars * barDurRaw;
                        baseSeekMs = Math.floor(dropPos * 1000) - Math.floor(actualFadeMs);
                        dropSwapMs = actualFadeMs;
                    }

                    // 2. PHASE ALIGNMENT (DOWNBEAT-TO-DOWNBEAT)
                    let finalInSeek = 0;
                    if (masterBeat.bpm > 0) {
                        const msToNextDownbeat = GridManager.getMsToNextDownbeat(outgoingTrack, this.progressState.value, masterBeat.bpm);
                        finalInSeek = Math.max(0, baseSeekMs - Math.floor(msToNextDownbeat));
                    } else {
                        finalInSeek = Math.max(0, baseSeekMs);
                    }

                    finalInSeek = Math.max(0, finalInSeek + PLAYBACK_CONFIG.ENGINE_LATENCY_MS);

                    audioManager.updateTrackStats(masterIdx, currentBpm, p.trackPath);
                    audioManager.updateTrackStats(targetIdx, targetTrackObj?.bpm || targetBpm, nextPathToUse);

                    await audioManager.prepareForTransition(masterIdx, targetIdx);
                    await Promise.resolve();

                    const success = await window.peerifyAPI.automix(
                        nextPathToUse,
                        targetBpm,
                        PLAYBACK_CONFIG.ENGINE_FADE_MIN_MS,
                        curveType,
                        dropSwapMs,
                        finalInSeek
                    );
                    if (success) {
                        this.setPlayback({ isPlaying: true, bpm: targetBpm });

                        const userStyle = this.settingsState.mixStyle || 'auto';
                        let transitionStyle = 'smooth';

                        if (userStyle !== 'auto') {
                            transitionStyle = userStyle;
                        } else if (forceFXTransition) {
                            // High BPM difference: Use energy-braking styles
                            const roll = Math.random();
                            transitionStyle = roll > 0.5 ? 'vinyl_brake' : 'echo_out';
                        } else {
                            const bpmDiff = Math.abs(currentBpm - targetBpm);
                            const bpmDiffPct = bpmDiff / (currentBpm || 120);
                            const isHighEnergy = targetBpm > PLAYBACK_CONFIG.HIGH_ENERGY_BPM;
                            const hasDropPos = meta?.drop_pos && parseFloat(meta.drop_pos) > 0;
                            const normalizeGenre = (g) => (g || '').toLowerCase().replace(/[\s\-_]+/g, '');
                            const outGenre = normalizeGenre(outgoingTrack?.genre);
                            const inGenre = normalizeGenre(targetTrackObj?.genre);
                            const genreChange = outGenre !== inGenre && outGenre.length > 0 && inGenre.length > 0;
                            const roll = Math.random();

                            const pickStyle = (candidates) => {
                                const filtered = candidates.filter(s => s !== this.lastUsedStyle);
                                const pool = filtered.length > 0 ? filtered : candidates;
                                return pool[Math.floor(roll * pool.length)];
                            };

                            if (bpmDiffPct > PLAYBACK_CONFIG.TEMPO_RAMP_THRESHOLD) {
                                transitionStyle = roll > 0.5 ? 'vinyl_brake' : 'tempo_ramp';
                            } else if (isHighEnergy && hasDropPos && targetBpm > 130) {
                                transitionStyle = pickStyle(['slam', 'power_mix']);
                            } else if (genreChange) {
                                transitionStyle = pickStyle(['echo_out', 'low_pass_sweep', 'power_mix']);
                            } else if (targetBpm > PLAYBACK_CONFIG.WASH_OUT_BPM) {
                                transitionStyle = pickStyle(['power_mix', 'wash_out', 'echo_out', 'low_pass_sweep']);
                            } else {
                                transitionStyle = pickStyle(['power_mix', 'smooth', 'wash_out', 'echo_out', 'vinyl_brake']);
                            }
                        }

                        console.log(`[DJ] Style: ${transitionStyle} (mode: ${userStyle}) | BPM: ${currentBpm}→${targetBpm}`);
                        this.lastUsedStyle = transitionStyle;

                        LyricsManager.clear();
                        audioManager.startTransition({
                            durationMs: actualFadeMs,
                            fromChannel: masterIdx,
                            toChannel: targetIdx,
                            outBpm: currentBpm,
                            inBpm: targetBpm,
                            curve: curveType,
                            style: transitionStyle,
                            dropSwapMs,
                            inSeekMs: finalInSeek,
                            automation: providedAutomation
                        });

                        if (providedPitch) this.setPlayback({ pitchFactor: providedPitch });
                        if (providedReverb !== undefined) this.setPlayback({ reverbActive: providedReverb });

                    } else {
                        U_API.stop(0);
                        U_API.stop(1);
                        const fallback = await window.peerifyAPI.playTrack(nextPathToUse, targetBpm);
                        if (fallback) {
                            this.setPlayback({ isPlaying: true, activeChannel: 0 });
                            audioManager.resetMods(0);
                        }
                        this.setPlayback({
                            statusMessage: fallback ? get(t)('playing') : get(t)('playback_error'),
                            isPlaying: !!fallback,
                            isCrossfading: false
                        });
                    }
                }
                else {
                    U_API.stop(0);
                    U_API.stop(1);
                    const fallback = await window.peerifyAPI.playTrack(nextPathToUse, targetBpm);
                    if (fallback) {
                        this.setPlayback({ isPlaying: true, activeChannel: 0 });
                        audioManager.resetMods(0);
                    }
                    this.setPlayback({
                        statusMessage: fallback ? get(t)('playing') : get(t)('playback_error'),
                        isPlaying: !!fallback
                    });
                }
            } else {
                this.setPlayback({ statusMessage: get(t)('stopped'), isPlaying: false });
            }
        } finally {
            this.setPlayback({ isSwitching: false });
            this.switchingInProgress = false;
        }
    }

    startPolling() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        // This interval is for background LOGIC (automix, sync). 
        // It stays active even when minimized due to backgroundThrottling: false.
        this.pollInterval = setInterval(() => this.pollProgress(), PLAYBACK_CONFIG.POLL_INTERVAL_MS);
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    startRendering() {
        if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
        this.renderFrame();
    }

    stopRendering() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    renderFrame() {
        const now = performance.now();
        if (now - this._lastUITime >= 32) {
            this._lastUITime = now;
            this.updateSmoothProgress();
        }
        this.animationFrame = requestAnimationFrame(() => this.renderFrame());
    }

    updateSmoothProgress() {
        const p = this.playbackState;
        if (!p.isPlaying || p.isSwitching) return;

        // Interpolate progress: baseTime + (timeSinceLastFetch * pitch)
        const now = performance.now();
        const deltaSec = (now - this.lastFetchTimestamp) / 1000;
        const currentPitch = p.pitchFactor || 1.0;

        // Only interpolate if we have a recent fetch (within 1 second)
        if (this.lastFetchTimestamp > 0 && deltaSec < 1.0) {
            const interpolatedTime = this.lastEngineTime + (deltaSec * currentPitch);
            // Don't overshoot duration
            const clampedTime = p.duration > 0 ? Math.min(p.duration, interpolatedTime) : interpolatedTime;

            // OPTIMIZATION: Only update store if meaningful change (> 33ms or large jump)
            const lastVal = get(playbackProgress).value;
            if (Math.abs(clampedTime - lastVal) > 0.033 || Math.abs(clampedTime - lastVal) > 1.0) {
                playbackProgress.set({ value: clampedTime, lastUpdate: now });
            }
        }
    }

    async pollProgress() {
        const p = this.playbackState;
        const l = this.libraryState;
        const s = this.settingsState;
        const now = performance.now();

        if (!p.isPlaying && !p.isSwitching && now % PLAYBACK_CONFIG.SYNC_CHECK_INTERVAL_MS < PLAYBACK_CONFIG.SYNC_CHECK_WINDOW_MS) {
            try {
                const realState = await window.peerifyAPI.isPlaying();
                if (realState && !p.isPlaying) {
                    this.setPlayback({ isPlaying: true });
                }
            } catch (e) { }
        }

        if (p.isPlaying && !p.isSwitching) {
            try {
                const currentTime = await window.peerifyAPI.getCurrentTime();
                const duration = await window.peerifyAPI.getDuration();

                // Track state for rAF interpolation
                this.lastEngineTime = currentTime;
                this.lastFetchTimestamp = performance.now();

                this.setPlayback({ duration: duration });
                playbackProgress.set({ value: currentTime, lastUpdate: performance.now() });

                const currentTrackObj = l.tracks.find(t => comparePaths(t.filePath, p.trackPath));
                if (currentTrackObj?.drop_pos && p.trackPath !== this.lastDropTriggered) {
                    const dropPos = parseFloat(currentTrackObj.drop_pos);
                    if (currentTime >= dropPos - PLAYBACK_CONFIG.DROP_ANNOUNCEMENT_WINDOW_PRE && currentTime <= dropPos + PLAYBACK_CONFIG.DROP_ANNOUNCEMENT_WINDOW_POST) {
                        window.dispatchEvent(new CustomEvent('mascot-announcement', { detail: 'DROP!' }));
                        this.lastDropTriggered = p.trackPath;
                    }
                }

                // Sync Lyrics
                if (this.lyricsState.length > 0) {
                    LyricsManager.update(currentTime, this.lyricsState);
                }

                if (!p.isCrossfading && !p.isSwitching) {
                    audioManager.resetMods(p.activeChannel);
                }
                await this.checkAutoMixTrigger();
            } catch (err) {
                console.error('[Playback] Progress poll failed:', err);
            }
        }
    }

    async checkAutoMixTrigger() {
        const p = this.playbackState;
        const l = this.libraryState;
        const s = this.settingsState;
        const progress = this.progressState.value;

        if (p.isPlaying && !p.isSwitching && !p.isCrossfading && p.duration > PLAYBACK_CONFIG.MIN_DURATION_FOR_MIX && progress > PLAYBACK_CONFIG.MIN_PROGRESS_FOR_MIX) {
            const currentTrackObj = l.tracks.find(t => comparePaths(t.filePath, p.trackPath));
            const currentBpm = currentTrackObj?.bpm ? parseFloat(currentTrackObj.bpm) : PLAYBACK_CONFIG.DEFAULT_BPM;
            const beatDuration = 60.0 / currentBpm;
            const timeToNextBeat = beatDuration - (progress % beatDuration);
            let targetEndTime = p.duration;

            if (p.mixMode && s.autoCutSilence && currentTrackObj?.outro_start) {
                const outroStart = parseFloat(currentTrackObj.outro_start);
                const minOutroThreshold = p.duration * 0.6;
                // Treat outro_start as the target end time
                if (outroStart > minOutroThreshold && outroStart < p.duration - 1) {
                    targetEndTime = outroStart;
                }
            }

            const triggerThreshold = p.mixMode ? s.crossfadeSeconds : 0.5;
            if (progress >= targetEndTime - triggerThreshold) {
                // Determine if we are exactly on a downbeat
                const mb = audioManager.getMasterBeatInfo();
                let isDownbeat = false;
                if (mb.bpm > 0) {
                    isDownbeat = mb.barPhase < PLAYBACK_CONFIG.DOWNBEAT_TOLERANCE || mb.barPhase > (1.0 - PLAYBACK_CONFIG.DOWNBEAT_TOLERANCE);
                } else {
                    isDownbeat = timeToNextBeat < PLAYBACK_CONFIG.FALLBACK_BEAT_TOLERANCE_S || timeToNextBeat > beatDuration - PLAYBACK_CONFIG.FALLBACK_BEAT_TOLERANCE_S;
                }

                const forceTrigger = progress >= targetEndTime + (triggerThreshold * PLAYBACK_CONFIG.FORCE_TRIGGER_DELAY_COEFF) || progress >= p.duration - PLAYBACK_CONFIG.FORCE_TRIGGER_END_THRESHOLD;

                const isThinning = mb.energyTrend < -0.35 && progress >= targetEndTime - (triggerThreshold * 2.0);

                if (!p.mixMode || isDownbeat || forceTrigger || isThinning || this.visualsState.kickLevel > PLAYBACK_CONFIG.KICK_TRIGGER_THRESHOLD) {
                    if (p.repeatMode === 'one') {
                        await window.peerifyAPI.seekTo(0);
                        playbackProgress.set({ value: 0, lastUpdate: Date.now() });
                    } else {
                        await this.handleHybridAutomix();
                    }
                }
            }
        }
    }

    addToQueue(track) {
        if (!track?.filePath) return;
        const p = this.playbackState;
        const s = this.settingsState;
        const newQueue = [
            ...p.playQueue,
            { id: performance.now() + Math.random(), track: track, crossfade: s.crossfadeSeconds }
        ];
        this.setPlayback({
            playQueue: newQueue,
            statusMessage: `${get(t)('indexed_tracks_count')} ${newQueue.length} ${get(t)('tracks_count')}`
        });
    }

    removeFromQueue(id) {
        const p = this.playbackState;
        const newQueue = p.playQueue.filter((item) => item.id !== id);
        this.setPlayback({
            playQueue: newQueue,
            statusMessage: get(t)('track_removed_from_queue')
        });
    }

    async playFromQueue(idx) {
        const p = this.playbackState;
        const i = p.playQueue[idx];
        if (!i) return;
        this.setPlayback({ playQueue: p.playQueue.slice(idx + 1) });
        await this.playLocalTrack(i.track, {
            pitch: i.pitch !== undefined ? i.pitch : p.pitchFactor,
            reverb: i.reverb !== undefined ? i.reverb : p.reverbActive,
            crossfade: i.crossfade
        });
    }

    applyPitch(factor) {
        const p = this.playbackState;
        if (p.pitchFactor === factor && p.activeEffect !== 'slowed_reverb') {
            this.setPlayback({ pitchFactor: 1.0, activeEffect: 'none' });
        } else {
            let effect = 'none';
            if (factor === this.customSlowedPitch) effect = 'slowed';
            else if (factor === PLAYBACK_CONFIG.PITCH_SUPER_SLOWED) effect = 'super_slowed';
            else if (factor === PLAYBACK_CONFIG.PITCH_NIGHTCORE) effect = 'nightcore';
            this.setPlayback({ pitchFactor: factor, activeEffect: effect });
        }
    }

    toggleSlowedReverb() {
        const p = this.playbackState;
        if (p.activeEffect === 'slowed_reverb') {
            this.setPlayback({ activeEffect: 'none', pitchFactor: 1.0, reverbActive: false });
        } else {
            this.setPlayback({
                activeEffect: 'slowed_reverb',
                pitchFactor: this.customSlowedPitch,
                reverbActive: true,
                reverbLevel: Math.max(p.reverbLevel || 0, 0.75) // rich default for lush sound
            });
        }
    }

    toggleReverb() {
        const p = this.playbackState;
        this.setPlayback({ reverbActive: !p.reverbActive });
    }

    handleToggleRepeat() {
        const p = this.playbackState;
        const m = ['none', 'one', 'all'];
        this.setPlayback({ repeatMode: m[(m.indexOf(p.repeatMode) + 1) % m.length] });
    }

    handleToggleShuffle() {
        const p = this.playbackState;
        this.setPlayback({ shuffleMode: !p.shuffleMode });
    }

    updateMediaSession() {
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
            const p = this.playbackState;
            const l = this.libraryState;
            const currentTrackObj = l.tracks.find(t => comparePaths(t.filePath, p.trackPath));

            if (p.trackPath && currentTrackObj) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: currentTrackObj.title || p.trackPath.split(/[\\/]/).pop(),
                    artist: currentTrackObj.genre || 'Peerify',
                    album: 'Peerify Library',
                    artwork: [{ src: 'icon.png', sizes: '512x512', type: 'image/png' }]
                });
            }
            navigator.mediaSession.playbackState = p.isPlaying ? 'playing' : 'paused';
        }
    }

    initMediaSession() {
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => this.handleToggle());
            navigator.mediaSession.setActionHandler('pause', () => this.handleToggle());
            navigator.mediaSession.setActionHandler('nexttrack', () => this.handleHybridAutomix());
            navigator.mediaSession.setActionHandler('previoustrack', () => this.handlePrevious());
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (details.seekTime !== undefined) this.handleSeek(details.seekTime);
            });
    }
    }

    async previewTransition(trackA, trackB, options = {}) {
        if (!trackA?.filePath || !trackB?.filePath) return;
        
        const crossfadeDur = options.duration || 5;
        const curve = options.curve || 'equal';
        const offset = options.offset || 0;
        
        // 1. Stop everything
        this.setPlayback({ isPlaying: false, isCrossfading: false });
        U_API.stop(0);
        U_API.stop(1);

        // 2. Load and Play Track A (Outgoing)
        const bpmA = trackA.bpm || 120;
        const success = await window.peerifyAPI.playTrack(trackA.filePath, bpmA);
        if (!success) return;

        const durA = await window.peerifyAPI.getDuration();
        const startPoint = Math.max(0, durA - crossfadeDur - 5);
        
        await window.peerifyAPI.seekTo(startPoint);
        this.setPlayback({ isPlaying: true, activeChannel: 0, trackPath: trackA.filePath, duration: durA });

        // 3. Monitor for transition point
        const monitorId = setInterval(async () => {
            const now = await window.peerifyAPI.getCurrentTime();
            // Start transition slightly early for sync/engine latency (e.g. at the exact point)
            if (now >= durA - crossfadeDur - 0.1) {
                clearInterval(monitorId);
                this.playLocalTrack(trackB, {
                    crossfade: crossfadeDur,
                    curve: curve,
                    offset: offset
                });
            }
            // Stop if user cancelled or changed track
            if (!get(playback).isPlaying || !comparePaths(get(playback).trackPath, trackA.filePath)) {
                clearInterval(monitorId);
            }
        }, 100);
    }
}

export const playbackManager = new PlaybackManager();
