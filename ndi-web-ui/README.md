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

Default API base is served by the desktop host/backend under `/api/ndi`; the dev server proxies `/api` and `/hubs` (SignalR) to `http://localhost:5000`.

## Tests and lint

```bash
npm test          # Vitest, runs once (npm run test:watch for watch mode)
npm run lint      # ESLint, must report 0 problems
```

Unit tests live in `src/utils/__tests__/` and cover the pure logic: filters, graph building
(nodes/edges, optimistic connections, caching), snapshot ordering, routing helpers and layout.

## Code structure

| Path | Responsibility |
|------|----------------|
| `components/NDIFlowEditor.jsx` | Main screen: view state, toolbar, canvas, table; wires the hooks below |
| `hooks/useNdiSnapshot.js` | Backend data: `/devices` + `/status`, SignalR push, polling fallback, offline state |
| `hooks/useNdiSignalR.js` | SignalR connection that reconnects forever |
| `hooks/useRouting.js` | Connect / disconnect / reconnect commands, optimistic and suppressed routes |
| `hooks/useCanvasLayout.js` | Node positions, persistence, auto layout, Reset / Align / presets |
| `utils/flowGraph.js` | Pure: snapshot → React Flow nodes/edges (`buildFlowGraph`), merge helpers |
| `utils/flowFilters.js` | Pure: filter syntax, host / "Active only" filtering, connection confirmation |
| `utils/routing.js`, `utils/snapshotOrder.js` | Pure: handle → NDI names, optimistic connection, snapshot ordering, retry backoff |
| `utils/layoutUtils.js`, `utils/deviceGrouping.js` | Pure: layout computation, host grouping |

## Production Build

```bash
npm run build
```

Build output is generated in `dist/` and copied to backend `wwwroot/` during packaging.
