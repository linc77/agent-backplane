import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export interface CodexExecInput {
  cwd: string;
  prompt: string;
  schemaPath: string;
  stdin?: string;
  signal?: AbortSignal;
  ignoreUserConfig?: boolean;
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
}

interface CodexLaunch {
  command: string;
  env: NodeJS.ProcessEnv;
  shell: boolean;
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function isFile(path: string) {
  return stat(path).then((value) => value.isFile()).catch(() => false);
}

export async function resolveCodexLaunch(
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
  arch = process.arch,
  home = homedir(),
): Promise<CodexLaunch> {
  const environmentPath = env.PATH ?? env.Path ?? "";
  const directories = unique([
    ...environmentPath.split(delimiter).filter(Boolean),
    platform === "darwin" ? "/opt/homebrew/bin" : undefined,
    platform !== "win32" ? "/usr/local/bin" : undefined,
    join(home, ".local", "bin"),
    join(home, ".cargo", "bin"),
    platform === "win32" ? join(env.APPDATA ?? join(home, "AppData", "Roaming"), "npm") : undefined,
    platform === "win32" ? join(home, "scoop", "shims") : undefined,
    platform === "win32" && env.LOCALAPPDATA
      ? join(env.LOCALAPPDATA, "Microsoft", "WinGet", "Links")
      : undefined,
  ]);
  const launchEnv = { ...env, PATH: directories.join(delimiter) };
  const override = env.CODEX_CLI_PATH?.trim();
  const directCandidates = unique([
    override,
    ...directories.map((directory) => join(directory, platform === "win32" ? "codex.exe" : "codex")),
  ]);

  if (platform === "win32") {
    const npmRoot = join(
      env.APPDATA ?? join(home, "AppData", "Roaming"),
      "npm",
      "node_modules",
      "@openai",
      "codex",
    );
    const platformPackage = arch === "arm64" ? "codex-win32-arm64" : "codex-win32-x64";
    const rustTarget = arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
    directCandidates.push(
      join(npmRoot, "node_modules", "@openai", platformPackage, "vendor", rustTarget, "codex", "codex.exe"),
      join(npmRoot, "vendor", rustTarget, "codex", "codex.exe"),
    );
  }

  for (const command of directCandidates) {
    if (await isFile(command)) {
      return { command, env: launchEnv, shell: /\.(?:cmd|bat)$/i.test(command) };
    }
  }
  if (platform === "win32") {
    for (const directory of directories) {
      for (const name of ["codex.cmd", "codex.bat"]) {
        const command = join(directory, name);
        if (await isFile(command)) return { command, env: launchEnv, shell: true };
      }
    }
  }
  throw new Error("Codex CLI was not found. Install Codex and sign in before generating a profile.");
}

export async function runCodexExec(input: CodexExecInput) {
  const args = [
    "exec",
    "--cd",
    input.cwd,
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--ephemeral",
    ...(input.ignoreUserConfig ? ["--ignore-user-config"] : []),
    ...(input.model ? ["--model", input.model] : []),
    ...(input.reasoningEffort
      ? ["--config", `model_reasoning_effort=${JSON.stringify(input.reasoningEffort)}`]
      : []),
    "--output-schema",
    input.schemaPath,
    input.prompt,
  ];
  const launch = await resolveCodexLaunch();
  return new Promise<string>((resolve, reject) => {
    const child = spawn(launch.command, args, {
      cwd: input.cwd,
      env: launch.env,
      shell: launch.shell,
      signal: input.signal,
      stdio: [input.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      timeout: 5 * 60 * 1000,
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout!.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr!.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => reject(
      error.name === "AbortError" ? new Error("codex exec cancelled") : error,
    ));
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8").trim());
      } else if (!input.signal?.aborted) {
        reject(new Error(`codex exec failed with status ${code ?? -1}: ${Buffer.concat(stderr).toString("utf8").trim()}`));
      }
    });
    if (input.stdin !== undefined) {
      child.stdin!.end(input.stdin);
    }
  });
}
