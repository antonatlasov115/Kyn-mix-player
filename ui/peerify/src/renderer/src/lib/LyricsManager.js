import { writable } from 'svelte/store';

export const currentLyrics = writable([]); // [{time: seconds, text: string}]
export const activeLyricLine = writable('');

export class LyricsManager {
    static parseLRC(lrcText) {
        const lines = lrcText.split(/\r?\n/);
        const lyrics = [];
        const timeRegex = /\[(\d+):(\d+\.\d+)\]/;

        for (const line of lines) {
            const match = timeRegex.exec(line);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseFloat(match[2]);
                const time = minutes * 60 + seconds;
                const text = line.replace(timeRegex, '').trim();
                if (text) {
                    lyrics.push({ time, text });
                }
            }
        }

        // Split long lines into multiple segments for better readability
        const processed = [];
        for (let i = 0; i < lyrics.length; i++) {
            const current = lyrics[i];
            const next = lyrics[i + 1];
            const words = current.text.split(' ');

            // Threshold: 7 words or 40 characters, and at least 3 seconds duration for paging
            const durationUntilNext = next ? (next.time - current.time) : 10;
            
            if ((words.length > 7 || current.text.length > 40) && durationUntilNext >= 3.0) {
                const mid = Math.ceil(words.length / 2);
                const firstPart = words.slice(0, mid).join(' ');
                const secondPart = words.slice(mid).join(' ');

                processed.push({ time: current.time, text: firstPart, duration: durationUntilNext });

                // Interpolate time: show second part at 40% of duration
                const secondTime = current.time + (durationUntilNext * 0.4);
                processed.push({ time: secondTime, text: secondPart, duration: durationUntilNext * 0.6 });
            } else {
                processed.push({ ...current, duration: durationUntilNext });
            }
        }

        return processed.sort((a, b) => a.time - b.time);
    }

    static async loadLyrics(filePath) {
        if (!window.peerifyAPI?.getLyrics) return;
        
        try {
            const content = await window.peerifyAPI.getLyrics(filePath);
            if (content) {
                const parsed = this.parseLRC(content);
                currentLyrics.set(parsed);
                console.log(`[Lyrics] Loaded ${parsed.length} lines for ${filePath}`);
            } else {
                currentLyrics.set([]);
                activeLyricLine.set('');
            }
        } catch (err) {
            console.error('[Lyrics] Failed to load:', err);
            currentLyrics.set([]);
            activeLyricLine.set('');
        }
    }

    static update(currentTime, lyricsList) {
        if (!lyricsList || lyricsList.length === 0) return;

        let activeLine = '';
        let lastRealLineIndex = -1;

        for (let i = 0; i < lyricsList.length; i++) {
            if (currentTime >= lyricsList[i].time) {
                activeLine = lyricsList[i].text;
                if (activeLine) lastRealLineIndex = i;
            } else {
                break;
            }
        }

        // STICKY LOGIC: If we hit a gap (empty line), linger the previous line
        if (!activeLine && lastRealLineIndex !== -1) {
            const lastLine = lyricsList[lastRealLineIndex];
            const timeDiff = currentTime - lastLine.time;
            
            // Linger for 2.5 seconds max or until 0.5s before the next line
            const nextLine = lyricsList[lastRealLineIndex + 1];
            const maxLinger = 2.5;
            const buffer = 0.5;
            
            let shouldLinger = timeDiff < maxLinger;
            if (nextLine && currentTime > nextLine.time - buffer) {
                shouldLinger = false;
            }

            if (shouldLinger) {
                activeLine = lastLine.text;
            }
        }

        activeLyricLine.set(activeLine);
    }
    
    static clear() {
        currentLyrics.set([]);
        activeLyricLine.set('');
    }
}
