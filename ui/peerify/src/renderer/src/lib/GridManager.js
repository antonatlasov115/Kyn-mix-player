/**
 * Peerify GridManager
 * Mathematical phase tracking using pre-analyzed beatgrids.
 */

export class GridManager {
    /**
     * Calculates the phase (0.0 to 1.0) and bar phase (0.0 to 1.0) at a given track time.
     * @param {Object} metadata Track metadata containing beatgrid (JSON array of timestamps)
     * @param {number} currentTime Current playback time in seconds
     * @param {number} currentBpm Current master BPM
     * @returns {Object} { phase, barPhase, nearestBeatTime }
     */
    static getPhaseAtTime(metadata, currentTime, currentBpm) {
        if (!metadata) return { phase: 0, barPhase: 0, nearestBeatTime: 0 };
        
        const beatDuration = 60 / (currentBpm || 120);
        const barDuration = beatDuration * 4;

        // 1. Check if we have a hard grid from analysis
        const grid = metadata.beat_grid;
        if (grid && Array.isArray(grid) && grid.length > 0) {
            // Find the beat immediately before or at current time
            // Binary search for performance if grid is large
            let low = 0, high = grid.length - 1;
            let beatIdx = -1;
            
            while (low <= high) {
                let mid = Math.floor((low + high) / 2);
                if (grid[mid] <= currentTime) {
                    beatIdx = mid;
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }

            if (beatIdx !== -1) {
                const beatTime = grid[beatIdx];
                const timeInBeat = currentTime - beatTime;
                
                // Absolute phase relative to the grid
                const phase = (timeInBeat / beatDuration) % 1.0;
                
                // Bar phase (assuming 4/4)
                const beatInBar = beatIdx % 4;
                const barPhase = ((beatInBar + (timeInBeat / beatDuration)) / 4.0) % 1.0;
                
                return { phase, barPhase, nearestBeatTime: beatTime };
            }
        }

        // 2. Fallback: Heuristic based on first_beat/drop_pos or intro_end
        const anchor = metadata?.first_beat || metadata?.drop_pos || metadata?.intro_end || 0;
        const timeFromAnchor = currentTime - anchor;
        
        // Mathematical modulo phase
        let phase = (timeFromAnchor / beatDuration) % 1.0;
        if (phase < 0) phase += 1.0;
        
        let barPhase = (timeFromAnchor / barDuration) % 1.0;
        if (barPhase < 0) barPhase += 1.0;

        return { phase, barPhase, nearestBeatTime: anchor + Math.floor(timeFromAnchor / beatDuration) * beatDuration };
    }

    /**
     * Calculates the time offset needed to align current time with the next downbeat.
     */
    static getMsToNextDownbeat(metadata, currentTime, currentBpm) {
        const info = this.getPhaseAtTime(metadata, currentTime, currentBpm);
        const beatDuration = 60 / (currentBpm || 120);
        const barDuration = beatDuration * 4;
        
        const msRemaining = (1.0 - info.barPhase) * barDuration * 1000;
        return msRemaining;
    }
}
