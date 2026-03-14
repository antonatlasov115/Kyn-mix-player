import { audioVisuals, playback } from '../stores/playback';
import { get } from 'svelte/store';

class VisualizerManager {
    constructor() {
        this.analysisId = null;
        this.lastFFTTime = 0;
        this.FFT_INTERVAL = 50; // ~20fps (Optimized for performance)
        this.spectrum32 = Array(32).fill(0);
        this.lastLevels = { audioLevel: 0, kickLevel: 0, bassLevel: 0, vocalLevel: 0 };
    }

    start() {
        if (this.analysisId) cancelAnimationFrame(this.analysisId);
        this.analyze();
    }

    stop() {
        if (this.analysisId) {
            clearTimeout(this.analysisId);
            this.analysisId = null;
        }
    }

    analyze() {
        const now = performance.now();
        const p = get(playback);

        if (p.isPlaying && !p.isSwitching && !p.isCrossfading && now - this.lastFFTTime >= this.FFT_INTERVAL) {
            this.lastFFTTime = now;
            try {
                if (window.peerifyAPI?.mixer?.getActiveFFT) {
                    window.peerifyAPI.mixer.getActiveFFT().then((fft) => {
                        if (!fft || fft.length === 0) return;

                        const volume = p.volume;
                        const autoGain = 1.0 + Math.max(0, 1.0 - volume * 2);
                        let cleanBass = fft[0] + fft[1] + fft[2];
                        let kickLevel = cleanBass * 0.4 * autoGain;
                        let bassLevel = (fft[3] + fft[4] + fft[5]) * 0.3 * autoGain;
                        let vocalLevel = (fft[12] + fft[13] + fft[14]) * 0.25 * autoGain;
                        let audioLevel = (cleanBass * 0.5 + Math.abs(cleanBass - kickLevel) * 3.5) * autoGain;

                        // Dirty checking: Only update if meaningfully changed or time has passed (force update every 200ms)
                        const diff = Math.abs(audioLevel - this.lastLevels.audioLevel) + 
                                     Math.abs(kickLevel - this.lastLevels.kickLevel) + 
                                     Math.abs(vocalLevel - this.lastLevels.vocalLevel);
                        
                        const shouldUpdate = diff > 0.01 || (now - this.lastUpdateTime > 200);

                        if (shouldUpdate) {
                            const binsPerBand = Math.floor(fft.length / 32);
                            for (let i = 0; i < 32; i++) {
                                let sum = 0;
                                for (let i_bin = 0; i_bin < binsPerBand; i_bin++)
                                    sum += fft[i * binsPerBand + i_bin] || 0;

                                this.spectrum32[i] =
                                    this.spectrum32[i] + ((sum / binsPerBand) * autoGain * 2.5 - this.spectrum32[i]) * 0.3;
                            }

                            audioVisuals.set({
                                audioLevel,
                                kickLevel,
                                bassLevel,
                                vocalLevel,
                                spectrum: [...this.spectrum32]
                            });

                            this.lastLevels = { audioLevel, kickLevel, bassLevel, vocalLevel };
                            this.lastUpdateTime = now;
                        }
                    });
                }
            } catch (e) {
                console.error('FFT Error:', e);
            }
        } else if (!p.isPlaying) {
            audioVisuals.update((s) => ({ ...s, audioLevel: s.audioLevel * 0.8 }));
        }

        const isHidden = document.visibilityState === 'hidden'
        this.analysisId = setTimeout(() => this.analyze(), isHidden ? 500 : this.FFT_INTERVAL);
    }
}

export const visualizerManager = new VisualizerManager();
