import path from 'path'
import { promises as fs } from 'fs'

export class LyricsService {
    static async fetchLyrics(artist, title, album, duration) {
        try {
            const { net } = await import('electron')

            let cleanArtist = artist || 'Unknown Artist'
            let cleanTitle = title || ''

            const junkRegex = /\[.*?\]|\(.*?\)|\b(official|video|visualizer|audio|lyric|lyrics|hq|hd|4k)\b|\.(mp3|wav|flac|m4a|ogg|aac)$/gi;
            
            // 1. Handle "Artist - Title" in the title field if artist is unknown
            if ((!cleanArtist || cleanArtist === 'Unknown Artist') && cleanTitle.includes(' - ')) {
                const parts = cleanTitle.split(' - ')
                cleanArtist = parts[0].trim()
                cleanTitle = parts.slice(1).join(' - ').trim()
            }

            // 2. Remove Junk
            cleanArtist = cleanArtist.replace(junkRegex, '').replace(/\s+/g, ' ').trim()
            cleanTitle = cleanTitle.replace(junkRegex, '').replace(/\s+/g, ' ').trim()

            const queryParams = new URLSearchParams({
                artist_name: cleanArtist,
                track_name: cleanTitle,
                album_name: album || '',
                duration: Math.round(duration) || 0
            })
            
            const url = `https://lrclib.net/api/get?${queryParams.toString()}`
            console.log(`[LyricsService] Fetching from: ${url}`)
            
            const resp = await net.fetch(url, {
                headers: { 'User-Agent': 'Peerify (https://github.com/your-repo)' }
            })
            
            if (resp.status === 404) {
                console.log('[LyricsService] Lyrics not found (404)')
                return null
            }
            
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`)
            }
            
            const data = await resp.json()
            return data.syncedLyrics || data.plainLyrics || null
        } catch (err) {
            console.error('[LyricsService] Fetch failed:', err.message)
            return null
        }
    }

    static async saveLyricsLocally(audioPath, lyricsContent) {
        try {
            const ext = path.extname(audioPath)
            const lrcPath = audioPath.substring(0, audioPath.length - ext.length) + '.lrc'
            await fs.writeFile(lrcPath, lyricsContent, 'utf8')
            console.log(`[LyricsService] Saved lyrics to: ${lrcPath}`)
            return true
        } catch (err) {
            console.error('[LyricsService] Save failed:', err)
            return false
        }
    }
}
