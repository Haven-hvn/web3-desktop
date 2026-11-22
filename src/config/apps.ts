export type AppCategory =
  | "System"
  | "Haven Core"
  | "Social & Boards"
  | "Media & Gaming"
  | "Observatory & Tools"
  | "Awesome Haven";

export type AppRenderKind =
  | { kind: "native" }
  | { kind: "iframe"; url: string }
  | { kind: "link"; url: string };

export interface AppDefinition {
  id: AppId;
  name: string;
  glyph: string;
  category: AppCategory;
  render: AppRenderKind;
  description: string;
  /** File types / Arkiv groups this app can open ("Apps Over Data" bindings). */
  handles?: string[];
  status?: "built" | "proposed";
  width: number;
  height: number;
  isExe?: boolean;
  installed: boolean;
  pinned?: boolean;
  windowTitle?: string;
}

export type AppId =
  | "explorer"
  | "haven-media"
  | "haven-bay"
  | "fairhaven"
  | "redhaven"
  | "feetonfire"
  | "planet"
  | "atlas"
  | "microstore"
  | "settings"
  | "wallet"
  | "about"
  | "notepad"
  | "shutdown"
  | "install"
  // Awesome Haven proposed/community UIs (demonstrating the "Many UIs Around One CID" catalog)
  | "haven-stems"
  | "haven-comics"
  | "haven-datasets"
  | "haven-models"
  | "haven-3d"
  | "haven-swarms";

