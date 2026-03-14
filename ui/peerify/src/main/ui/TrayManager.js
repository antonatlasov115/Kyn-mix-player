import { app, Tray, Menu } from 'electron'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import fsSync from 'fs'

export class TrayManager {
    static createTray(mainWindow) {
        try {
            const iconPath = is.dev
                ? path.join(process.cwd(), 'resources', 'icon.png')
                : path.join(process.resourcesPath, 'icon.png')

            const possibleIcons = [
                iconPath,
                path.join(process.cwd(), 'build', 'icon.ico'),
                path.join(process.cwd(), 'ui/peerify/resources/icon.png')
            ]
            let finalIcon = possibleIcons.find(p => fsSync.existsSync(p))

            if (!finalIcon) return null;

            const tray = new Tray(finalIcon)
            const contextMenu = Menu.buildFromTemplate([
                { label: 'Kyn Mix', enabled: false },
                { type: 'separator' },
                { label: 'Play / Pause', click: () => mainWindow?.webContents.send('media-play-pause') },
                { label: 'Next Track', click: () => mainWindow?.webContents.send('media-next-track') },
                { label: 'Previous Track', click: () => mainWindow?.webContents.send('media-previous-track') },
                { type: 'separator' },
                {
                    label: 'Show App', click: () => {
                        if (mainWindow) {
                            mainWindow.show()
                            mainWindow.focus()
                        }
                    }
                },
                { label: 'Quit', click: () => app.quit() }
            ])

            tray.setToolTip('Kyn Mix')
            tray.setContextMenu(contextMenu)
            tray.on('double-click', () => {
                if (mainWindow) {
                    mainWindow.show()
                    mainWindow.focus()
                }
            })
            return tray;
        } catch (e) {
            console.warn('[TrayManager] Failed to initialize:', e)
            return null;
        }
    }
}
