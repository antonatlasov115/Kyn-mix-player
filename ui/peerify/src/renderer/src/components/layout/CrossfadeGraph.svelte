<script>
    import { engineState } from '../../lib/stores/engine';

    // Pre-allocated object pool for zero-GC updates
    const MAX_HISTORY = 60;
    let history = Array(MAX_HISTORY).fill(0).map(() => ({
        t: 0, v0: 0, v1: 0, b0: 0, b1: 0, h0: 0, active: false
    }));
    let writeIndex = 0;
    let historySize = 0;

    $: if ($engineState.isCrossfading) {
        const stats = history[writeIndex];
        // In-place update of object properties to avoid GC churn
        stats.t = $engineState.transitionProgress || 0;
        stats.v0 = $engineState.decks[0].vol;
        stats.v1 = $engineState.decks[1].vol;
        stats.b0 = $engineState.decks[0].bass;
        stats.b1 = $engineState.decks[1].bass;
        stats.h0 = $engineState.decks[0].hpf;
        stats.active = true;

        writeIndex = (writeIndex + 1) % MAX_HISTORY;
        historySize = Math.min(MAX_HISTORY, historySize + 1);
        
        // Trigger Svelte reactivity with zero array allocation
        history = history;
    } else {
        if (historySize > 0) {
            // Bulk reset without reallocation
            for (let i = 0; i < MAX_HISTORY; i++) {
                history[i].active = false;
            }
            writeIndex = 0;
            historySize = 0;
            history = history;
        }
    }

    // Reactive path pre-calculation
    let pathV0 = "", pathV1 = "", pathB0 = "", pathB1 = "";
    $: {
        if (historySize >= 2) {
            pathV0 = getPath('v0', 1, 0);
            pathV1 = getPath('v1', 1, 0);
            pathB0 = getEqPath(0, 'b');
            pathB1 = getEqPath(1, 'b');
        } else {
            pathV0 = pathV1 = pathB0 = pathB1 = "";
        }
    }

    function getPath(key, scale = 1, offset = 0) {
        if (historySize < 2) return "";
        let path = "";
        for (let i = 0; i < historySize; i++) {
            // Calculate index considering circular buffer
            const idx = (writeIndex - historySize + i + MAX_HISTORY) % MAX_HISTORY;
            const p = history[idx];
            
            const x = (i / (MAX_HISTORY - 1)) * 200;
            const y = 60 - (p[key] * 50 * scale + offset);
            path += `${i === 0 ? 'M' : 'L'} ${x} ${y} `;
        }
        return path;
    }

    function getEqPath(deckIdx, band) {
        let path = "";
        for (let i = 0; i < historySize; i++) {
            const idx = (writeIndex - historySize + i + MAX_HISTORY) % MAX_HISTORY;
            const p = history[idx];
            
            const x = (i / (MAX_HISTORY - 1)) * 200;
            const val = p[`${band}${deckIdx}`];
            const norm = (val + 45) / 45;
            const y = 60 - (norm * 50);
            path += `${i === 0 ? 'M' : 'L'} ${x} ${y} `;
        }
        return path;
    }
</script>

<div class="crossfade-graph">
    <svg viewBox="0 0 200 60" preserveAspectRatio="none">
        <!-- Guidelines -->
        <line x1="0" y1="10" x2="200" y2="10" stroke="rgba(255,255,255,0.1)" stroke-dasharray="4" />
        <line x1="0" y1="60" x2="200" y2="60" stroke="rgba(255,255,255,0.1)" stroke-dasharray="4" />

        <!-- Volume Curves -->
        <path d={pathV0} fill="none" stroke="#ff4444" stroke-width="1.5" opacity="0.8" />
        <path d={pathV1} fill="none" stroke="#44ff44" stroke-width="1.5" opacity="0.8" />

        <!-- Bass Handover -->
        <path d={pathB0} fill="none" stroke="#ffaa44" stroke-width="1" stroke-dasharray="2" opacity="0.5" />
        <path d={pathB1} fill="none" stroke="#44aaff" stroke-width="1" stroke-dasharray="2" opacity="0.5" />
    </svg>
    <div class="labels">
        <span style="color: #ff4444">OUT VOL</span>
        <span style="color: #44ff44">IN VOL</span>
        <span style="color: #ffaa44">BASS</span>
    </div>
</div>

<style>
    .crossfade-graph {
        width: 100%;
        height: 80px;
        background: rgba(0,0,0,0.3);
        border-radius: 4px;
        position: relative;
        overflow: hidden;
        margin: 8px 0;
        border: 1px solid rgba(255,255,255,0.05);
    }
    svg {
        width: 100%;
        height: 100%;
    }
    .labels {
        position: absolute;
        bottom: 4px;
        left: 4px;
        right: 4px;
        display: flex;
        justify-content: space-between;
        font-size: 8px;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        pointer-events: none;
        opacity: 0.7;
    }
</style>
