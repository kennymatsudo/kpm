import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { getConfig } from '../config';
import { isAllowedExternalUrl } from '../security/externalUrl';
import { isTrustedAppUrl } from '../security/appUrl';
import { resolveStartupBackgroundColor } from './themeAppearance';

export interface MainWindowManagerDeps {
  loadWindowBounds: () => Electron.Rectangle | null;
  saveWindowBounds: (bounds: Electron.Rectangle) => void;
}

function shouldOpenDevToolsOnStartup(): boolean {
  return process.env.KPM_OPEN_DEVTOOLS === '1' || process.env.KPM_OPEN_DEVTOOLS === 'true';
}

export function createMainWindowManager(deps: MainWindowManagerDeps) {
  let mainWindow: BrowserWindow | null = null;

  function createWindow(): void {
    const windowConfig = getConfig().window;
    const savedBounds = deps.loadWindowBounds();

    mainWindow = new BrowserWindow({
      width: savedBounds?.width ?? windowConfig.width,
      height: savedBounds?.height ?? windowConfig.height,
      x: savedBounds?.x,
      y: savedBounds?.y,
      minWidth: windowConfig.minWidth,
      minHeight: windowConfig.minHeight,
      backgroundColor: resolveStartupBackgroundColor(),
      icon: app.isPackaged
        ? undefined
        : path.join(process.cwd(), 'assets', 'icon.png'),
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: windowConfig.trafficLightPosition,
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedExternalUrl(url)) {
        void shell.openExternal(url);
      } else {
        console.warn(`[Main] Blocked unsafe external URL: ${url}`);
      }
      return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event) => {
      const { url } = event;
      if (isTrustedAppUrl(url)) {
        return;
      }

      event.preventDefault();
      if (isAllowedExternalUrl(url)) {
        void shell.openExternal(url);
      } else {
        console.warn(`[Main] Blocked renderer navigation: ${url}`);
      }
    });

    mainWindow.webContents.on('will-frame-navigate', (event) => {
      if (event.isMainFrame) {
        return;
      }

      const { url } = event;
      if (isTrustedAppUrl(url)) {
        return;
      }

      event.preventDefault();
      console.warn(`[Main] Blocked renderer frame navigation: ${url}`);
    });

    const persistBounds = () => {
      if (mainWindow) {
        deps.saveWindowBounds(mainWindow.getBounds());
      }
    };

    mainWindow.on('resize', persistBounds);
    mainWindow.on('move', persistBounds);

    const rendererUrl = process.env.ELECTRON_RENDERER_URL;
    if (!app.isPackaged && rendererUrl) {
      void mainWindow.loadURL(rendererUrl);
      if (shouldOpenDevToolsOnStartup()) {
        mainWindow.webContents.openDevTools();
      }
    } else {
      void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }
  }

  function getMainWindow(): BrowserWindow | null {
    return mainWindow;
  }

  return {
    createWindow,
    getMainWindow,
  };
}
