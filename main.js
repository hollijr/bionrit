const electron = require('electron');
const url = require('url');
const path = require('path');

const {app, BrowserWindow, Menu} = electron;

let mainWindow;

// comment out for development
//process.env.NODE_ENV = "production";

// Listen for app to be ready
app.on('ready', function() {
  var JSONStorage = require('node-localstorage').JSONStorage;
  var storageLocation = app.getPath('userData');
  global.nodeStorage = new JSONStorage(storageLocation);

  var windowState = {}; 
  try { 
    windowState = global.nodeStorage.getItem('windowstate');   
  } catch (err) { 
    // the file is there, but corrupt. Handle appropriately. 
  }

  // if there's nothing in storage, create a windowState object
  if (!windowState) {
    windowState = { bounds: {x: undefined, y: undefined, 
                            width: 1000, height: 800},
                    isMaximized: false
                  };
  }

  // create new window
  mainWindow = new BrowserWindow({ 
    title: 'EXIF Data Extractor',
    x: windowState.bounds && windowState.bounds.x || undefined, 
    y: windowState.bounds && windowState.bounds.y || undefined,   
    width: windowState.bounds && windowState.bounds.width || 1000, 
    height: windowState.bounds && windowState.bounds.height || 800
  });

  // maximize state if that's what user has indicated
  if (windowState.isMaximized) { 
    mainWindow.maximize(); 
  }

  // set listeners to store window state on closure
  ['resize', 'move', 'close' ].forEach(function(e) { 
    mainWindow.on(e, function() { 
      storeWindowState(); 
    }); 
  });

  // store window state for next time
  var storeWindowState = function() { 
    windowState.isMaximized = mainWindow.isMaximized(); 
    if (!windowState.isMaximized) { 
      // only update bounds if the window isn’t currently maximized    
      windowState.bounds = mainWindow.getBounds(); 
    }
   
    global.nodeStorage.setItem('windowstate', windowState); 
  };

  // load html into window
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'mainWindow.html'),
    protocol: 'file:',
    slashes: true
  }));

  // build menu from template
  const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);

  // insert menu
  Menu.setApplicationMenu(mainMenu);
});

// create menu template
const mainMenuTemplate = [
  {
    label: 'File',
    submenu: [
      {
        label: 'Quit',
        accelerator: process.platform == 'darwin' ? 'Command+Q' : 'Ctrl+Q',
        click(){
          app.quit();
        }
      }
    ]
  }
];

// if mac, add empty object to menu
if (process.platform == 'darwin') {
  mainMenuTemplate.unshift({});
}

// add developer tools item if not in prod
if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
  mainMenuTemplate.push({
    label: 'Developer Tools',
    submenu: [
      {
        label: 'Toggle DevTools',
        accelerator: process.platform == 'darwin' ? 'Command+I' : 'Ctrl+I',
        click(item, focusedWindow) {
          focusedWindow.toggleDevTools();
        }
      },
      {
        role: 'reload'
      }
    ]
  });
}