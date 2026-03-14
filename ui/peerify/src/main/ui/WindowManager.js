import { BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { nativeEngine } from '../core/NativeEngine.js'

export class WindowManager {
    constructor() {
        this.mainWindow = null;
    }

    createWindow(paths) {
        this.mainWindow = new BrowserWindow({
            width: 1280,
            height: 800,
            show: false,
            title: 'Kyn Mix',
            autoHideMenuBar: true,
            titleBarStyle: 'hidden',
            webPreferences: {
                preload: paths.preload,
                sandbox: false,
                backgroundThrottling: false,
                devTools: true
            }
        });

        this.mainWindow.on('ready-to-show', () => {
            this.mainWindow.show();
        });

        // DIAGNOSTIC FALLBACK: Force show after 5s if ready-to-show never fires
        setTimeout(() => {
            if (this.mainWindow && !this.mainWindow.isVisible()) {
                console.warn('[DIAGNOSTIC] Window hidden for 5s, forcing visibility...');
                this.mainWindow.show();
                this.mainWindow.webContents.openDevTools();
            }
        }, 5000);

        this.mainWindow.webContents.on('before-input-event', (event, input) => {
            if (input.type === 'keyDown') {
                if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
                    this.mainWindow.webContents.toggleDevTools();
                    event.preventDefault();
                }
            }
        });

        this.mainWindow.webContents.setWindowOpenHandler((details) => {
            shell.openExternal(details.url);
            return { action: 'deny' };
        });

        if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
            this.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
        } else {
            this.mainWindow.loadFile(paths.htmlPath);
        }

        nativeEngine.startEventPoller(this.mainWindow.webContents);

        const files = this.parseArgs(process.argv);
        if (files.length > 0) {
            setTimeout(() => { this.mainWindow.webContents.send('open-files', files) }, 2000);
        }

        return this.mainWindow;
    }

    setupIpc() {
        ipcMain.on('window-minimize', () => this.mainWindow?.minimize());
        ipcMain.on('window-maximize', () => {
            if (this.mainWindow) {
                if (this.mainWindow.isMaximized()) this.mainWindow.unmaximize();
                else this.mainWindow.maximize();
            }
        });
        ipcMain.on('window-devtools', () => this.mainWindow?.webContents.toggleDevTools());

        ipcMain.on('window-close', () => {
            console.log('[IPC] window-close received');
            this.rapidShutdown();
        });
    }

    parseArgs(argv) {
        const files = [];
        for (const arg of argv) {
            if (!arg.startsWith('--') && !arg.startsWith('-')) {
                if (['.', 'development', 'production', 'test'].includes(arg)) continue;
                if (arg.match(/\.(mp3|wav|flac)$/i)) {
                    files.push(arg);
                } else if (!arg.match(/\.(exe|dll|js|json|html|css|md|txt)$/i)) {
                    // Only add if it's potentially a directory or non-binary file
                    if (arg !== process.cwd() && arg !== join(process.cwd(), '.')) {
                        files.push(arg);
                    }
                }
            }
        }
        return files;
    }

    rapidShutdown() {
        console.log('[WindowManager] Rapid Shutdown triggered');
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.hide();
        }
        const killer = setTimeout(() => {
            console.log('[WindowManager] Shutdown timeout reached, force exiting');
            process.exit(0);
        }, 800);

        nativeEngine.shutdown();

        clearTimeout(killer);
        process.exit(0);
    }
}

export const windowManager = new WindowManager();
