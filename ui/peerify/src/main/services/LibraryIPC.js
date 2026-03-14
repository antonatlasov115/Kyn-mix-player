import { ipcMain } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { MetadataService } from './MetadataService.js'
import { HybridAutoDJ } from './HybridAutoDJ.js'
import { LyricsService } from './LyricsService.js'

let cachedDb = null

export class LibraryIPC {
    constructor(mainWindow, cppDbPath, extraDbPath, aiAnalyzeLibrary, aiGetProgress, aiGetNextSimilar, settingsIPC) {
        this.mainWindow = mainWindow
        this.cppDbPath = cppDbPath
        this.extraDbPath = extraDbPath
        this.aiAnalyzeLibrary = aiAnalyzeLibrary
        this.aiGetProgress = aiGetProgress
        this.aiGetNextSimilar = aiGetNextSimilar
        this.settingsIPC = settingsIPC
        this.hybridDJ = new HybridAutoDJ()
    }

    extractKey(filename) {
        if (!filename) return null;
        // Camelot notation (e.g., 4A, 11B)
        const camelotMatch = filename.match(/\b(1?[0-9][AB])\b/i);
        if (camelotMatch) return camelotMatch[1].toUpperCase();

        // Musical notation (e.g., C# Maj, Bb Min, Am)
        const musicalMatch = filename.match(/\(([A-G][b#]?\s*(Maj|Min|m|maj|min)?)\)/i) ||
            filename.match(/\b([A-G][b#]?(Maj|Min|m|maj|min))\b/i);
        if (musicalMatch) return musicalMatch[1];

        return null;
    }

    async getDb() {
        if (cachedDb) return cachedDb
        try {
            const data = await fs.readFile(this.cppDbPath, 'utf-8')
            const rawDb = JSON.parse(data)
            const db = {}
            for (const key in rawDb) {
                const normalizedKey = key.replace(/\\/g, '/').toLowerCase()
                db[normalizedKey] = { ...rawDb[key], filepath: key.replace(/\\/g, '/') }
            }

            try {
                const extraData = await fs.readFile(this.extraDbPath, 'utf-8')
                const extra = JSON.parse(extraData)
                for (const rawKey in extra) {
                    const normalizedKey = rawKey.replace(/\\/g, '/').toLowerCase()
                    if (db[normalizedKey]) {
                        db[normalizedKey] = { ...db[normalizedKey], ...extra[rawKey] }
                    } else {
                        // Insert manually tracked items
                        db[normalizedKey] = { ...extra[rawKey], filepath: rawKey.replace(/\\/g, '/') }
                    }
                }
            } catch (err) {
                if (err.code !== 'ENOENT') {
                    console.error('[LibraryIPC] getDb() extra mapping error:', err)
                }
            }

            cachedDb = db
            return cachedDb
        } catch (e) {
            console.error('[LibraryIPC] Failed to read DB:', e.message)
            cachedDb = {}
            return cachedDb
        }
    }

    async saveDb(db) {
        try {
            const normalizedDb = {}
            for (const key in db) {
                const normalizedKey = key.replace(/\\/g, '/').toLowerCase()
                normalizedDb[normalizedKey] = db[key]
            }
            await fs.writeFile(this.cppDbPath, JSON.stringify(normalizedDb, null, 2), 'utf-8')
            await fs.writeFile(this.extraDbPath, JSON.stringify(normalizedDb, null, 2), 'utf-8')
            cachedDb = normalizedDb
            return true
        } catch (e) {
            console.error('[LibraryIPC] Failed to save DB:', e)
            return false
        }
    }

    invalidateCache() {
        cachedDb = null
    }

    register() {
        ipcMain.handle('getLocalLibrary', async () => {
            try {
                const db = await this.getDb()
                return Object.values(db).filter((t) => t && (t.filepath || t.filePath) && !t.isDeleted).map((t) => {
                    const p = t.filepath || t.filePath
                    const filename = t.filename || (p ? path.basename(p) : 'Unknown')
                    const query = t.title || filename.replace(/\.(mp3|wav|flac)$/i, '')
                    return {
                        query,
                        artist: (!MetadataService.isTechnicalString(t.artist) && t.artist) || 'Unknown Artist',
                        album: (!MetadataService.isTechnicalString(t.album) && t.album) || '',
                        title: (!MetadataService.isTechnicalString(t.title) && t.title) || query,
                        bpm_display: `BPM: ${t.bpm ? t.bpm.toFixed(1) : 120.0}`,
                        thumbnail: t.thumbnail,
                        originalCover: t.originalCover || t.thumbnail,
                        metadataRefined: t.metadataRefined,
                        filePath: p,
                        genre: t.genre || 'DSP-READY',
                        fingerprint: t.fingerprint || new Array(25).fill(0),
                        intro_end: t.intro_end || 0,
                        outro_start: t.outro_start || 0,
                        drop_pos: t.drop_pos || 0,
                        duration_seconds: t.duration_seconds || 0,
                        bpm: t.bpm || 120.0,
                        staticWaveform: t.static_waveform || t.staticWaveform || [],
                        key: t.key || this.extractKey(filename)
                    }
                }).reverse()
            } catch (err) {
                console.error('[LibraryIPC] getLocalLibrary error:', err)
                return []
            }
        })

        ipcMain.handle('deleteTrackFromDisk', async (e, filepath) => {
            try {
                const db = await this.getDb()
                const cleanPath = filepath.replace(/\\/g, '/')
                let deleted = false
                for (const key in db) {
                    const p = (db[key].filepath || db[key].filePath || '').replace(/\\/g, '/')
                    if (p === cleanPath || p.toLowerCase() === cleanPath.toLowerCase()) {
                        // 1. Physically remove file
                        try {
                            await fs.unlink(filepath)
                        } catch (err) {
                            console.warn(`[LibraryIPC] Could not physically delete file (might be in use or already gone): ${filepath}`)
                        }

                        // 2. Mark as deleted (Tombstone)
                        db[key].isDeleted = true
                        deleted = true
                        break
                    }
                }
                if (deleted) {
                    await this.saveDb(db)
                    if (this.aiAnalyzeLibrary) await new Promise((res) => this.aiAnalyzeLibrary.async("SYNC_DB_CMD", (err, r) => res(r)))
                    if (this.mainWindow) this.mainWindow.webContents.send('library:updated')
                }
                return deleted
            } catch (err) {
                console.error(`[LibraryIPC] deleteTrackFromDisk('${filepath}') error:`, err)
                return false
            }
        })

        ipcMain.handle('removeTrackFromLibrary', async (e, filepath) => {
            try {
                const db = await this.getDb()
                const cleanPath = filepath.replace(/\\/g, '/')
                let changed = false
                for (const key in db) {
                    const p = (db[key].filepath || db[key].filePath || '').replace(/\\/g, '/')
                    if (p === cleanPath || p.toLowerCase() === cleanPath.toLowerCase()) {
                        db[key].isDeleted = true
                        changed = true
                        break
                    }
                }
                if (changed) {
                    await this.saveDb(db)
                    if (this.aiAnalyzeLibrary) await new Promise((res) => this.aiAnalyzeLibrary.async("SYNC_DB_CMD", (err, r) => res(r)))
                    if (this.mainWindow) this.mainWindow.webContents.send('library:updated')
                }
                return changed
            } catch (err) {
                console.error(`[LibraryIPC] removeTrackFromLibrary('${filepath}') error:`, err)
                return false
            }
        })

        ipcMain.handle('removeFolderTracks', async (e, folderPath) => {
            try {
                const db = await this.getDb()
                const cleanFolder = folderPath.replace(/\\/g, '/').toLowerCase()
                const prefix = cleanFolder.endsWith('/') ? cleanFolder : cleanFolder + '/'
                let changed = false
                for (const key in db) {
                    const p = (db[key].filepath || db[key].filePath || '').replace(/\\/g, '/').toLowerCase()
                    if (p === cleanFolder || p.startsWith(prefix)) {
                        delete db[key]; changed = true;
                    }
                }
                if (changed) {
                    await this.saveDb(db)
                    if (this.aiAnalyzeLibrary) await new Promise((res) => this.aiAnalyzeLibrary.async("SYNC_DB_CMD", (err, r) => res(r)))
                    if (this.mainWindow) this.mainWindow.webContents.send('library:updated')
                }
                return true
            } catch (err) {
                console.error(`[LibraryIPC] removeFolderTracks('${folderPath}') error:`, err)
                return false
            }
        })
        ipcMain.handle('buildLibrary', async (e, folderPaths) => {
            return await this.runLibraryBuild(folderPaths)
        })

        ipcMain.handle('library:refine-online', async (e, forceCovers = false) => {
            try {
                this.invalidateCache()
                const db = await this.getDb()
                const entries = Object.entries(db)
                let count = 0
                console.log(`[LibraryIPC] Starting manual online enrichment (forceCovers: ${forceCovers}) for ${entries.length} tracks...`)
                for (const [key, track] of entries) {
                    const oldG = track.genre
                    const oldT = track.thumbnail
                    const needsGenre = !oldG || ['unknown', 'other', 'dsp-ready', 'unknown artist', 'unknown genre', '', 'unknown_genre'].includes((oldG || '').toLowerCase().trim());
                    const needsCover = forceCovers && !track.thumbnail;
                    
                    if (needsGenre || needsCover) {
                        await this.refineTrackMetadata(track, true)
                        if (track.genre !== oldG || track.thumbnail !== oldT) count++
                        await new Promise(r => setTimeout(r, 850))
                    }
                }
                if (count > 0) {
                    await this.saveDb(db)
                    if (this.mainWindow) this.mainWindow.webContents.send('library:updated')
                }
                return count
            } catch (err) {
                console.error('[LibraryIPC] Refine error:', err)
                return 0
            }
        })

        ipcMain.handle('getHybridNextTrack', async (e, currentPath) => {
            try {
                const cleanPath = currentPath.replace(/(^"|"$)/g, '').replace(/\\/g, '/')
                const bufferSize = 1024
                const outBuffer = Buffer.alloc(bufferSize)
                const bytesWritten = await new Promise((resolve) => {
                    if (this.aiGetNextSimilar) {
                        this.aiGetNextSimilar.async(cleanPath, outBuffer, bufferSize, (err, res) => resolve(res || 0))
                    } else resolve(0)
                })
                let nextPath = null
                if (bytesWritten > 0) nextPath = outBuffer.toString('utf8', 0, bytesWritten).replace(/\0/g, '')
                if (!nextPath || nextPath.trim() === '') {
                    const db = await this.getDb()
                    const allTracks = Object.values(db).filter((t) => t && (t.filepath || t.filePath) && !t.isDeleted)

                    // Filter out current track
                    const candidates = allTracks.filter((t) => (t.filepath || t.filePath).replace(/\\/g, '/') !== cleanPath)

                    if (candidates.length > 0) {
                        const currentTrack = allTracks.find(t => (t.filepath || t.filePath).replace(/\\/g, '/') === cleanPath)

                        // Smart selection using HybridAutoDJ
                        const context = {
                            userId: 'default_user', // Placeholder, could be dynamic
                            prevGenre: currentTrack?.genre || 'Unknown',
                            genre: currentTrack?.genre || 'Unknown',
                            artist: currentTrack?.artist || 'Unknown Artist',
                            key: currentTrack?.key || (currentTrack ? this.extractKey(path.basename(currentTrack.filepath || currentTrack.filePath)) : null),
                            biorhythmPool: [currentTrack?.genre || 'Unknown'] // Simplified biorhythm
                        }

                        const candidateData = candidates.map(t => ({
                            ...t,
                            filePath: t.filepath || t.filePath,
                            key: t.key || this.extractKey(path.basename(t.filepath || t.filePath))
                        }))

                        const bestTrack = await this.hybridDJ.getNextBestTrack(context, candidateData)
                        if (bestTrack) {
                            nextPath = bestTrack.filePath
                        } else {
                            // Absolute fallback
                            const randomIndex = Math.floor(Math.random() * candidates.length)
                            nextPath = candidates[randomIndex].filepath || candidates[randomIndex].filePath
                        }
                    }
                }
                return nextPath
            } catch (err) {
                console.error(`[LibraryIPC] getHybridNextTrack('${currentPath}') error:`, err)
                return null
            }
        })

        ipcMain.handle('getTrackMetadata', async (e, filepath) => {
            try {
                const cleanPath = filepath.replace(/(^"|"$)/g, '').replace(/\\/g, '/')
                const db = await this.getDb()
                // Search in normalized DB keys first
                const normKey = cleanPath.toLowerCase()
                let track = db[normKey]
                if (!track) {
                    track = Object.values(db).find((t) => {
                        const p = (t.filepath || t.filePath || '').replace(/\\/g, '/')
                        return p === cleanPath || p.toLowerCase() === cleanPath.toLowerCase()
                    })
                }
                if (track) return { bpm: track.bpm || 120.0, genre: track.genre || 'Unknown', intro_end: track.intro_end, outro_start: track.outro_start, drop_pos: track.drop_pos, duration_seconds: track.duration_seconds, key: track.key || this.extractKey(path.basename(cleanPath)) }
                return null
            } catch (err) {
                console.error(`[LibraryIPC] getTrackMetadata('${filepath}') error:`, err)
                return null
            }
        })

        ipcMain.handle('getLyrics', async (e, filepath) => {
            try {
                const cleanPath = filepath.replace(/(^"|"$)/g, '').replace(/\\/g, '/')
                const ext = path.extname(cleanPath)
                const lrcPath = cleanPath.substring(0, cleanPath.length - ext.length) + '.lrc'

                try {
                    const content = await fs.readFile(lrcPath, 'utf8')
                    return content
                } catch (err) {
                    if (err.code !== 'ENOENT') {
                        console.warn(`[LibraryIPC] Error reading lyrics at ${lrcPath}:`, err)
                    } else {
                        // FALLBACK: Online Search
                        const settings = this.settingsIPC ? await this.settingsIPC.getSettings() : {}
                        if (settings.autoDownloadLyrics) {
                            console.log(`[LibraryIPC] Local lyrics missing, fetching online for ${filepath}...`)
                            const meta = await MetadataService.getMetadata(filepath)
                            if (meta) {
                                const onlineContent = await LyricsService.fetchLyrics(
                                    meta.artist,
                                    meta.title,
                                    meta.album,
                                    meta.duration
                                )
                                if (onlineContent) {
                                    await LyricsService.saveLyricsLocally(cleanPath, onlineContent)
                                    return onlineContent
                                }
                            }
                        }
                    }
                    return null
                }
            } catch (err) {
                console.error(`[LibraryIPC] getLyrics('${filepath}') error:`, err)
                return null
            }
        })
    }

    async runLibraryBuild(folderPaths) {
        try {
            const paths = Array.isArray(folderPaths) ? folderPaths : [folderPaths]
            console.log(`[LibraryIPC] Starting analysis for: ${paths.join(', ')}`)
            for (const pathStr of paths) {
                if (!pathStr) continue
                let progressInterval = setInterval(() => {
                    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
                    let current = [0], total = [0]
                    this.aiGetProgress(current, total)
                    if (total[0] > 0) {
                        this.mainWindow.webContents.send('library:progress', {
                            current: current[0], total: total[0], path: pathStr, status: 'analyzing'
                        })
                    }
                }, 200)

                try {
                    await new Promise((resolve) => {
                        const timeout = setTimeout(() => resolve(0), 5 * 60 * 1000)
                        if (this.aiAnalyzeLibrary) {
                            this.aiAnalyzeLibrary.async(pathStr, (err, res) => {
                                clearTimeout(timeout)
                                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                                    this.mainWindow.webContents.send('library:progress', { current: 1, total: 1, path: pathStr, status: 'done' })
                                }
                                resolve(res || 0)
                            })
                        } else { clearTimeout(timeout); resolve(0) }
                    })

                    this.invalidateCache()
                    const db = await this.getDb()
                    const settings = this.settingsIPC ? await this.settingsIPC.getSettings() : {}
                    const autoDownload = settings.autoDownloadCovers === true

                    const refineQueue = []
                    for (const [key, track] of Object.entries(db)) {
                        const lowG = (track.genre || '').toLowerCase().trim()
                        const isGeneric = ['unknown', 'other', 'dsp-ready', 'unknown artist', 'unknown genre', '', 'unknown_genre', 'unknown_artist'].includes(lowG)
                        if (!track.thumbnail || (isGeneric && !track.metadataRefined)) refineQueue.push({ key, track })
                    }

                    // Fallback: Scan directory directly to pick up files C++ missed
                    try {
                        const files = await fs.readdir(pathStr)
                        let newFilesAdded = false
                        for (const file of files) {
                            if (file.match(/\.(mp3|wav|flac)$/i)) {
                                const fullPath = path.join(pathStr, file).replace(/\\/g, '/')
                                const normKey = fullPath.toLowerCase()
                                // Skip if already in DB (even if marked deleted)
                                if (!db[normKey]) {
                                    db[normKey] = {
                                        filepath: fullPath,
                                        filename: file,
                                        title: file.replace(/\.(mp3|wav|flac)$/i, ''),
                                        genre: 'Unknown',
                                        bpm: 120.0
                                    }
                                    refineQueue.push({ key: normKey, track: db[normKey] })
                                    newFilesAdded = true
                                }
                            }
                        }
                    } catch (err) {
                        console.error('[LibraryIPC] Directory fallback scan error:', err)
                    }

                    // SEND EARLY UPDATE SO UI SHOWS NEW TRACKS IMMEDIATELY
                    await this.saveDb(db)
                    if (this.mainWindow) this.mainWindow.webContents.send('library:updated')

                    if (refineQueue.length > 0) {
                        const CHUNK_SIZE = 5
                        for (let i = 0; i < refineQueue.length; i += CHUNK_SIZE) {
                            const chunk = refineQueue.slice(i, i + CHUNK_SIZE)
                            await Promise.all(chunk.map(async (item) => {
                                await this.refineTrackMetadata(item.track, autoDownload)
                                item.track.metadataRefined = true
                            }))
                            if (i > 0 && i % 100 === 0) {
                                await this.saveDb(db)
                                if (this.mainWindow) this.mainWindow.webContents.send('library:updated')
                            }
                        }
                    }
                    await this.saveDb(db)
                    // Firing update one last time if covers changed
                    if (this.mainWindow) this.mainWindow.webContents.send('library:updated')
                    if (this.aiAnalyzeLibrary) await new Promise((res) => this.aiAnalyzeLibrary.async("SYNC_DB_CMD", (err, r) => res(r)))
                } finally {
                    clearInterval(progressInterval)
                }
            }
            const total = Object.keys(await this.getDb()).length
            if (this.mainWindow) this.mainWindow.webContents.send('library:updated')
            return total
        } catch (err) {
            console.error('[LibraryIPC] Analysis error:', err)
            return 0
        }
    }

    async refineTrackMetadata(track, allowOnline = false) {
        const p = track.filepath || track.filePath || ''
        const isUnknown = !track.genre || MetadataService.isTechnicalString(track.genre)
        const needsLocal = !track.thumbnail || MetadataService.isTechnicalString(track.artist) || MetadataService.isTechnicalString(track.title) || isUnknown

        if (needsLocal) {
            try {
                const fullMeta = await MetadataService.getMetadata(p)
                if (fullMeta) {
                    if (fullMeta.thumbnail) track.thumbnail = fullMeta.thumbnail
                    if (fullMeta.originalCover) track.originalCover = fullMeta.originalCover
                    if (!MetadataService.isTechnicalString(fullMeta.artist)) track.artist = fullMeta.artist
                    if (!MetadataService.isTechnicalString(fullMeta.title)) track.title = fullMeta.title
                    if (!MetadataService.isTechnicalString(fullMeta.album)) track.album = fullMeta.album
                    if (!MetadataService.isTechnicalString(fullMeta.genre)) track.genre = fullMeta.genre
                }
            } catch (err) {
                console.error(`[LibraryIPC] Local metadata parse error for '${p}':`, err)
            }
        }

        if (!track.thumbnail && allowOnline) {
            try {
                const art = track.artist || 'Unknown Artist'
                const tit = track.title || path.basename(p, path.extname(p))
                if (art !== 'Unknown Artist' && tit) {
                    const online = await MetadataService.getOnlineMetadata(art, tit)
                    if (online?.thumbnailUrl) {
                        const res = await MetadataService.downloadThumbnail(online.thumbnailUrl, p)
                        if (res) {
                            track.thumbnail = res.thumbnail
                            track.originalCover = res.originalCover
                        }
                    }
                }
            } catch (err) {
                console.error(`[LibraryIPC] Online metadata fetch error for '${track.artist} - ${track.title}':`, err)
            }
        }

        if (!track.genre || ['unknown', 'other', 'dsp-ready', 'unknown artist', 'unknown genre', '', 'unknown_genre'].includes(track.genre.toLowerCase().trim())) {
            if (allowOnline) {
                try {
                    const onlineGenre = await MetadataService.getTrackGenre(path.basename(p))
                    if (onlineGenre && onlineGenre !== 'Unknown') track.genre = onlineGenre
                } catch (err) {
                    console.error(`[LibraryIPC] Online genre fetch error for '${path.basename(p)}':`, err)
                }
            }
        }
        return track
    }
}
