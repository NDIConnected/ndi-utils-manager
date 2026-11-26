# Contributing

Thank you for your interest in NDI Manager.

## Development setup

**Requirements**

- Windows 10/11 x64
- [.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0)
- [NDI 6 SDK](https://ndi.video/) runtime (`Processing.NDI.Lib.x64.dll`) available on the machine
- [Node.js](https://nodejs.org/) — only if you rebuild the Web UI from `ndi-web-ui/`
- Optional: [Inno Setup 6](https://jrsoftware.org/isinfo.php) for the Windows installer

**Run (backend + tray)**

```bash
dotnet run
```

**Web UI (dev)**

```bash
cd ndi-web-ui
npm install
npm run dev
```

**Installer**

```bash
.\scripts\publish-standalone.ps1
# then build with Inno Setup — see INSTALLER_README.md
```

See [README.md](README.md) for full details.

## Pull requests

1. Fork the repository and create a feature branch from `main`.
2. Keep changes focused — one logical change per PR.
3. Ensure `dotnet build NDIManager.csproj -c Release` succeeds. If you changed `ndi-web-ui/`, also run `npm run lint`, `npm test` and `npm run build` there (all must pass).
4. Update [CHANGELOG.md](CHANGELOG.md) for user-visible changes.
5. Open a PR against `NDIConnected/ndi-utils-manager` with a clear description and test notes.

## Code style

- Match existing naming and patterns in the file you edit.
- Do not commit the NDI SDK tree (`NDI 6 SDK/`), `bin/`, `obj/`, `publish/`, `Output/`, `wwwroot/` build output, `node_modules/`, installer binaries, or secrets.

## Reporting issues

Use [GitHub Issues](https://github.com/NDIConnected/ndi-utils-manager/issues). Include version, OS, and steps to reproduce.

**Security vulnerabilities** must not be posted as public issues. Use [GitHub Security Advisories](https://github.com/NDIConnected/ndi-utils-manager/security/advisories/new) instead. See [SECURITY.md](SECURITY.md).

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## License

By contributing, you agree that your contributions will be licensed under the same [MIT License](LICENSE) as the project.
