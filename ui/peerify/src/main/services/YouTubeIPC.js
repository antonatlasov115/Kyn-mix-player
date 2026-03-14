import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs/promises'

export class YouTubeIPC {
    constructor(mainWindow, searchManager, downloadManager, libraryIPC, playlistsDir, settingsIPC) {
        this.mainWindow = mainWindow
        this.searchManager = searchManager
        this.downloadManager = downloadManager
        this.libraryIPC = libraryIPC
        this.playlistsDir = playlistsDir
        this.settingsIPC = settingsIPC
    }

    register() {
        ipcMain.handle('yt:search', async (e, query, platform = 'youtube') => {
            return await this.searchManager.search(query, platform)
        })

        ipcMain.handle('yt:download', async (e, query) => {
            try {
                const settings = await this.settingsIPC.getSettings()
                const downloadDir = settings?.libraryFolders?.[0] || 'Kyn Mix Downloads'
                return await this.downloadManager.addTask(query, null, downloadDir)
            } catch (err) { return null }
        })

        ipcMain.handle('dl:get-tasks', () => this.downloadManager.getTasks())
        ipcMain.on('dl:cancel', (e, taskId) => this.downloadManager.cancelTask(taskId))
        ipcMain.on('dl:clear-finished', () => this.downloadManager.clearFinished())

        // Sync with download manager events
        this.downloadManager.on('queue-updated', (q) => this.mainWindow?.webContents.send('dl:queue-updated', q))
        this.downloadManager.on('progress', (d) => this.mainWindow?.webContents.send('dl:progress', d))
        this.downloadManager.on('download-finished', async (t) => {
            if (t.downloadDir) await this.libraryIPC.runLibraryBuild(t.downloadDir)
        })

        this.downloadManager.on('create-playlist', async ({ name, tracks }) => {
            if (!this.playlistsDir) return
            const safeName = name.replace(/[<>:"/\\|?*➜]/g, '_').trim()
            const fPath = path.join(this.playlistsDir, `${safeName}.json`)
            await fs.writeFile(fPath, JSON.stringify({ name: safeName, tracks }, null, 2), 'utf-8')
            this.mainWindow?.webContents.send('library:updated')
        })
    }
}
