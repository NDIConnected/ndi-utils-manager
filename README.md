# NDI Manager 6.3

Applicazione Windows (.NET 9) che gira in **system tray**, espone un’**API ASP.NET Core** e una **Web UI** per discovery e gestione delle connessioni NDI (send/receive, flusso visuale con React Flow).

Repository: https://github.com/NDIConnected/ndi-utils-manager

## Requisiti

- Windows x64  
- [.NET SDK 9](https://dotnet.microsoft.com/download)  
- **NDI SDK 6** installato, con la DLL in  
  `C:\Program Files\NDI\NDI 6 SDK\Bin\x64\Processing.NDI.Lib.x64.dll`  
  (come da riferimento nel file di progetto)  
- Per sviluppare o ricompilare la UI: Node.js (vedi cartella `ndi-web-ui`)

## Avvio in sviluppo

Dalla root del repository:

```powershell
dotnet run
```

L’app si avvia in tray; dalla tray puoi aprire la **Web UI** (di default `http://localhost:5000`, porta configurabile dal menu).

## Web UI (frontend)

Cartella `ndi-web-ui`: istruzioni in [ndi-web-ui/README.md](ndi-web-ui/README.md).

```powershell
cd ndi-web-ui
npm install
npm run dev
```

In produzione il backend serve i file statici da `wwwroot/` (vedi sotto).

## Build installer e pacchetto di release

Procedura completa (frontend → `wwwroot` → publish → Inno Setup):  
[INSTALLER_README.md](INSTALLER_README.md).

## Documentazione aggiuntiva

- [DOCS/](DOCS/) — note di implementazione e guide  
- [CHANGELOG.md](CHANGELOG.md)

## Struttura (semplificata)

| Percorso | Contenuto |
|----------|-----------|
| `Controllers/`, `Services/` | API e discovery NDI |
| `ndi-web-ui/` | React + Vite |
| `wwwroot/` | Output UI servito dall’app (generato dalla build, non versionato) |
| `NDIManager-Setup.iss` | Script installer Inno Setup |
