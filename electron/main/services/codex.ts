import { spawn } from "node:child_process";

export interface CodexExecInput {
  cwd: string;
  prompt: string;
  schemaPath: string;
  stdin?: string;
  signal?: AbortSignal;
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
    "--output-schema",
    input.schemaPath,
    input.prompt,
  ];
  return new Promise<string>((resolve, reject) => {
    const child = spawn("codex", args, {
      cwd: input.cwd,
      env: process.env,
      shell: false,
      signal: input.signal,
      stdio: [input.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      timeout: 5 * 60 * 1000,
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
