const State = {
  sessions: new Map(),
  activeSessionId: null,
  sessionCounter: 0,
  currentView: 'dashboard',
  savedServers: [],
  settings: {},
  
  contextMenu: {
    sessionId: null,
    visible: false
  },
  
  broadcast: {
    active: false
  },
  
  search: {
    terminalVisible: false,
    currentSessionId: null,
    matches: [],
    currentMatchIndex: -1
  },
  
  sftp: {
    activeSessions: new Map()
  },
  
  portForwards: [],
  sshKeys: [],
  
  getNextSessionId() {
    return this.sessionCounter++;
  },
  
  setActiveSession(id) {
    this.activeSessionId = id;
  },
  
  getActiveSession() {
    return this.sessions.get(this.activeSessionId);
  }
};

module.exports = State;
