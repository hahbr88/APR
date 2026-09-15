import { app, BrowserWindow, dialog, session, shell } from 'electron';
import fs from 'node:fs/promises';
import type { Server } from 'node:http';
import path from 'node:path';
import { configurePaymentRequestTemplate } from '../src/exporter.js';
import { configureStorageDirectory } from '../src/storage.js';
import { startServer } from '../server.js';
import { configureEncryptedLlmKeys } from './llm-secret-store.js';

let mainWindow: BrowserWindow | null = null;
let localServer: Server | null = null;
let applicationUrl = '';

function configureUserDataPath(): void {
  if (app.isPackaged) return;
  app.setPath('userData', path.join(app.getPath('appData'), '지출결의서 작성-dev'));
}

function applicationPath(...segments: string[]): string {
  return path.join(app.getAppPath(), ...segments);
}

function resourcePath(...segments: string[]): string {
  return app.isPackaged ? path.join(process.resourcesPath, ...segments) : applicationPath(...segments);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f6faf7',
    title: '지출결의서 작성',
    icon: resourcePath('assets', 'icons', 'windows', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const externalUrl = new URL(url);
      if (externalUrl.protocol === 'https:' && externalUrl.hostname === 'github.com' && externalUrl.pathname.startsWith('/hahbr88/APR/issues')) {
        void shell.openExternal(externalUrl.toString());
      }
    } catch { /* 잘못된 외부 URL은 열지 않습니다. */ }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(applicationUrl)) event.preventDefault();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  void mainWindow.loadURL(applicationUrl);
}

async function startDesktopApp(): Promise<void> {
  const dataDirectory = path.join(app.getPath('userData'), 'data');
  configureStorageDirectory(dataDirectory);
  configureEncryptedLlmKeys(dataDirectory);
  const templatePath = resourcePath('assets', 'payment-request-template.xlsx');
  await fs.access(templatePath);
  configurePaymentRequestTemplate(templatePath);
  const running = await startServer({ port: 0, staticDirectory: applicationPath('dist', 'client') });
  localServer = running.server;
  applicationUrl = running.url;
  if (process.argv.includes('--smoke-test')) {
    const [health, page] = await Promise.all([fetch(`${applicationUrl}/api/health`), fetch(applicationUrl)]);
    if (!health.ok || !page.ok || !(await page.text()).includes('<div id="root"></div>')) {
      throw new Error('Electron 내부 서버 또는 화면 진입점을 확인하지 못했습니다.');
    }
    console.log('Electron smoke test passed.');
    app.quit();
    return;
  }
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createWindow();
}

configureUserDataPath();
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  app.whenReady().then(startDesktopApp).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox('앱을 시작할 수 없습니다.', message);
    app.quit();
  });
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && applicationUrl) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  localServer?.close();
  localServer = null;
});
