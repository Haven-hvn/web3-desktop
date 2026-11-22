# Haven OS 98 — Web3 Apps Over Data Desktop

A Windows 98-inspired Web3 Desktop aggregating the Haven application-layer (L7) ecosystem into a single zero-backend operating environment.

## Apps Over Data

Every app on the desktop reads the **same public on-chain data** through one shared **Haven OS Kernel**:

- **Metadata & Discovery:** Arkiv OP L3 (`0x44…0044`), defaulting to **Rabdi** (`https://rpc.rabdi.db-chain.testnet.arkiv.network`) and reconfigurable at runtime via **Control Panel**.
- **Access Control:** Any EVM L1/L2 token or NFT gate (Ethereum, Base, Arbitrum, Optimism, Sepolia) verified by the **Haven-AOL ICP canister** (`gny6k-fqaaa-aaaab-ag3ra-cai`).
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
- **⚙️ Control Panel (`settings`)** — Live network presets (`Rabdi` / `localhost` / custom RPC), ICP canister & gateway settings, OS VetKD Keyring manager, App Runtime Modes (Native vs. Embedded Iframe), and Themes.
- **🔑 Wallet & Keys (`wallet`)** — EIP-6963 / injected EVM wallet connection, Watch-Only address gate balance checks, and VetKD epoch unlocks.
