<div align="center" id="top">

# Polar Ops

</div>
<p align="center">
  <img alt="Top language" src="https://img.shields.io/github/languages/top/yourpov/PolarOps?color=56BEB8">
  <img alt="Language count" src="https://img.shields.io/github/languages/count/yourpov/PolarOps?color=56BEB8">
  <img alt="Repository size" src="https://img.shields.io/github/repo-size/yourpov/PolarOps?color=56BEB8">
  <img alt="License" src="https://img.shields.io/github/license/yourpov/PolarOps?color=56BEB8">
</p>

---

SSH terminal & server manager for Windows. Built with Electron.

![PolarOps](assets/img/polar%20bear%20removed%20bg%20%5B256x256%5D.png)

## What is this

A desktop app for managing SSH connections and local terminals. think of it like a simpler MobaXterm or Termius but open source and lightweight

i've been working on this for about a month now (12/15/25). it's still in beta but it's usable.

## Features

- Multi-tab terminals (local + SSH)
- Server management with folders
- Theme support (7 themes so far)
- Session logging
- Broadcast mode (send commands to multiple terminals)
- SFTP browser
- Port forwarding
- SSH key management
- Right-click paste, Ctrl+V paste, copy on select
- Draggable tabs

## Stack

- Electron 28
- xterm.js
- node-pty
- ssh2

## Install

```bash
git clone https://github.com/yourpov/PolarOps.git
cd PolarOps
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output goes to `dist/`

## Screenshots

![Dashboard](assets/img/screenshots/dashboard.png)

![Terminal](assets/img/screenshots/localTerminal.png)

![Servers](assets/img/screenshots/servers.png)

![Settings](assets/img/screenshots/settings.png)

## Known Issues

- GPU cache warnings on dev (goes away when packaged)
- Some themes need terminal restart to fully apply

## Roadmap

- [ ] Connection groups/tags
- [ ] Import/export settings
- [ ] Snippets manager
- [ ] Multi-monitor support

## Contact

- Telegram: [@depoLTC](https://github.com/depoLTC)
- GitHub: [@yourpov](https://github.com/yourpov)
- Instagram: [@capalot.ecstasy](https://instagram.com/capalot.ecstasy)

## License

MIT
