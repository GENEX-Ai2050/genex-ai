const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#050816',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadURL('http://localhost:8080');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('open-url', async (_event, url) => {
  if (!url) return { ok: false, error: 'Missing URL' };
  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('copy-text', async (_event, text) => {
  if (!text) return { ok: false, error: 'Missing text' };
  clipboard.writeText(text);
  return { ok: true };
});

ipcMain.handle('genex:create-realtime-session', async (_event, payload) => {
  try {
    const apiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        ok: false,
        error: 'OpenAI API key not found in .env'
      };
    }

    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: payload?.model || 'gpt-realtime',
        voice: payload?.voice || 'cedar',
        modalities: ['audio', 'text'],
        instructions: payload?.instructions || 'You are GENEX AI.'
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error: data?.error?.message || 'Failed to create realtime session'
      };
    }

    return {
      ok: true,
      clientSecret: data?.client_secret?.value,
      model: payload?.model || 'gpt-realtime',
      voice: payload?.voice || 'cedar'
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || 'Unknown error while creating realtime session'
    };
  }
});

ipcMain.handle('genex:show-founder', async (_event, founderImageUrl) => {
  if (!founderImageUrl) return { ok: false, error: 'Founder image URL is not configured yet.' };
  await shell.openExternal(founderImageUrl);
  return { ok: true };
});
