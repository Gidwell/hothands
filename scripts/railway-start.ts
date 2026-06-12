const processName = Bun.env.HOT_HANDS_RAILWAY_PROCESS?.trim().toLowerCase();

const commands: Record<string, string[]> = {
  api: ["bun", "run", "--cwd", "apps/api-worker", "dev:testnet"],
  indexer: ["bun", "run", "indexer:live"],
};

if (!processName || !commands[processName]) {
  console.error(
    "Set HOT_HANDS_RAILWAY_PROCESS to either 'api' or 'indexer' before starting Railway.",
  );
  process.exit(1);
}

const child = Bun.spawn(commands[processName], {
  env: Bun.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

process.exit(await child.exited);
