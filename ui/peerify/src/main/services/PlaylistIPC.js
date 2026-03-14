import { ipcMain } from 'electron'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'

export class PlaylistIPC {
    constructor(mainWindow, playlistsDir, libraryIPC) {
        this.mainWindow = mainWindow
        this.playlistsDir = playlistsDir
        this.libraryIPC = libraryIPC
    }

    register() {
        ipcMain.handle('savePlaylist', async (e, name, tracks) => {
            try {
                const safeName = name.replace(/[<>:"/\\|?*➜]/g, '_').trim()
                const filePath = path.join(this.playlistsDir, `${safeName}.json`)
                await fs.writeFile(filePath, JSON.stringify({ name: safeName, tracks }, null, 2), 'utf-8')
                return safeName
            } catch (err) {
                console.error('[PlaylistIPC] Save error:', err)
                return null
            }
        })

        ipcMain.handle('deletePlaylist', async (e, name) => {
            try {
                const safeName = name.replace(/[<>:"/\\|?*➜]/g, '_').trim()
                const filePath = path.join(this.playlistsDir, `${safeName}.json`)
                if (fsSync.existsSync(filePath)) {
                    await fs.unlink(filePath)
                } else {
                    // Search recursively
                    const files = await this._getRecursiveFiles(this.playlistsDir)
                    const targetFile = files.find(f => path.basename(f) === `${safeName}.json`)
                    if (targetFile) await fs.unlink(targetFile)
                }
                return true
            } catch (err) {
                console.error('[PlaylistIPC] Delete error:', err)
                return false
            }
        })

        ipcMain.handle('getPlaylists', async () => {
            try {
                if (!fsSync.existsSync(this.playlistsDir)) {
                    await fs.mkdir(this.playlistsDir, { recursive: true })
                }
                const files = await this._getRecursiveFiles(this.playlistsDir)
                const playlists = []
                const db = await this.libraryIPC.getDb()

                for (const filePath of files) {
                    if (filePath.endsWith('.json')) {
                        try {
                            const content = await fs.readFile(filePath, 'utf-8')
                            const playlist = JSON.parse(content)
                            playlist.folder = path.relative(this.playlistsDir, path.dirname(filePath))
                            if (playlist.folder === '.') playlist.folder = ''

                            if (playlist.tracks) {
                                playlist.tracks = playlist.tracks.map(item => {
                                    const p = (item.track?.filePath || item.track?.filepath || '').replace(/\\/g, '/').toLowerCase()
                                    if (db[p]) {
                                        item.track = { ...item.track, ...db[p] }
                                    }
                                    return item
                                })
                            }
                            playlists.push(playlist)
                        } catch (e) { }
                    }
                }
                return playlists
            } catch (err) { return [] }
        })

        ipcMain.handle('importM3U', async (e, filePath) => {
            try {
                const content = await fs.readFile(filePath, 'utf-8')
                const lines = content.split('\n')
                const tracks = []
                const db = await this.libraryIPC.getDb()

                for (let line of lines) {
                    line = line.trim()
                    if (line && !line.startsWith('#')) {
                        // It's a path
                        const normalizedPath = line.replace(/\\/g, '/').toLowerCase()
                        const trackData = db[normalizedPath]
                        if (trackData) {
                            tracks.push({
                                id: Date.now() + Math.random(),
                                track: trackData,
                                crossfade: 4,
                                curve: 'equal',
                                offset: 0
                            })
                        }
                    }
                }

                if (tracks.length > 0) {
                    const name = path.basename(filePath, path.extname(filePath))
                    return { name, tracks }
                }
                return null
            } catch (err) {
                console.error('[PlaylistIPC] Import M3U Error:', err)
                return null
            }
        })

        ipcMain.handle('exportM3U', async (e, name, tracks, targetPath) => {
            try {
                let m3u = '#EXTM3U\n'
                for (const item of tracks) {
                    const t = item.track
                    if (t?.filePath) {
                        m3u += `#EXTINF:${Math.floor(t.duration || 0)},${t.artist || 'Unknown'} - ${t.title || 'Unknown'}\n`
                        m3u += `${t.filePath}\n`
                    }
                }
                await fs.writeFile(targetPath, m3u, 'utf-8')
                return true
            } catch (err) {
                console.error('[PlaylistIPC] Export M3U Error:', err)
                return false
            }
        })
    }

    async _getRecursiveFiles(dir) {
        const dirents = await fs.readdir(dir, { withFileTypes: true })
        const files = await Promise.all(dirents.map((dirent) => {
            const res = path.resolve(dir, dirent.name)
            return dirent.isDirectory() ? this._getRecursiveFiles(res) : res
        }))
        return Array.prototype.concat(...files)
    }
}
