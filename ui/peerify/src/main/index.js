import { app, dialog, ipcMain, globalShortcut, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import path, { join } from 'path'
import fsSync from 'fs'
import fs from 'fs/promises'

// Local Managers
import { nativeEngine } from './core/NativeEngine.js'
import { windowManager } from './ui/WindowManager.js'
import { TrayManager } from './ui/TrayManager.js'
import { SystemIntegration } from './system/SystemIntegration.js'

// IPC Services
import { YouTubeService } from './services/YouTubeService.js'
import { downloadManager } from './services/DownloadManager.js'
import { SearchManager } from './services/SearchManager.js'
import { MetadataService } from './services/MetadataService.js'
import { LibraryIPC } from './services/LibraryIPC.js'
import { AudioIPC } from './services/AudioIPC.js'
import { PlaylistIPC } from './services/PlaylistIPC.js'
import { YouTubeIPC } from './services/YouTubeIPC.js'
import { SettingsIPC } from './services/SettingsIPC.js'

// 1. App Configuration
app.name = 'Kyn Mix'
const appData = app.getPath('appData')
const forcedPath = path.join(appData, 'Kyn Mix')
const oldPath = path.join(appData, 'kyn-mix')

if (fsSync.existsSync(oldPath) && !fsSync.existsSync(forcedPath)) {
  try {
    fsSync.mkdirSync(forcedPath, { recursive: true })
    const filesToMigrate = ['music_library.json', 'peerify_settings.json', 'thumbnails', 'playlists', 'database']
    for (const f of filesToMigrate) {
      const src = path.join(oldPath, f)
      const dest = path.join(forcedPath, f)
      if (fsSync.existsSync(src)) {
        if (fsSync.lstatSync(src).isDirectory()) {
          fsSync.mkdirSync(dest, { recursive: true })
          const subfiles = fsSync.readdirSync(src)
          for (const sub of subfiles) fsSync.copyFileSync(path.join(src, sub), path.join(dest, sub))
        } else {
          fsSync.copyFileSync(src, dest)
        }
      }
    }
  } catch (e) { console.error('[MIGRATION] Failed:', e) }
}
app.setPath('userData', forcedPath)

// 2. Diagnostics
process.on('uncaughtException', (error) => {
  if (app.isReady()) dialog.showErrorBox('Main Process Crash (Uncaught)', `Error: ${error.message}`)
  app.quit()
})
process.on('unhandledRejection', (reason) => {
  if (app.isReady()) dialog.showErrorBox('Main Process Crash (Rejection)', `Reason: ${reason}`)
})

// 3. Prevent Multiple Instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
  process.exit(0)
} else {
  app.on('second-instance', (event, commandLine) => {
    const mainWindow = windowManager.mainWindow;
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      const files = windowManager.parseArgs(commandLine)
      if (files.length > 0) mainWindow.webContents.send('open-files', files)
    }
  })
}

// 4. Pre-app Initialization
SystemIntegration.registerProtocols()
nativeEngine.init() // Load C++ Lib synchronously

// 5. App Ready
app.whenReady().then(async () => {
  console.log('[MAIN] Electron ready, starting initialization...');

  // User Data Environment
  const USER_DATA_DIR = app.getPath('userData')
  const CPP_DB_PATH = path.join(USER_DATA_DIR, 'music_library.json')
  const EXTRA_DB_PATH = path.join(USER_DATA_DIR, 'music_library_extra.json')
  const PLAYLISTS_DIR = path.join(USER_DATA_DIR, 'playlists')
  const SETTINGS_PATH = path.join(USER_DATA_DIR, 'peerify_settings.json')

  await fs.mkdir(PLAYLISTS_DIR, { recursive: true }).catch(() => { })
  process.chdir(USER_DATA_DIR)

  // Electron Toolkit
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => { optimizer.watchWindowShortcuts(window) })

  // UI Initialization
  const mainWindow = windowManager.createWindow({
    preload: join(__dirname, '../preload/index.js'),
    htmlPath: join(__dirname, '../renderer/index.html')
  })
  windowManager.setupIpc()
  TrayManager.createTray(mainWindow)

  // System Events
  SystemIntegration.setupMediaProtocolHandler()
  SystemIntegration.registerMediaKeys(mainWindow.webContents)

  // Setup IPC Services
  const apiFns = nativeEngine.getAudioMap()

  const settingsIPC = new SettingsIPC(mainWindow, SETTINGS_PATH, downloadManager)
  settingsIPC.register()

  const libraryIPC = new LibraryIPC(mainWindow, CPP_DB_PATH, EXTRA_DB_PATH, apiFns.AI_AnalyzeLibrary, apiFns.AI_GetProgress, apiFns.AI_GetNextSimilar, settingsIPC)
  libraryIPC.register()

  const audioIPC = new AudioIPC(mainWindow, nativeEngine.lib, apiFns)
  audioIPC.register()

  const playlistIPC = new PlaylistIPC(mainWindow, PLAYLISTS_DIR, libraryIPC)
  playlistIPC.register()

  const youtubeIPC = new YouTubeIPC(mainWindow, SearchManager, downloadManager, libraryIPC, PLAYLISTS_DIR, settingsIPC)
  youtubeIPC.register()

  // Standalone IPC Handlers
  ipcMain.handle('loadVst', async (e, dllPath) => { try { return apiFns.Player_LoadVst(dllPath) } catch (err) { return false } })
  ipcMain.handle('removeVst', async () => { try { apiFns.Player_RemoveVst(); return true } catch (err) { return false } })
  ipcMain.handle('openVstEditor', async () => { try { apiFns.Player_OpenVstEditor(); return true } catch (err) { return false } })
  ipcMain.handle('getMetadata', async (e, filePath) => { try { return await MetadataService.getMetadata(filePath) } catch (err) { return null } })
  ipcMain.handle('getResourceUsage', async () => {
    try {
      const metrics = app.getAppMetrics()
      return metrics.map(m => ({
        pid: m.pid,
        type: m.type,
        cpu: m.cpu.percentCPUUsage,
        memory: m.memory.workingSetSize / 1024 // Convert to MB
      })).sort((a, b) => b.cpu - a.cpu || b.memory - a.memory)
    } catch (err) { return [] }
  })

  ipcMain.handle('saveDebugLog', async (e, data) => {
    try {
      const desktop = path.join(app.getPath('desktop'), 'peerify_debug_log.json')
      await fs.writeFile(desktop, JSON.stringify(data, null, 2))
      return desktop
    } catch (err) { return null }
  })

  // Init Config
  try {
    const settings = await settingsIPC.getSettings()
    downloadManager.setConfig({ maxConcurrent: settings.maxConcurrentDownloads, cookiesBrowser: settings.youtubeCookiesBrowser })
  } catch (e) { }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0)
      windowManager.createWindow({ preload: join(__dirname, '../preload/index.js'), htmlPath: join(__dirname, '../renderer/index.html') })
  })
})

// 6. Application Lifecycle
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') windowManager.rapidShutdown()
})

app.on('will-quit', () => {
  const forceExitTimeout = setTimeout(() => { process.exit(1) }, 1500)
  globalShortcut.unregisterAll()
  nativeEngine.shutdown()
  clearTimeout(forceExitTimeout)
})
