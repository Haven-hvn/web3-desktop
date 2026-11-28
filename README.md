# Haven OS 98 — Web3 Apps Over Data Desktop

A Windows 98-inspired Web3 Desktop aggregating the Haven application-layer (L7) ecosystem into a single zero-backend operating environment.

## Apps Over Data

Every app on the desktop reads the **same public on-chain data** through one shared **Haven OS Kernel**:

- **Metadata & Discovery:** Arkiv OP L3 (`0x44…0044`), defaulting to **Rabdi** (`https://rpc.rabdi.db-chain.testnet.arkiv.network`) and reconfigurable at runtime via **Control Panel**.
- **Access Control:** Any EVM L1/L2 token or NFT gate (Ethereum, Base, Arbitrum, Optimism, Sepolia) verified by the **Haven-AOL ICP canister** (`3gzy3-kaaaa-aaaan-q6y6q-cai`).
- **Shared OS VetKD Keyring:** Sign EIP-712 `GateRequestV3` **once per gate per 30-day epoch** — unlocked keys are immediately shared across every open window on the desktop.
- **Encrypted Media Storage:** Filecoin Onchain Cloud (`piece` CommP) & IPFS (`fcid`).

## Included Desktop Apps

- **🪐 Apps Over Data Visualizer (`planet`)** — Interactive topology connecting the 4 public networks → live Arkiv entities → all compatible desktop apps.
- **💾 Gate Explorer (`explorer`)** — "My Computer" where Token Gates are Drives, Arkiv Entities are Files, and every record has an **Open With…** menu.
- **🎵 Haven Tunes 2000 (`haven-media`)** — Classic library & player (`haven-tunes`) with Gate Playlists and local VetKD decryption.
- **🏴‍☠️ The Haven Bay (`haven-bay`)** — Decentralized uploader & publisher for Arkiv + Filecoin/IPFS + VetKD encrypted drops.
- **🍀 Fairhaven (`fairhaven`)** — 4chan-style ephemeral gated imageboard surfacing both `haven.board.thread` and `haven.*.full` media drops.
- **👽 Redhaven (`redhaven`)** — Old-Reddit ranked client reading the exact same Arkiv entities as Fairhaven, with persistent voting and one-click side-by-side tiling.
- **🔥 FeetOnFire (`feetonfire`)** — StepMania / DDR social pack browser (`haven.file.full` `x.dance`) and embedded rhythm game frame.
- **🌐 Haven Atlas (`atlas`)** — Live browser probes for Arkiv Rabdi, EVM L2s, Filecoin FEVM, and ICP VetKD epoch clock.
- **🛒 Microstore (`microstore`)** — Curated `awesome-haven` catalog of built & proposed UIs around the same Filecoin CIDs.
- **⚙️ Control Panel (`settings`)** — Live network presets (`Rabdi` / `localhost` / custom RPC), ICP canister & gateway settings, OS VetKD Keyring & shared cache manager, Embedded App Mount URLs, and Themes.
- **🔑 Wallet & Keys (`wallet`)** — EIP-6963 / injected EVM wallet connection, Watch-Only address gate balance checks, and VetKD epoch unlocks.

## Shared Cache Bridge (`haven-os:v1`)

Embedded `*.pinme.dev` iframe apps (`haven-tunes`, `haven-bay`, `fairhaven`, `redhaven`, `feetonfire`) communicate with the desktop over `window.postMessage` on channel `haven-os:v1`.

On `hello` → `welcome`, the host advertises `capabilities: ["arkiv-cache", "media-cache", "transfer-dialog"]` and supports:

- **Arkiv entity cache**
  - `haven_getEntities` (`{ grpPrefix?: string, gateKey?: string, refresh?: boolean }`) → returns cached `HavenEntity[]` from the OS kernel.
  - Event `entitiesChanged` → broadcast whenever the OS Arkiv index updates.
  - Event `openEntity` (`{ gateKey?, entityKey? }`) → sent when the user deep-links an entity into an already-open iframe window.
- **Shared playback / media cache (IndexedDB, 512 MiB LRU)**
  - `haven_mediaCacheGet` (`{ key: string }`) → returns `{ key, bytes: ArrayBuffer, mimeType, size, encrypted, createdAt, lastAccessedAt, meta } | null` (uses zero-copy transferable `ArrayBuffer`).
  - `haven_mediaCacheHas` (`{ key: string }`) → returns `boolean`.
  - `haven_mediaCachePut` (`{ key: string, bytes: ArrayBuffer | Uint8Array | Blob, mimeType?: string, encrypted?: boolean, meta?: Record<string, unknown> }`) → returns `{ stored, size, evictedCount, reason? }`.
  - `haven_mediaCacheDelete` (`{ key: string }`) → deletes a cached item.
  - `haven_mediaCacheStats` (`{}`) → returns `{ count, totalBytes, maxBytes }`.
- **Classic Win98 file transfer dialog**
  - `haven_reportTransfer` (`{ id, direction: "upload" | "download", label, from?, to?, loaded?, total?, status: "active" | "done" | "error" | "cancelled", detail? }`) → displays the animated flying-paper Win98 transfer window with live segmented progress bar, transfer speed, and ETA.
  - `haven_clearTransfer` (`{ id: string }`) → dismisses a transfer entry.
