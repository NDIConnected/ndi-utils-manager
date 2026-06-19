# NDI Manager Web UI

Frontend for **NDI Manager**, built with React + Vite and rendered through React Flow.

## Main Features

- Multichannel aggregated sender/receiver nodes
- Real-time connection visualization and edge actions
- `Streaming X/Y` status on aggregated devices
- Sender/Receiver filter boxes with advanced query syntax:
  - `,` = AND
  - `|` = OR
  - `*` and `?` wildcards

## Development

```bash
npm install
npm run dev
```

Default API base is served by the desktop host/backend under `/api/ndi`.

## Production Build

```bash
npm run build
```

Build output is generated in `dist/` and copied to backend `wwwroot/` during packaging.
