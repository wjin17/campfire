import { app, BrowserWindow, screen, session, shell, ipcMain } from 'electron'
import { join } from 'path'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { loadSettings, saveSettings } from './settings'
import { startNowPlayingServer, parseNowPlaying } from './nowplaying-server'
import { createTray, setTrayMicActive } from './tray'
import { resolveActivePayload, checkForPayloadUpdate } from './payload'

const SMALL_SIZE = { width: 320, height: 96 }
const EXPANDED_SIZE = { width: 400, height: 560 }
const WS_PORT_PRIMARY = 17640
const WS_PORT_FALLBACK = 17641
const SMTC_MAX_RESPAWNS = 3

let mainWindow: BrowserWindow | null = null
let smtcProcess: ChildProcessWithoutNullStreams | null = null
let smtcRespawnCount = 0
let activePayloadVersion = app.getVersion()

function isDevRenderer(): boolean {
  return Boolean(is.dev && process.env['ELECTRON_RENDERER_URL'])
}

function createWindow(): BrowserWindow {
  const settings = loadSettings()
  const size = settings.expanded ? EXPANDED_SIZE : SMALL_SIZE

  const bundledDir = join(__dirname, '../renderer')
  if (!isDevRenderer()) {
    const active = resolveActivePayload(app.getPath('userData'), bundledDir, app.getVersion())
    process.env['CAMPFIRE_PAYLOAD_DIR'] = active.dir
    activePayloadVersion = active.version
  }

  const win = new BrowserWindow({
    ...size,
    x: settings.x,
    y: settings.y,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media'
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const persistPosition = (): void => {
    const [x, y] = win.getPosition()
    saveSettings({ x, y })
  }
  win.on('moved', persistPosition)
  win.on('close', persistPosition)
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  if (isDevRenderer()) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    win.loadFile(join(process.env['CAMPFIRE_PAYLOAD_DIR']!, 'index.html'))
  }

  return win
}

function setExpanded(win: BrowserWindow, expanded: boolean): void {
  const bounds = win.getBounds()
  const size = expanded ? EXPANDED_SIZE : SMALL_SIZE
  const workArea = screen.getDisplayMatching(bounds).workArea
  const deltaHeight = size.height - bounds.height
  const y = Math.max(bounds.y - deltaHeight, workArea.y)
  win.setBounds({ x: bounds.x, y, width: size.width, height: size.height })
  saveSettings({ x: bounds.x, y, expanded })
}

function spawnSmtcHelper(win: BrowserWindow): void {
  if (process.platform !== 'win32') return

  const spawnedAt = Date.now()
  const scriptPath = join(__dirname, '../../resources/smtc-poll.ps1')
  const child = spawn('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath
  ])
  smtcProcess = child

  let buffer = ''
  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const msg = parseNowPlaying(trimmed)
      if (msg) win.webContents.send('now-playing', msg)
    }
  })

  child.on('exit', () => {
    smtcProcess = null
    if (Date.now() - spawnedAt > 60_000) smtcRespawnCount = 0
    if (smtcRespawnCount < SMTC_MAX_RESPAWNS) {
      smtcRespawnCount++
      setTimeout(() => spawnSmtcHelper(win), 1000 * smtcRespawnCount)
    }
  })
}

app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.wjin17.campfire')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  mainWindow = createWindow()
  createTray(mainWindow)
  spawnSmtcHelper(mainWindow)
  if (!isDevRenderer()) void checkForPayloadUpdate(app.getPath('userData'))

  const { port } = await startNowPlayingServer(mainWindow, WS_PORT_PRIMARY, WS_PORT_FALLBACK)
  saveSettings({ wsPort: port })

  ipcMain.handle('get-settings', () => loadSettings())
  ipcMain.handle('save-settings', (_e, partial) => saveSettings(partial))
  ipcMain.handle('set-expanded', (_e, expanded: boolean) => {
    if (mainWindow) setExpanded(mainWindow, expanded)
  })
  ipcMain.handle('payload-version', () => activePayloadVersion)
  ipcMain.on('minimize-to-tray', () => {
    mainWindow?.hide()
  })
  ipcMain.on('window-minimize', () => {
    mainWindow?.minimize()
  })
  ipcMain.on('window-close', () => {
    mainWindow?.close()
  })
  ipcMain.on('set-mic-active', (_e, active: boolean) => {
    if (mainWindow) setTrayMicActive(mainWindow, active)
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  smtcProcess?.kill()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
