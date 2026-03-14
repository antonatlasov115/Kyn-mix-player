import { ipcMain, dialog } from 'electron'
import fs from 'fs/promises'

export class SettingsIPC {
    constructor(mainWindow, settingsPath, downloadManager) {
        this.mainWindow = mainWindow
        this.settingsPath = settingsPath
        this.downloadManager = downloadManager
    }

    async getSettings() {
        try {
            const data = await fs.readFile(this.settingsPath, 'utf-8')
            return JSON.parse(data)
        } catch (e) {
            return { libraryFolders: [] }
        }
    }

    async saveSettings(settings) {
        try {
            await fs.writeFile(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
            if (this.downloadManager) {
                this.downloadManager.setConfig({
                    maxConcurrent: settings.maxConcurrentDownloads,
                    cookiesBrowser: settings.youtubeCookiesBrowser
                })
            }
            return true
        } catch (e) {
            return false
        }
    }

    register() {
        ipcMain.handle('getSettings', async () => await this.getSettings())
        ipcMain.handle('saveSettings', async (e, settings) => await this.saveSettings(settings))

        ipcMain.handle('setZoomFactor', (e, val) => {
            if (this.mainWindow && val > 0) this.mainWindow.webContents.setZoomFactor(val)
        })

        ipcMain.handle('selectDirectory', async () => {
            try {
                const result = await dialog.showOpenDialog(this.mainWindow, { properties: ['openDirectory'] })
                if (result.canceled || result.filePaths.length === 0) return null
                return result.filePaths[0]
            } catch (err) { return null }
        })

        ipcMain.handle('selectAudioFile', async () => {
            try {
                const result = await dialog.showOpenDialog(this.mainWindow, {
                    properties: ['openFile'],
                    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'flac'] }]
                })
                if (result.canceled || result.filePaths.length === 0) return null
                return result.filePaths[0]
            } catch (err) { return null }
        })

        ipcMain.handle('selectImageFile', async () => {
            try {
                const result = await dialog.showOpenDialog(this.mainWindow, {
                    properties: ['openFile'],
                    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
                })
                if (result.canceled || result.filePaths.length === 0) return null
                return result.filePaths[0]
            } catch (err) { return null }
        })
    }
}
