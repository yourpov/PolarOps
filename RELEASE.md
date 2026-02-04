# PolarOps v1.0.0-beta

First public beta release.

## Features

- **Multi-tab terminals** - Local PowerShell/CMD and SSH sessions in tabs
- **Server management** - Save connections, organize with folders
- **7 themes** - Polar Dark, Ocean, Midnight Purple, Rose, Arctic, Monokai, Dracula
- **Session logging** - Auto-save terminal output to files
- **Broadcast mode** - Send commands to multiple terminals at once
- **SFTP browser** - Browse and transfer files over SSH
- **Port forwarding** - Local and remote tunnels
- **SSH key management** - Generate and manage keys
- **Drag & drop tabs** - Reorder terminal tabs
- **Quick reconnect** - Fast access to recent connections

## Download

- **Windows**: `PolarOps 1.0.0.exe` (portable, no install needed)

## Requirements

- Windows 10/11
- No dependencies required for the exe

## Build from source

```bash
git clone https://github.com/yourpov/PolarOps.git
cd PolarOps
npm install
npm run build
```

## Known Issues

- GPU cache warnings in dev mode (doesn't affect packaged app)
- Theme changes may need terminal restart to fully apply

## What's Next

- Connection groups/tags
- Import/export settings
- Snippets manager
- Multi-monitor support

---

Built with Electron, xterm.js, node-pty, ssh2
