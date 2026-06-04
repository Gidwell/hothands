import type { DevTestnetConfig } from "./dev-testnet-config";

export const DEV_PROCESS_STATE_FILE = ".hot-hands-dev-testnet.json";

export interface DevProcessRecord {
  command: string[];
  name: string;
  pid: number;
}

export interface DevProcessState {
  createdAt: string;
  cwd: string;
  processes: DevProcessRecord[];
  urls: {
    apiUrl: string;
    pwaUrl: string;
  };
  version: 1;
}

export function devProcessStatePath(repoRoot: string): string {
  return `${repoRoot.replace(/\/+$/, "")}/${DEV_PROCESS_STATE_FILE}`;
}

export function buildDevProcessState({
  config,
  processes,
  repoRoot,
}: {
  config: DevTestnetConfig;
  processes: readonly DevProcessRecord[];
  repoRoot: string;
}): DevProcessState {
  return {
    createdAt: new Date().toISOString(),
    cwd: repoRoot,
    processes: [...processes],
    urls: {
      apiUrl: config.apiUrl,
      pwaUrl: config.pwaUrl,
    },
    version: 1,
  };
}

export function parseDevProcessState(text: string): DevProcessState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.processes)) {
    return null;
  }

  const processes = parsed.processes.flatMap((processRecord): DevProcessRecord[] => {
    if (!isRecord(processRecord)) {
      return [];
    }

    const { command, name } = processRecord;
    const pid = processRecord.pid;
    if (
      !Array.isArray(command) ||
      !command.every((part) => typeof part === "string") ||
      typeof name !== "string" ||
      typeof pid !== "number" ||
      !Number.isInteger(pid) ||
      pid <= 0
    ) {
      return [];
    }

    return [{ command, name, pid }];
  });

  return {
    createdAt:
      typeof parsed.createdAt === "string"
        ? parsed.createdAt
        : new Date(0).toISOString(),
    cwd: typeof parsed.cwd === "string" ? parsed.cwd : "",
    processes,
    urls: parseStateUrls(parsed.urls),
    version: 1,
  };
}

export function repoPathHasWhitespace(repoRoot: string): boolean {
  return /\s/.test(repoRoot);
}

export function formatRepoPathWarning(repoRoot: string): string | null {
  if (!repoPathHasWhitespace(repoRoot)) {
    return null;
  }

  return [
    `Warning: repo path contains whitespace: ${repoRoot}`,
    "Vite/esbuild has hung in this workspace before. If the PWA never becomes reachable, run from a no-space git worktree.",
  ].join("\n");
}

function parseStateUrls(value: unknown): DevProcessState["urls"] {
  if (!isRecord(value)) {
    return { apiUrl: "", pwaUrl: "" };
  }

  return {
    apiUrl: typeof value.apiUrl === "string" ? value.apiUrl : "",
    pwaUrl: typeof value.pwaUrl === "string" ? value.pwaUrl : "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
