export class BeatDetector {
    private history: Float32Array;
    private historySize: number = 60;
    private historyIndex: number = 0;
    private historySum: number = 0;

    private longHistory: Float32Array;
    private longHistorySize: number = 200;
    private longHistoryIndex: number = 0;
    private longHistorySum: number = 0;

    private driftResetCounter: number = 0;
    private readonly DRIFT_RESET_INTERVAL: number = 2000;

    private thresholdMultiplier: number = 1.45;
    private lastBeatTime: number = 0;
    private minInterval: number = 200;
    private energyFactor: number = 1.0;

    private beatIntervals: Float32Array;
    private beatIntervalsIndex: number = 0;
    private beatIntervalsCount: number = 0;
    private estimatedBpm: number = 0;
    private fallbackBpm: number = 120.0;
    private maxIntervals: number = 24;

    // PLL (Phase-Locked Loop) State
    private pllPhase: number = 0;
    private pllBarPhase: number = 0;
    private lastPllUpdateTime: number = 0;
    private pllLockFactor: number = 0.08;
    private pllLockedFactor: number = 0.15;
    private isLocked: boolean = false;

    private energyTrend: number = 0;
    private barCount: number = 0;
    private hasNewBar: boolean = false;
    private sortBuffer: Float32Array;

    constructor() {
        this.history = new Float32Array(this.historySize);
        this.longHistory = new Float32Array(this.longHistorySize);
        this.beatIntervals = new Float32Array(this.maxIntervals);
        this.sortBuffer = new Float32Array(this.maxIntervals);
    }

    process(level: number, sensitivity: number = 1.0): boolean {
        const now = performance.now();
        const adjustedLevel = level * sensitivity;

        // 1. Maintain history buffer (Ring Buffer + Running Sum)
        const oldVal = this.history[this.historyIndex];
        this.historySum = this.historySum - oldVal + adjustedLevel;
        this.history[this.historyIndex] = adjustedLevel;
        this.historyIndex = (this.historyIndex + 1) % this.historySize;

        // Long history (Ring Buffer + Running Sum)
        const oldLongVal = this.longHistory[this.longHistoryIndex];
        this.longHistorySum = this.longHistorySum - oldLongVal + adjustedLevel;
        this.longHistory[this.longHistoryIndex] = adjustedLevel;
        this.longHistoryIndex = (this.longHistoryIndex + 1) % this.longHistorySize;

        // Drift Compensation: Periodically re-calculate sums to prevent floating point error accumulation
        this.driftResetCounter++;
        if (this.driftResetCounter >= this.DRIFT_RESET_INTERVAL) {
            this.recalculateSums();
            this.driftResetCounter = 0;
        }

        // Update PLL Phase based on time delta
        if (this.lastPllUpdateTime > 0) {
            const deltaMs = now - this.lastPllUpdateTime;
            const activeBpm = this.getEstimatedBpm();
            const beatDur = 60000 / activeBpm;

            const oldBarPhase = this.pllBarPhase;
            this.pllPhase = (this.pllPhase + deltaMs / beatDur) % 1.0;
            this.pllBarPhase = (this.pllBarPhase + deltaMs / (beatDur * 4.0)) % 1.0;

            if (this.pllBarPhase < oldBarPhase) {
                this.barCount++;
                this.hasNewBar = true;
            }
        }
        this.lastPllUpdateTime = now;

        // Energy calculations (O(1) thanks to Running Sums)
        const avgEnergy = this.historySum / this.historySize;
        const longAvg = this.longHistorySum / this.longHistorySize;

        if (longAvg > 0.01) {
            this.energyTrend = (avgEnergy - longAvg) / longAvg;
        }

        // 3. Kick Detection (Sharper transients)
        const isOnset = adjustedLevel > (avgEnergy * this.thresholdMultiplier);
        const cooldownOk = (now - this.lastBeatTime) > this.minInterval;

        if (isOnset && cooldownOk) {
            const interval = now - this.lastBeatTime;

            if (this.lastBeatTime > 0 && interval > 270 && interval < 1500) {
                this.beatIntervals[this.beatIntervalsIndex] = interval;
                this.beatIntervalsIndex = (this.beatIntervalsIndex + 1) % this.maxIntervals;
                this.beatIntervalsCount = Math.min(this.maxIntervals, this.beatIntervalsCount + 1);
                this.calculateBpm();
            }

            let phaseError = this.pllPhase;
            if (phaseError > 0.5) phaseError -= 1.0;

            const correctionFactor = this.isLocked ? this.pllLockedFactor : this.pllLockFactor;
            this.pllPhase = (this.pllPhase - phaseError * correctionFactor + 1.0) % 1.0;

            if (interval > 4000 || !this.isLocked) {
                this.pllBarPhase = 0;
                this.isLocked = true;
            } else {
                let barError = this.pllBarPhase % 0.25;
                if (barError > 0.125) barError -= 0.25;
                this.pllBarPhase = (this.pllBarPhase - barError * (this.pllLockFactor * 0.5) + 1.0) % 1.0;
            }

            this.lastBeatTime = now;
            this.energyFactor = adjustedLevel / (avgEnergy || 0.1);
            return true;
        }

        return false;
    }

