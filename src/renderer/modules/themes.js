const TerminalThemes = {
  'polar-dark': {
    background: '#0d1117',
    foreground: '#c9d1d9',
    cursor: '#00d9ff',
    cursorAccent: '#0d1117',
    selectionBackground: '#1f6feb',
    selectionForeground: '#ffffff',
    black: '#484f58',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#00d9ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#b1bac4',
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#f0f6fc'
  },
  'ocean': {
    background: '#0a192f',
    foreground: '#a8b2d1',
    cursor: '#64ffda',
    cursorAccent: '#0a192f',
    selectionBackground: '#1d3557',
    selectionForeground: '#ffffff',
    black: '#233554',
    red: '#ff6b6b',
    green: '#64ffda',
    yellow: '#ffd93d',
    blue: '#57cbff',
    magenta: '#c792ea',
    cyan: '#64ffda',
    white: '#a8b2d1',
    brightBlack: '#495670',
    brightRed: '#ff8080',
    brightGreen: '#7dffe3',
    brightYellow: '#ffe066',
    brightBlue: '#80d4ff',
    brightMagenta: '#d4a6f0',
    brightCyan: '#7dffe3',
    brightWhite: '#e6f1ff'
  },
  'midnight': {
    background: '#13111c',
    foreground: '#c9c4d9',
    cursor: '#b794f4',
    cursorAccent: '#13111c',
    selectionBackground: '#332d42',
    selectionForeground: '#ffffff',
    black: '#241e30',
    red: '#fc8181',
    green: '#68d391',
    yellow: '#f6e05e',
    blue: '#63b3ed',
    magenta: '#b794f4',
    cyan: '#4fd1c5',
    white: '#c9c4d9',
    brightBlack: '#4a4458',
    brightRed: '#feb2b2',
    brightGreen: '#9ae6b4',
    brightYellow: '#faf089',
    brightBlue: '#90cdf4',
    brightMagenta: '#d6bcfa',
    brightCyan: '#76e4d6',
    brightWhite: '#f4f0ff'
  },
  'rose': {
    background: '#1a1215',
    foreground: '#e8d5d9',
    cursor: '#f472b6',
    cursorAccent: '#1a1215',
    selectionBackground: '#3d2f33',
    selectionForeground: '#ffffff',
    black: '#2d2226',
    red: '#fb7185',
    green: '#86efac',
    yellow: '#fde047',
    blue: '#7dd3fc',
    magenta: '#f472b6',
    cyan: '#5eead4',
    white: '#e8d5d9',
    brightBlack: '#4d3f43',
    brightRed: '#fda4af',
    brightGreen: '#a7f3d0',
    brightYellow: '#fef08a',
    brightBlue: '#a5f3fc',
    brightMagenta: '#f9a8d4',
    brightCyan: '#99f6e4',
    brightWhite: '#fdf0f3'
  },
  'arctic': {
    background: '#f8fafc',
    foreground: '#334155',
    cursor: '#0891b2',
    cursorAccent: '#f8fafc',
    selectionBackground: '#bae6fd',
    selectionForeground: '#0f172a',
    black: '#64748b',
    red: '#dc2626',
    green: '#059669',
    yellow: '#d97706',
    blue: '#0891b2',
    magenta: '#7c3aed',
    cyan: '#0891b2',
    white: '#334155',
    brightBlack: '#94a3b8',
    brightRed: '#ef4444',
    brightGreen: '#10b981',
    brightYellow: '#f59e0b',
    brightBlue: '#06b6d4',
    brightMagenta: '#8b5cf6',
    brightCyan: '#14b8a6',
    brightWhite: '#0f172a'
  },
  'monokai': {
    background: '#272822',
    foreground: '#f8f8f2',
    cursor: '#66d9ef',
    cursorAccent: '#272822',
    selectionBackground: '#49483e',
    selectionForeground: '#ffffff',
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#e6db74',
    blue: '#66d9ef',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2',
    brightBlack: '#75715e',
    brightRed: '#f92672',
    brightGreen: '#a6e22e',
    brightYellow: '#e6db74',
    brightBlue: '#66d9ef',
    brightMagenta: '#ae81ff',
    brightCyan: '#a1efe4',
    brightWhite: '#f9f8f5'
  },
  'dracula': {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#bd93f9',
    cursorAccent: '#282a36',
    selectionBackground: '#44475a',
    selectionForeground: '#ffffff',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff'
  }
};

const ThemeLabels = {
  'polar-dark': 'Polar Dark (Default)',
  'ocean': 'Ocean',
  'midnight': 'Midnight Purple',
  'rose': 'Rose',
  'arctic': 'Arctic (Light)',
  'monokai': 'Monokai',
  'dracula': 'Dracula'
};

function getTerminalTheme(name) {
  return TerminalThemes[name] || TerminalThemes['polar-dark'];
}

function getThemeOptions() {
  return Object.entries(ThemeLabels).map(([value, label]) => ({ value, label }));
}

function applyUITheme(themeName, settings) {
  document.documentElement.setAttribute('data-theme', themeName);
  if (settings) {
    settings.theme = themeName;
  }
}

function applyTerminalTheme(themeName, sessions, settings) {
  if (settings) {
    settings.terminalTheme = themeName;
  }
  
  const theme = getTerminalTheme(themeName);
  if (sessions) {
    sessions.forEach(session => {
      if (session.terminal) {
        session.terminal.options.theme = theme;
      }
    });
  }
}

module.exports = {
  TerminalThemes,
  ThemeLabels,
  getTerminalTheme,
  getThemeOptions,
  applyUITheme,
  applyTerminalTheme
};
