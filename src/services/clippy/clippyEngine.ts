import { toBytes } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type {
  Client,
  DeviceSyncOptions,
  Group,
  NetworkOptions,
  OtherOptions,
  Signer,
  StorageOptions,
} from "@xmtp/browser-sdk";

export const DEFAULT_CLIPPY_AGENT_ADDRESS = "0x90779a7582aafb91b9ad78e9f3a3cba88ed44042";
export const DEFAULT_CLIPPY_ROOM_URL = "https://shoutbox.pinme.dev/default";
const GUN_NAMESPACE = "shoutbox-v1";
const EPHEMERAL_KEY_STORAGE = "haven-clippy:ephemeral-private-key";
const HEARTBEAT_INTERVAL_MS = 10_000;
const PRESENCE_STALE_MS = 35_000;
const SLIDING_WINDOW_MINUTES = 60;
const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;
const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export type ClippyConnectionStatus =
  | "idle"
  | "initializing"
  | "connecting_room"
  | "ready"
  | "error";

export interface ClippyPeer {
  inboxId: string;
  address: string;
  lastSeen: number;
  isOnline: boolean;
  isAgent?: boolean;
  isSelf?: boolean;
}

export interface ClippyMessage {
  id: string;
  senderInboxId: string;
  senderAddress: string;
  role: "agent" | "self" | "user";
  content: string;
  timestamp: number;
  groupId: string;
}

export interface ClippyEngineState {
  status: ClippyConnectionStatus;
  statusDetail: string;
  error: string | null;
  myAddress: string | null;
  myInboxId: string | null;
  agentAddress: string;
  roomUrl: string;
  groupId: string | null;
  isLeader: boolean;
  relayConnected: boolean;
  onlineUsers: ClippyPeer[];
  messages: ClippyMessage[];
}

export interface ClippyEngineOptions {
  xmtpEnv: "production" | "dev";
  roomUrl: string;
  agentAddress: string;
  gunRelays: string;
}

interface GroupWindowRecord {
  groupId: string;
  epoch: number;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  windowMinutes: number;
}

interface GunPresenceRecord {
  inboxId: string;
  address: string;
  ts: number;
  status: "online" | "offline";
}

function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    const path = url.pathname.replace(/\/+$/, "") || "";
    return `${url.protocol}//${url.hostname.toLowerCase()}${path}`;
  } catch {
    return DEFAULT_CLIPPY_ROOM_URL;
  }
}

async function hashUrl(raw: string): Promise<string> {
  const normalized = normalizeUrl(raw);
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getOrCreateEphemeralAccount() {
  let pk: `0x${string}` | null = null;
  try {
    const stored = localStorage.getItem(EPHEMERAL_KEY_STORAGE);
    if (stored && PRIVATE_KEY_RE.test(stored)) {
      pk = stored as `0x${string}`;
    }
  } catch {
    // Ignore storage errors
  }
  if (!pk) {
    pk = generatePrivateKey();
    try {
      localStorage.setItem(EPHEMERAL_KEY_STORAGE, pk);
    } catch {
      // Ignore storage errors
    }
  }
  return privateKeyToAccount(pk);
}

function parseRelays(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("http://") || s.startsWith("https://"));
}

function normalizeAgentAddress(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  return ETH_ADDRESS_RE.test(trimmed) ? trimmed : DEFAULT_CLIPPY_AGENT_ADDRESS;
}

function currentEpoch(windowMinutes = SLIDING_WINDOW_MINUTES): number {
  return Math.floor(Date.now() / (windowMinutes * 60_000));
}

export class ClippyEngine {
  private options: ClippyEngineOptions;
  private listeners = new Set<(state: ClippyEngineState) => void>();
  private state: ClippyEngineState;

