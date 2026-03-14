import { globalShortcut, protocol } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

export class SystemIntegration {
    static registerMediaKeys(webContents) {
        globalShortcut.unregisterAll()
        globalShortcut.register('MediaPlayPause', () => {
            if (webContents) webContents.send('media-play-pause')
        })
        globalShortcut.register('MediaNextTrack', () => {
            if (webContents) webContents.send('media-next-track')
        })
        globalShortcut.register('MediaPreviousTrack', () => {
            if (webContents) webContents.send('media-previous-track')
        })
    }

    static registerProtocols() {
        protocol.registerSchemesAsPrivileged([
            { scheme: 'media', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true, stream: true } }
        ])
    }

    static setupMediaProtocolHandler() {
        protocol.handle('media', async (request) => {
            try {
                const url = new URL(request.url)
                let filePath = decodeURIComponent(url.pathname)
                if (url.host === 'local' && filePath.startsWith('/')) filePath = filePath.substring(1)
                else if (process.platform === 'win32' && filePath.startsWith('/')) filePath = filePath.substring(1)

                filePath = path.normalize(filePath)
                const fsSync = require('fs')
                if (!fsSync.existsSync(filePath)) return new Response('File not found', { status: 404 })

                const { readFile } = require('fs/promises')
                const data = await readFile(filePath)
                const ext = path.extname(filePath).toLowerCase()
                const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.wav': 'audio/wav' }

                return new Response(data, { headers: { 'Content-Type': mime[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' } })
            } catch (e) { return new Response('Error', { status: 500 }) }
        })
    }

    static async registerContextMenu() {
        if (process.platform !== 'win32') return;
        const exePath = process.execPath
        const name = "Kyn Mix"
        const baseKey = "HKEY_CURRENT_USER\\Software\\Classes"
        const commands = [
            `reg add "${baseKey}\\*\\shell\\${name}" /ve /t REG_SZ /d "Open with ${name}" /f`,
            `reg add "${baseKey}\\*\\shell\\${name}" /v "Icon" /t REG_SZ /d "${exePath},0" /f`,
            `reg add "${baseKey}\\*\\shell\\${name}\\command" /ve /t REG_SZ /d "\\"${exePath}\\" \\"%1\\"" /f`,
            `reg add "${baseKey}\\Directory\\shell\\${name}" /ve /t REG_SZ /d "Open folder with ${name}" /f`,
            `reg add "${baseKey}\\Directory\\shell\\${name}" /v "Icon" /t REG_SZ /d "${exePath},0" /f`,
            `reg add "${baseKey}\\Directory\\shell\\${name}\\command" /ve /t REG_SZ /d "\\"${exePath}\\" \\"%1\\"" /f`,
            `reg add "${baseKey}\\Directory\\Background\\shell\\${name}" /ve /t REG_SZ /d "Open folder with ${name}" /f`,
            `reg add "${baseKey}\\Directory\\Background\\shell\\${name}" /v "Icon" /t REG_SZ /d "${exePath},0" /f`,
            `reg add "${baseKey}\\Directory\\Background\\shell\\${name}\\command" /ve /t REG_SZ /d "\\"${exePath}\\" \\"%V\\"" /f`
        ]
        for (const cmd of commands) { try { await execAsync(cmd) } catch (e) { } }
    }

    static async unregisterContextMenu() {
        if (process.platform !== 'win32') return;
        const name = "Kyn Mix"
        const baseKey = "HKEY_CURRENT_USER\\Software\\Classes"
        const keys = [
            `${baseKey}\\*\\shell\\${name}`,
            `${baseKey}\\Directory\\shell\\${name}`,
            `${baseKey}\\Directory\\Background\\shell\\${name}`
        ]
        for (const key of keys) { try { await execAsync(`reg delete "${key}" /f`) } catch (e) { } }
    }
}
