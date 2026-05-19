const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('minimize', () => mainWindow?.minimize());
ipcMain.on('maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('close', () => mainWindow?.close());

// 文件系统操作
ipcMain.handle('read-directory', async (event, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map(entry => ({
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isDirectory: entry.isDirectory()
    }));
  } catch (error) {
    throw new Error(`无法读取目录: ${error.message}`);
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    throw new Error(`无法读取文件: ${error.message}`);
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    throw new Error(`无法写入文件: ${error.message}`);
  }
});

ipcMain.handle('create-file', async (event, dirPath, fileName) => {
  try {
    const filePath = path.join(dirPath, fileName);
    await fs.writeFile(filePath, '', 'utf-8');
    return filePath;
  } catch (error) {
    throw new Error(`无法创建文件: ${error.message}`);
  }
});

ipcMain.handle('create-directory', async (event, parentPath, dirName) => {
  try {
    const dirPath = path.join(parentPath, dirName);
    await fs.mkdir(dirPath);
    return dirPath;
  } catch (error) {
    throw new Error(`无法创建目录: ${error.message}`);
  }
});

ipcMain.handle('delete-item', async (event, itemPath) => {
  try {
    await fs.rm(itemPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    throw new Error(`无法删除: ${error.message}`);
  }
});

ipcMain.handle('rename-item', async (event, oldPath, newName) => {
  try {
    const dir = path.dirname(oldPath);
    const newPath = path.join(dir, newName);
    await fs.rename(oldPath, newPath);
    return newPath;
  } catch (error) {
    throw new Error(`无法重命名: ${error.message}`);
  }
});

ipcMain.handle('get-home-dir', () => {
  return app.getPath('home');
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});