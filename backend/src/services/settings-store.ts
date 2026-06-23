// ============================================================
// Settings Store — sub2api 等配置持久化（JSON 文件）
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, "../../data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

export interface Sub2ApiSettings {
  groupId: number;
  groupName: string;
  platform: string;
  baseUrl: string;
  defaultConcurrency: number;
  defaultPriority: number;
  sshHost: string;
  sshPort: string;
  sshUser: string;
  sshKey: string;
  dockerContainer: string;
  dbUser: string;
  dbName: string;
}

export interface AppSettings {
  sub2api: Sub2ApiSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  sub2api: {
    groupId: 0,
    groupName: "",
    platform: "",
    baseUrl: "",
    defaultConcurrency: 1,
    defaultPriority: 0,
    sshHost: "",
    sshPort: "",
    sshUser: "",
    sshKey: "",
    dockerContainer: "",
    dbUser: "",
    dbName: "",
  },
};

let cache: AppSettings | null = null;

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getSettings(): AppSettings {
  if (cache) return cache;
  ensureDir();
  let loaded: AppSettings;
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
      const parsed = JSON.parse(raw) as AppSettings;
      loaded = {
        sub2api: { ...DEFAULT_SETTINGS.sub2api, ...parsed.sub2api },
      };
    } catch {
      loaded = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
  } else {
    loaded = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
  cache = loaded;
  return cache;
}

export function saveSettings(updates: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const merged: AppSettings = {
    sub2api: {
      ...current.sub2api,
      ...(updates.sub2api || {}),
    },
  };
  ensureDir();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), "utf-8");
  cache = merged;
  return merged;
}

export function getSub2ApiSettings(): Sub2ApiSettings {
  return getSettings().sub2api;
}