export const APP_CATALOG: Record<AppId, AppDefinition> = {
  explorer: {
    id: "explorer",
    name: "Gate Explorer",
    glyph: "💾",
    category: "Haven Core",
    render: { kind: "native" },
    description: "My Computer for Haven: browse Token Gates as drives and Arkiv Entities as files, with Open With… across apps.",
    handles: ["haven.*", "all CIDs"],
    status: "built",
    width: 840,
    height: 540,
    isExe: true,
    installed: true,
    pinned: true,
    windowTitle: "Gate Explorer — Apps Over Data",
  },
  "haven-media": {
    id: "haven-media",
    name: "Haven Tunes 2000",
    glyph: "🎵",
    category: "Media & Gaming",
    render: { kind: "native" },
    description: "Windows 2000-era classic sovereign media library & player for encrypted Filecoin video, audio, and drip drops.",
    handles: ["haven.video.full", "haven.video.drip.*", "haven.audio.full", "haven.image.full"],
    status: "built",
    width: 900,
    height: 580,
    isExe: true,
    installed: true,
    pinned: true,
    windowTitle: "Haven Tunes 2000",
  },
  "haven-bay": {
    id: "haven-bay",
    name: "The Haven Bay",
    glyph: "🏴‍☠️",
    category: "Haven Core",
    render: { kind: "iframe", url: "/apps/haven-bay/index.html" },
    description: "Classic Pirate Bay-style universal Haven uploader, Filecoin Synapse seeder, and Arkiv OP L3 DataDAO tracker.",
    handles: ["haven.*", "upload", "seed", "all CIDs"],
    status: "built",
    width: 900,
    height: 580,
    isExe: true,
    installed: true,
    pinned: true,
    windowTitle: "The Haven Bay — Uploader & Arkiv Tracker",
  },
  fairhaven: {
    id: "fairhaven",
    name: "Fairhaven",
    glyph: "🍀",
    category: "Social & Boards",
    render: { kind: "native" },
    description: "4chan-style ephemeral, token-gated imageboard. Every Haven media upload under a gate automatically appears as a thread.",
    handles: ["haven.board.*", "haven.*.full"],
    status: "built",
    width: 820,
    height: 560,
    isExe: true,
    installed: true,
    pinned: true,
    windowTitle: "Fairhaven — Gated Imageboard",
  },
  redhaven: {
    id: "redhaven",
    name: "Redhaven",
    glyph: "👽",
    category: "Social & Boards",
    render: { kind: "native" },
    description: "Old-Reddit ranked client over the exact same Arkiv entities as Fairhaven, plus P2P voting & gate asset sidebars.",
    handles: ["haven.board.*", "haven.*.full"],
    status: "built",
    width: 860,
    height: 560,
    isExe: true,
    installed: true,
    pinned: true,
    windowTitle: "Redhaven — Subreddits Over Gates",
  },
  feetonfire: {
    id: "feetonfire",
    name: "FeetOnFire",
    glyph: "🔥",
    category: "Media & Gaming",
    render: { kind: "native" },
    description: "StepMania / DDR rhythm game loading clear & token-gated song pack ZIPs from haven.file.full Arkiv entities.",
    handles: ["haven.file.full (x.dance)", "SM/SSC ZIP packs"],
    status: "built",
    width: 860,
    height: 580,
    isExe: true,
    installed: true,
    pinned: true,
    windowTitle: "FeetOnFire — StepMania Rhythm Game",
  },
  planet: {
    id: "planet",
    name: "Apps Over Data",
    glyph: "🪐",
    category: "Haven Core",
    render: { kind: "native" },
    description: "Interactive visual map of Haven L7: 4 public networks feeding live Arkiv entities into multiple interchangeable GUIs.",
    handles: ["Protocol Topology"],
    status: "built",
    width: 860,
    height: 560,
    installed: true,
    pinned: true,
    windowTitle: "Apps Over Data — Haven L7 Visualizer",
  },
  atlas: {
    id: "atlas",
    name: "Haven Atlas",
    glyph: "🌐",
    category: "Observatory & Tools",
    render: { kind: "native" },
    description: "Live multi-chain liveness monitor: Arkiv Rabdi block height & entity count, EVM L2s, Filecoin FEVM, and ICP VetKD epoch.",
    status: "built",
    width: 740,
    height: 500,
    installed: true,
    windowTitle: "Haven Atlas — Live Network Observatory",
  },
  microstore: {
    id: "microstore",
    name: "Microstore",
    glyph: "🛒",
    category: "Haven Core",
    render: { kind: "native" },
    description: "Awesome Haven app catalog: discover built & proposed UIs around the same Filecoin CIDs and install them to your desktop.",
    status: "built",
    width: 820,
    height: 540,
    isExe: true,
    installed: true,
  },
  settings: {
    id: "settings",
    name: "Control Panel",
    glyph: "⚙️",
    category: "Observatory & Tools",
    render: { kind: "native" },
    description: "Configure Arkiv RPC (Rabdi / custom), ICP Haven-AOL canister, IPFS/Synapse gateways, OS Keyring, App Mounts, and Themes.",
    status: "built",
    width: 720,
    height: 520,
    installed: true,
    pinned: true,
    windowTitle: "Control Panel — Haven OS Settings",
  },
  wallet: {
    id: "wallet",
    name: "Wallet & Keys",
    glyph: "🔑",
    category: "Haven Core",
    render: { kind: "native" },
    description: "Connect your EVM wallet (or set a watch address), inspect L2 token gate balances, and manage 30-day VetKD epoch keys.",
    status: "built",
    width: 640,
    height: 480,
    installed: true,
    windowTitle: "Wallet & Haven-AOL Keyring",
  },
  notepad: {
    id: "notepad",
    name: "Notepad",
    glyph: "📝",
    category: "Observatory & Tools",
    render: { kind: "native" },
    description: "Scratchpad persisted to localStorage for drafting posts, CIDs, and Arkiv queries.",
    status: "built",
    width: 520,
    height: 380,
    installed: false,
  },
  about: {
    id: "about",
    name: "About Haven OS",
    glyph: "🏛️",
    category: "System",
    render: { kind: "native" },
    description: "Architecture and protocol overview of Haven OS 98.",
    status: "built",
    width: 660,
    height: 480,
    installed: true,
  },
  shutdown: {
    id: "shutdown",
    name: "Shut Down",
    glyph: "🔌",
    category: "System",
    render: { kind: "native" },
    description: "Shut down, restart, or drop into Arkiv-DOS mode.",
    width: 440,
    height: 250,
    installed: true,
  },
  install: {
    id: "install",
    name: "Install App",
    glyph: "💿",
    category: "System",
    render: { kind: "native" },
    description: "Install a Haven app onto the desktop.",
    width: 420,
    height: 230,
    installed: false,
  },
  // Awesome Haven proposed ecosystem interfaces (from awesome-haven/README.md)
  "haven-stems": {
    id: "haven-stems",
    name: "Stems & Tabs",
    glyph: "🎸",
    category: "Awesome Haven",
    render: { kind: "link", url: "https://github.com/Haven-hvn/haven-clients-experimental" },
    description: "Proposed audio/* & psarc/gp5 stem splitter, mixer, and guitar tab viewer sharing Haven audio CIDs.",
    handles: ["audio/*", "psarc", "gp5"],
    status: "proposed",
    width: 600,
    height: 420,
    installed: false,
  },
  "haven-comics": {
    id: "haven-comics",
    name: "Ebook & CBZ Reader",
    glyph: "📚",
    category: "Awesome Haven",
    render: { kind: "link", url: "https://github.com/Haven-hvn/docs" },
    description: "Proposed epub.js / pdf.js / CBZ reader and citation graph over Haven document CIDs.",
    handles: ["application/pdf", "epub", "cbz"],
    status: "proposed",
    width: 600,
    height: 420,
    installed: false,
  },
  "haven-datasets": {
    id: "haven-datasets",
    name: "Dataset Console",
    glyph: "📊",
    category: "Awesome Haven",
    render: { kind: "link", url: "https://github.com/Haven-hvn/docs" },
    description: "Proposed CSV/Parquet/Arrow table explorer and provenance viewer for DataDAOs.",
    handles: ["csv", "parquet", "jsonl", "arrow"],
    status: "proposed",
    width: 600,
    height: 420,
    installed: false,
  },
  "haven-models": {
    id: "haven-models",
    name: "Model Weights & WASM",
    glyph: "🧠",
    category: "Awesome Haven",
    render: { kind: "link", url: "https://github.com/Haven-hvn/haven-clients-experimental" },
    description: "Proposed safetensors / GGUF / ONNX weight loader & sandboxed WebAssembly runner.",
    handles: ["safetensors", "gguf", "onnx", "wasm"],
    status: "proposed",
    width: 600,
    height: 420,
    installed: false,
  },
  "haven-3d": {
    id: "haven-3d",
    name: "3D & Game Mods",
    glyph: "🧊",
    category: "Awesome Haven",
    render: { kind: "link", url: "https://github.com/Haven-hvn/haven-clients-experimental" },
    description: "Proposed glTF/GLB/USDZ spatial viewer and game mod manager over token-gated Filecoin packs.",
    handles: ["gltf", "glb", "pak", "psarc"],
    status: "proposed",
    width: 600,
    height: 420,
    installed: false,
  },
  "haven-swarms": {
    id: "haven-swarms",
    name: "Agent Swarm Console",
    glyph: "🤖",
    category: "Awesome Haven",
    render: { kind: "link", url: "https://github.com/Haven-hvn/deepseek-harness-web3-agent-stack" },
    description: "DeepSeek Harness Web3 agent stack (dsh-board / dsh-votes) posting & voting as ordinary token holders.",
    handles: ["haven.board.*", "dsh-plugins"],
    status: "built",
    width: 600,
    height: 420,
    installed: false,
  },
};

export const START_MENU_CATEGORIES: AppCategory[] = [
  "Haven Core",
  "Social & Boards",
  "Media & Gaming",
  "Observatory & Tools",
  "Awesome Haven",
];