  private client: Client | null = null;
  private activeGroup: Group | null = null;
  private stopStream: (() => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private gun: any = null;
  private gunUnsubs: Array<() => void> = [];
  private timers: number[] = [];

  private presenceMap = new Map<string, ClippyPeer>();
  private inboxToAddress = new Map<string, string>();
  private seenMessageIds = new Set<string>();
  private knownGroupMembers = new Set<string>();
  private activeWindow: GroupWindowRecord | null = null;
  private creatingGroup = false;
  private destroyed = false;

  constructor(options: ClippyEngineOptions) {
    const agentAddress = normalizeAgentAddress(options.agentAddress);
    const roomUrl = normalizeUrl(options.roomUrl || DEFAULT_CLIPPY_ROOM_URL);
    this.options = { ...options, agentAddress, roomUrl };
    this.state = {
      status: "idle",
      statusDetail: "Sleeping",
      error: null,
      myAddress: null,
      myInboxId: null,
      agentAddress,
      roomUrl,
      groupId: null,
      isLeader: false,
      relayConnected: false,
      onlineUsers: [
        {
          inboxId: `bridge:${agentAddress}`,
          address: agentAddress,
          lastSeen: Date.now(),
          isOnline: true,
          isAgent: true,
        },
      ],
      messages: [],
    };
  }

  getState(): ClippyEngineState {
    return this.state;
  }

  subscribe(listener: (state: ClippyEngineState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(patch: Partial<ClippyEngineState>): void {
    if (this.destroyed) return;
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) {
      fn(this.state);
    }
  }

  async start(): Promise<void> {
    if (this.destroyed) return;
    if (this.state.status === "initializing" || this.state.status === "ready") return;

    this.setState({
      status: "initializing",
      statusDetail: "Initializing XMTP identity…",
      error: null,
    });

    try {
      const [{ Client, IdentifierKind }, gunMod] = await Promise.all([
        import("@xmtp/browser-sdk"),
        import("gun"),
      ]);
      if (this.destroyed) return;

      const account = getOrCreateEphemeralAccount();
      const myAddress = account.address.toLowerCase();

      const signer: Signer = {
        type: "EOA",
        getIdentifier: () => ({
          identifier: myAddress,
          identifierKind: IdentifierKind.Ethereum,
        }),
        signMessage: async (message: string) => {
          const sig = await account.signMessage({ message });
          return toBytes(sig);
        },
      };

      const clientOptions: NetworkOptions &
        DeviceSyncOptions &
        StorageOptions &
        OtherOptions = { env: this.options.xmtpEnv };
      const client = await Client.create(signer, clientOptions);
      if (this.destroyed) return;

      this.client = client;
      const myInboxId = client.inboxId;
      if (!myInboxId) {
        throw new Error("XMTP client initialized without an inboxId.");
      }
      this.inboxToAddress.set(myInboxId, myAddress);

      this.setState({
        status: "connecting_room",
        statusDetail: "Joining multi-user XMTP room…",
        myAddress,
        myInboxId,
      });

      const roomKey = await hashUrl(this.options.roomUrl);
      const relays = parseRelays(this.options.gunRelays);

      // Start GunDB presence & group coordination (wire-compatible with web3-shoutbox)
      const Gun = gunMod.default ?? gunMod;
      this.gun = Gun({ peers: relays, localStorage: false, radisk: false });

      const selfPeer: ClippyPeer = {
        inboxId: myInboxId,
        address: myAddress,
        lastSeen: Date.now(),
        isOnline: true,
        isSelf: true,
      };
      this.presenceMap.set(myInboxId, selfPeer);
      this.refreshOnlineUsers();

      this.startGunPresence(roomKey, myInboxId, myAddress);
      this.subscribeGunGroup(roomKey);

      // Wait briefly for GunDB relay to sync any existing group or peers;
      // if no group exists after 3s (either we're elected leader or relay is offline),
      // bootstrap or reuse our room group with the standing agent address.
      const bootTimer = window.setTimeout(() => {
        if (!this.destroyed && !this.activeGroup) {
          void this.ensureGroupAsLeaderOrFallback(roomKey);
        }
      }, 3000);
      this.timers.push(bootTimer);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.setState({
        status: "error",
        statusDetail: "Connection failed",
        error: msg,
      });
    }
  }

  private startGunPresence(roomKey: string, myInboxId: string, myAddress: string): void {
    if (!this.gun) return;
    const roomPresenceRef = this.gun.get(GUN_NAMESPACE).get("presence").get(roomKey);
    const selfRef = roomPresenceRef.get(myInboxId);

    const publishHeartbeat = () => {
      if (this.destroyed) return;
      const payload: GunPresenceRecord = {
        inboxId: myInboxId,
        address: myAddress,
        ts: Date.now(),
        status: "online",
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      selfRef.put(payload, (ack: any) => {
        if (!this.destroyed && ack && !ack.err) {
          if (!this.state.relayConnected) {
            this.setState({ relayConnected: true });
          }
        }
      });
    };

    publishHeartbeat();
    const hbTimer = window.setInterval(publishHeartbeat, HEARTBEAT_INTERVAL_MS);
    this.timers.push(hbTimer);

    const pruneTimer = window.setInterval(() => {
      if (this.destroyed) return;
      const now = Date.now();
      let changed = false;
      for (const [id, peer] of this.presenceMap.entries()) {
        if (id === myInboxId) continue;
        const alive = now - peer.lastSeen < PRESENCE_STALE_MS;
        if (peer.isOnline !== alive) {
          peer.isOnline = alive;
          changed = true;
        }
      }
      if (changed) this.refreshOnlineUsers();
    }, 5000);
    this.timers.push(pruneTimer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = roomPresenceRef.map().on((data: any, key: string) => {
      if (this.destroyed || !data || !key || !data.address) return;
      const ts = typeof data.ts === "number" ? data.ts : 0;
      const isOnline = data.status === "online" && Date.now() - ts < PRESENCE_STALE_MS;
      const addr = String(data.address).toLowerCase();
      this.inboxToAddress.set(key, addr);
      this.presenceMap.set(key, {
        inboxId: key,
        address: addr,
        lastSeen: ts,
        isOnline,
        isSelf: key === myInboxId,
      });
      this.refreshOnlineUsers();

      // If we are leader with an active group, add newly arrived online peers
      if (isOnline && this.activeGroup && this.state.isLeader && !this.knownGroupMembers.has(addr)) {
        void this.addPeersToActiveGroup([addr]);
      }
    });

    this.gunUnsubs.push(() => {
      try {
        selfRef.put({ ts: 0, status: "offline" });
        handler?.off?.();
      } catch {
        // Best-effort cleanup
      }
    });
  }

  private subscribeGunGroup(roomKey: string): void {
    if (!this.gun) return;
    const ref = this.gun.get(GUN_NAMESPACE).get("groups").get(roomKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ref.on((data: any) => {
      if (this.destroyed || !data || !data.groupId) return;
      const record: GroupWindowRecord = {
        groupId: String(data.groupId),
        epoch: Number(data.epoch ?? currentEpoch()),
        createdBy: String(data.createdBy ?? ""),
        createdAt: Number(data.createdAt ?? Date.now()),
        expiresAt: Number(data.expiresAt ?? Date.now() + SLIDING_WINDOW_MINUTES * 60_000),
        windowMinutes: Number(data.windowMinutes ?? SLIDING_WINDOW_MINUTES),
      };
      if (record.expiresAt <= Date.now()) return;
      this.activeWindow = record;

      if (!this.activeGroup || this.activeGroup.id !== record.groupId) {
        void this.joinExistingGroup(record.groupId, roomKey);
      }
    });

    this.gunUnsubs.push(() => {
      try {
        ref.off();
      } catch {
        // Best-effort cleanup
      }
    });
  }

  private computeLeader(): string | null {
    const onlineHumans = Array.from(this.presenceMap.values()).filter((p) => p.isOnline);
    if (onlineHumans.length === 0) return this.state.myInboxId;
    if (this.activeWindow?.createdBy) {
      const creatorOnline = onlineHumans.find((p) => p.inboxId === this.activeWindow?.createdBy);
      if (creatorOnline) return creatorOnline.inboxId;
    }
    let lowest = onlineHumans[0].inboxId;
    for (let i = 1; i < onlineHumans.length; i++) {
      if (onlineHumans[i].inboxId < lowest) lowest = onlineHumans[i].inboxId;
    }
    return lowest;
  }

  private refreshOnlineUsers(): void {
    const agentAddr = this.options.agentAddress;
    const humans = Array.from(this.presenceMap.values()).filter((p) => p.isOnline);
    const hasAgent = humans.some((p) => p.address.toLowerCase() === agentAddr);
    const list: ClippyPeer[] = hasAgent
      ? humans
      : [
          {
            inboxId: `bridge:${agentAddr}`,
            address: agentAddr,
            lastSeen: Date.now(),
            isOnline: true,
            isAgent: true,
          },
          ...humans,
        ];
    const leaderId = this.computeLeader();
    this.setState({
      onlineUsers: list,
      isLeader: leaderId !== null && leaderId === this.state.myInboxId,
    });
  }

  private async joinExistingGroup(groupId: string, roomKey: string): Promise<void> {
    if (!this.client || this.destroyed) return;
    try {
      this.setState({ statusDetail: "Syncing XMTP group…" });
      await this.client.conversations.sync();
      const conv = await this.client.conversations.getConversationById(groupId);
      if (conv && "sendText" in conv) {
        await this.attachGroup(conv as Group);
        return;
      }
      // If we aren't in the group yet, wait briefly for leader to add us;
      // if still not in after 4s and we're leader or relay is isolated, create one.
      const retryTimer = window.setTimeout(async () => {
        if (this.destroyed || this.activeGroup) return;
        try {
          await this.client?.conversations.sync();
          const retryConv = await this.client?.conversations.getConversationById(groupId);
          if (retryConv && "sendText" in retryConv) {
            await this.attachGroup(retryConv as Group);
          } else if (this.computeLeader() === this.state.myInboxId || !this.state.relayConnected) {
            await this.ensureGroupAsLeaderOrFallback(roomKey);
          }
        } catch {
          // Ignore retry error
        }
      }, 4000);
      this.timers.push(retryTimer);
    } catch (error) {
      console.warn("[clippy] failed to join existing group:", error);
    }
  }

  private async ensureGroupAsLeaderOrFallback(roomKey: string): Promise<void> {
    if (!this.client || this.destroyed || this.activeGroup || this.creatingGroup) return;
    this.creatingGroup = true;
    try {
      const { IdentifierKind } = await import("@xmtp/browser-sdk");
      const groupName = normalizeUrl(this.options.roomUrl);

      // First check if we already belong to an active group for this room
      await this.client.conversations.sync();
      const existingGroups = await this.client.conversations.listGroups();
      const matching = existingGroups.find((g) => g.name === groupName);
      if (matching && !this.state.relayConnected) {
        await this.attachGroup(matching);
        return;
      }

      // Collect online peers + standing agent address
      const candidateSet = new Set<string>([this.options.agentAddress]);
      for (const peer of this.presenceMap.values()) {
        if (peer.isOnline && peer.address && peer.address !== this.state.myAddress) {
          candidateSet.add(peer.address.toLowerCase());
        }
      }
      const candidates = Array.from(candidateSet);

      // Filter to reachable XMTP inboxes so one bad peer doesn't break group creation
      let reachable = candidates;
      try {
        const canMap = await this.client.canMessage(
          candidates.map((identifier) => ({
            identifier,
            identifierKind: IdentifierKind.Ethereum,
          })),
        );
        const filtered = candidates.filter((addr) => canMap.get(addr) === true);
        if (filtered.length > 0) reachable = filtered;
      } catch {
        // Fail open on transient reachability error
      }

      this.setState({ statusDetail: "Creating XMTP room with agent…" });
      const group = await this.client.conversations.createGroupWithIdentifiers(
        reachable.map((identifier) => ({
          identifier,
          identifierKind: IdentifierKind.Ethereum,
        })),
        { groupName },
      );

      for (const addr of reachable) this.knownGroupMembers.add(addr);

      // Publish group window to GunDB so other desktop users join the same group
      if (this.gun && this.state.myInboxId) {
        const now = Date.now();
        const record: GroupWindowRecord = {
          groupId: group.id,
          epoch: currentEpoch(),
          createdBy: this.state.myInboxId,
          createdAt: now,
          expiresAt: now + SLIDING_WINDOW_MINUTES * 60_000,
          windowMinutes: SLIDING_WINDOW_MINUTES,
        };
        this.activeWindow = record;
        this.gun.get(GUN_NAMESPACE).get("groups").get(roomKey).put(record);
      }

      await this.attachGroup(group);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.setState({
        status: "error",
        statusDetail: "Could not join XMTP room",
        error: msg,
      });
    } finally {
      this.creatingGroup = false;
    }
  }

  private async addPeersToActiveGroup(addresses: string[]): Promise<void> {
    if (!this.activeGroup || addresses.length === 0) return;
    try {
      const { IdentifierKind } = await import("@xmtp/browser-sdk");
      await this.activeGroup.addMembersByIdentifiers(
        addresses.map((identifier) => ({
          identifier: identifier.toLowerCase(),
          identifierKind: IdentifierKind.Ethereum,
        })),
      );
      for (const a of addresses) this.knownGroupMembers.add(a.toLowerCase());
    } catch {
      // Ignore already-added or transient errors
    }
  }

  private async attachGroup(group: Group): Promise<void> {
    if (this.destroyed) return;
    if (this.stopStream) {
      this.stopStream();
      this.stopStream = null;
    }

    this.activeGroup = group;
    await group.sync();

    // Populate inboxId -> Ethereum address mapping from group members
    try {
      const members = await group.members();
      for (const m of members) {
        const eth = m.accountIdentifiers?.[0]?.identifier?.toLowerCase();
        if (eth) {
          this.inboxToAddress.set(m.inboxId, eth);
          this.knownGroupMembers.add(eth);
        }
      }
    } catch {
      // Best-effort member resolution
    }

    // Load recent history
    const history = await group.messages();
    const initialMessages: ClippyMessage[] = [];
    for (const raw of history) {
      if (typeof raw.content !== "string") continue;
      if (this.seenMessageIds.has(raw.id)) continue;
      this.seenMessageIds.add(raw.id);
      initialMessages.push(this.toClippyMessage(raw, group.id));
    }
    initialMessages.sort((a, b) => a.timestamp - b.timestamp);

    this.setState({
      status: "ready",
      statusDetail: "Connected to XMTP",
      error: null,
      groupId: group.id,
      messages: initialMessages,
    });
    this.refreshOnlineUsers();

    // Stream new messages
    let ended = false;
    let endFn: (() => void) | null = null;
    this.stopStream = () => {
      ended = true;
      endFn?.();
    };

    void (async () => {
      try {
        const stream = await group.stream({
          disableSync: true,
          onError: (err) => {
            console.warn("[clippy] XMTP stream error:", err.message);
          },
        });
        endFn = () => {
          void stream.return();
        };
        if (ended) {
          void stream.return();
          return;
        }
        for await (const msg of stream) {
          if (ended || this.destroyed) break;
          if (!msg || typeof msg.content !== "string") continue;
          if (this.seenMessageIds.has(msg.id)) continue;
          this.seenMessageIds.add(msg.id);

          // Resolve unknown sender inbox if needed
          if (!this.inboxToAddress.has(msg.senderInboxId)) {
            try {
              const members = await group.members();
              for (const m of members) {
                const eth = m.accountIdentifiers?.[0]?.identifier?.toLowerCase();
                if (eth) this.inboxToAddress.set(m.inboxId, eth);
              }
            } catch {
              // Ignore
            }
          }

          const mapped = this.toClippyMessage(msg, group.id);
          this.setState({
            messages: [...this.state.messages, mapped],
          });
        }
      } catch (err) {
        if (!ended && !this.destroyed) {
          console.warn("[clippy] stream closed:", err);
        }
      }
    })();
  }

  private toClippyMessage(
    raw: { id: string; senderInboxId: string; content: unknown; sentAt: Date },
    groupId: string,
  ): ClippyMessage {
    const resolvedAddr = (this.inboxToAddress.get(raw.senderInboxId) ?? "").toLowerCase();
    let role: "agent" | "self" | "user" = "user";
    if (raw.senderInboxId === this.state.myInboxId) {
      role = "self";
    } else if (resolvedAddr && resolvedAddr === this.options.agentAddress) {
      role = "agent";
    }
    return {
      id: raw.id,
      senderInboxId: raw.senderInboxId,
      senderAddress: resolvedAddr,
      role,
      content: typeof raw.content === "string" ? raw.content : String(raw.content ?? ""),
      timestamp: raw.sentAt.getTime(),
      groupId,
    };
  }

  async sendMessage(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || !this.activeGroup) return;
    await this.activeGroup.sendText(trimmed);
  }

  destroy(): void {
    this.destroyed = true;
    for (const t of this.timers) window.clearInterval(t);
    this.timers = [];
    this.stopStream?.();
    this.stopStream = null;
    for (const unsub of this.gunUnsubs) unsub();
    this.gunUnsubs = [];
    this.listeners.clear();
  }
}
