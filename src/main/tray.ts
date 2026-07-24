import { Tray, Menu, app, type BrowserWindow } from 'electron'
import { join } from 'path'

let tray: Tray | null = null
let micActive = false

function buildMenu(win: BrowserWindow): Menu {
  return Menu.buildFromTemplate([
    {
      label: win.isVisible() ? 'Hide' : 'Show',
      click: () => (win.isVisible() ? win.hide() : win.show())
    },
    {
      label: micActive ? 'Mic Off' : 'Mic On',
      click: () => win.webContents.send('tray-mic-toggle')
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
}

export function createTray(win: BrowserWindow): Tray {
  tray = new Tray(join(__dirname, '../../resources/icon.png'))
  tray.setToolTip('Campfire')
  tray.setContextMenu(buildMenu(win))
  tray.on('click', () => (win.isVisible() ? win.hide() : win.show()))
  win.on('show', () => tray?.setContextMenu(buildMenu(win)))
  win.on('hide', () => tray?.setContextMenu(buildMenu(win)))
  return tray
}

export function setTrayMicActive(win: BrowserWindow, active: boolean): void {
  micActive = active
  tray?.setContextMenu(buildMenu(win))
}