    private recalculateSums() {
        let hSum = 0;
        for (let i = 0; i < this.historySize; i++) hSum += this.history[i];
        this.historySum = hSum;

        let lSum = 0;
        for (let i = 0; i < this.longHistorySize; i++) lSum += this.longHistory[i];
        this.longHistorySum = lSum;
    }

    private calculateBpm() {
        if (this.beatIntervalsCount < 10) return;

        // Zero-allocation sorting using a pre-allocated buffer and views
        this.sortBuffer.set(this.beatIntervals.subarray(0, this.beatIntervalsCount));
        const activeView = this.sortBuffer.subarray(0, this.beatIntervalsCount).sort();
        
        const median = activeView[Math.floor(activeView.length / 2)];
        const rawBpm = 60000 / median;
        this.estimatedBpm = Math.round(rawBpm * 100) / 100;
    }

    getEstimatedBpm(): number {
        return this.estimatedBpm > 0 ? this.estimatedBpm : this.fallbackBpm;
    }

    setFallbackBpm(bpm: number) {
        this.fallbackBpm = bpm;
    }

    getEnergyFactor(): number {
        return this.energyFactor;
    }

    getPhaseOffset(): number {
        return this.pllPhase;
    }

    getBarPhaseOffset(): number {
        return this.pllBarPhase;
    }

    getLastBeatTime(): number {
        return this.lastBeatTime;
    }

    getEnergyTrend(): number {
        return this.energyTrend;
    }

    getAverageEnergy(): number {
        return this.historySum / this.historySize;
    }

    getBarCount(): number {
        return this.barCount;
    }

    consumeNewBar(): boolean {
        const val = this.hasNewBar;
        this.hasNewBar = false;
        return val;
    }

    /**
     * Returns true if we are within a small window of the downbeat (phase 0.0)
     */
    isNearDownbeat(window: number = 0.1): boolean {
        return this.pllPhase < window || this.pllPhase > (1.0 - window);
    }

    isNearBarStart(window: number = 0.05): boolean {
        return this.pllBarPhase < window || this.pllBarPhase > (1.0 - window);
    }

    reset() {
        this.history.fill(0);
        this.historyIndex = 0;
        this.historySum = 0;

        this.longHistory.fill(0);
        this.longHistoryIndex = 0;
        this.longHistorySum = 0;

        this.beatIntervals.fill(0);
        this.beatIntervalsIndex = 0;
        this.beatIntervalsCount = 0;

        this.lastBeatTime = 0;
        this.estimatedBpm = 0;
        this.pllPhase = 0;
        this.pllBarPhase = 0;
        this.lastPllUpdateTime = 0;
        this.isLocked = false;
        this.barCount = 0;
        this.hasNewBar = false;
        this.energyTrend = 0;
        this.driftResetCounter = 0;
    }
}
