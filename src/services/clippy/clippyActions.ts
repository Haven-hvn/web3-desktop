import { APP_CATALOG, type AppId } from "../../config/apps";

export interface ClippyOsAction {
  kind: "open_app";
  appId: AppId;
  label: string;
  glyph: string;
  explicit: boolean;
}

const VALID_APP_IDS = new Set<string>(Object.keys(APP_CATALOG));

const APP_MENTION_PATTERNS: Array<{ appId: AppId; pattern: RegExp }> = [
  { appId: "haven-media", pattern: /\bhaven\s+tunes\b|\bhaven[- ]media\b/i },
  { appId: "haven-bay", pattern: /\bhaven\s+bay\b|\bpirate\s+bay\b/i },
  { appId: "fairhaven", pattern: /\bfairhaven\b/i },
  { appId: "redhaven", pattern: /\bredhaven\b/i },
  { appId: "feetonfire", pattern: /\bfeetonfire\b|\bfeet\s+on\s+fire\b/i },
  { appId: "explorer", pattern: /\bgate\s+explorer\b/i },
  { appId: "planet", pattern: /\bapps\s+over\s+data\b/i },
  { appId: "atlas", pattern: /\bhaven\s+atlas\b/i },
  { appId: "wallet", pattern: /\bwallet\s*&\s*keys\b|\bvetkd\s+keyring\b/i },
  { appId: "settings", pattern: /\bcontrol\s+panel\b|\bsystem\s+settings\b/i },
  { appId: "microstore", pattern: /\bmicrostore\b/i },
];

function isValidAppId(id: string): id is AppId {
  return VALID_APP_IDS.has(id);
}

/**
 * Extracts safe, allowlisted Haven OS actions from a trusted agent message.
 * Never call this on messages from unverified/non-agent senders.
 */
export function parseAgentActions(content: string): {
  cleanText: string;
  actions: ClippyOsAction[];
} {
  const actions: ClippyOsAction[] = [];
  const seen = new Set<AppId>();

  const pushAction = (appId: AppId, explicit: boolean) => {
    if (seen.has(appId)) return;
    const app = APP_CATALOG[appId];
    if (!app) return;
    seen.add(appId);
    actions.push({
      kind: "open_app",
      appId,
      label: `Open ${app.name}`,
      glyph: app.glyph,
      explicit,
    });
  };

  let cleanText = content;

  // 1. Explicit tag: [action:open_app:haven-bay]
  cleanText = cleanText.replace(
    /\[action:open_app:([a-z0-9-]+)\]/gi,
    (match, rawId: string) => {
      const id = rawId.toLowerCase();
      if (isValidAppId(id)) {
        pushAction(id, true);
        return "";
      }
      return match;
    },
  );

  // 2. URI scheme: haven-action://open/haven-media
  cleanText = cleanText.replace(
    /haven-action:\/\/open\/([a-z0-9-]+)/gi,
    (match, rawId: string) => {
      const id = rawId.toLowerCase();
      if (isValidAppId(id)) {
        pushAction(id, true);
        return "";
      }
      return match;
    },
  );

  // 3. JSON fenced block: ```json { "action": "open_app", "appId": "haven-bay" } ```
  const jsonBlockRe = /```(?:json)?\s*(\{[\s\S]*?"action"\s*:\s*"open_app"[\s\S]*?\})\s*```/gi;
  cleanText = cleanText.replace(jsonBlockRe, (match, jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr) as { action?: string; appId?: string };
      if (parsed.action === "open_app" && typeof parsed.appId === "string") {
        const id = parsed.appId.toLowerCase();
        if (isValidAppId(id)) {
          pushAction(id, true);
          return "";
        }
      }
    } catch {
      // Leave malformed block untouched
    }
    return match;
  });

  // 4. Contextual app mentions from the agent (offered as safe click-to-open buttons)
  for (const { appId, pattern } of APP_MENTION_PATTERNS) {
    if (pattern.test(cleanText)) {
      pushAction(appId, false);
    }
  }

  return {
    cleanText: cleanText.trim(),
    actions,
  };
}
