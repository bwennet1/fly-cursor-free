import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
} from 'electron';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runRelayStartup,
  onRelayBeforeQuit,
  runRelayQuitRelease,
  getRelaySwitchInFlight,
  setRelayMainWindow,
  setRelayIsQuitting,
  getRelayIsQuitting,
} from '@relay/core';
import { setPackagedApp } from '../shared/build-flags.js';
import { setPackagedHubUrlMode } from '../shared/hub-url.js';
import { PRODUCT_DISPLAY_NAME } from '../shared/build-config.js';

import '@relay/core';

setPackagedApp(app.isPackaged);
setPackagedHubUrlMode(app.isPackaged);

if (process.platform === 'win32') {
  app.setAppUserModelId('com.relay.desktop');
}

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function resolveWindowIcon(): string | undefined {
  const candidates = [
    join(process.resourcesPath, 'icon.png'),
    join(process.resourcesPath, 'icon.ico'),
    join(app.getAppPath(), 'resources', 'icon.png'),
    join(app.getAppPath(), 'resources', 'icon.ico'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

function trayMinimizeEnabled(): boolean {
  if (process.env.CURSOR_FREE_TRAY_MINIMIZE === '0') return false;
  return process.platform === 'win32' || process.platform === 'linux';
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function ensureTray(): void {
  if (!trayMinimizeEnabled() || tray) return;
  const iconPath = resolveWindowIcon();
  if (!iconPath) return;
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image);
  tray.setToolTip(PRODUCT_DISPLAY_NAME);
  const menu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => showMainWindow() },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        setRelayIsQuitting(true);
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => showMainWindow());
}

function createWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    return;
  }
  const iconPath = resolveWindowIcon();
  mainWindow = new BrowserWindow({
    title: PRODUCT_DISPLAY_NAME,
    width: 480,
    height: 680,
    minWidth: 440,
    minHeight: 560,
    autoHideMenuBar: true,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  setRelayMainWindow(mainWindow);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(join(__dirname, '../../ui/index.html'));
  mainWindow.on('close', (e) => {
    if (!getRelayIsQuitting() && trayMinimizeEnabled()) {
      ensureTray();
      if (tray) {
        e.preventDefault();
        mainWindow?.hide();
      }
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    setRelayMainWindow(null);
  });
  if (trayMinimizeEnabled()) ensureTray();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await runRelayStartup();
  if (!app.isReady()) return;
  createWindow();
});

app.on('before-quit', (event) => {
  setRelayIsQuitting(true);
  onRelayBeforeQuit();
  if (process.env.CURSOR_FREE_QUIT_RELEASE !== '1' || getRelaySwitchInFlight()) {
    return;
  }
  event.preventDefault();
  void (async () => {
    await runRelayQuitRelease();
    app.exit(0);
  })();
});

app.on('window-all-closed', () => {
  if (trayMinimizeEnabled() && tray) return;
  if (process.platform !== 'darwin') app.quit();
});

/** macOS: red-close keeps app in Dock; clicking Dock must reopen the window. */
app.on('activate', () => {
  if (process.platform !== 'darwin') return;
  showMainWindow();
});
