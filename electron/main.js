import { app, BrowserWindow } from "electron";

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
  });

  // DEV: Load the local web server
  if (process.env.NODE_ENV === "development") {
    win.loadURL("http://localhost:3000"); 
  } 
  // PROD: Load the packaged files
  else {
    win.loadFile("dist/index.html");
  }
};

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
