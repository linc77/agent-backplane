# Electron Runtime Contract

## Scenario: Sandboxed TypeScript desktop boundary

### 1. Scope / Trigger

Read this spec before changing Electron lifecycle code, preload methods, IPC
channels, native services, credential storage, application protocol security,
or desktop packaging. React is an untrusted renderer and never receives Node,
Electron, filesystem, process, shell, or generic IPC primitives.

### 2. Signatures

```ts
interface AmmDesktopApi {
  app: { getVersion(): Promise<string>; checkForUpdates(): Promise<AppUpdateInfo | null>; openReleasePage(): Promise<void> };
  memory: { scan(rootOverride?: string | null): Promise<ScanResult>; /* named methods only */ };
  audit: { start(root: string | null, mode: CodexAuditMode): Promise<CodexAuditTask>; /* ... */ };
  skills: { load(projectRootOverride?: string | null): Promise<SkillInventory> };
  agentConfig: { load(): Promise<AgentConfigInventory>; /* save/delete/activate */ };
  mcp: { load(agent: AgentKind): Promise<McpInventory> };
  shell: { revealSource(path: string): Promise<void> };
}

contextBridge.exposeInMainWorld("amm", api);
```

Every main handler has the form:

```ts
handle(channel, zodSchema, window, developmentOrigin, serviceMethod);
```

### 3. Contracts

- `BrowserWindow`: `nodeIntegration=false`, `contextIsolation=true`,
  `sandbox=true`, minimum size 980x640.
- Packaged renderer: `app://renderer/index.html`; the protocol serves only
  files below the packaged renderer directory.
- IPC: sender must be the main frame of the current window and have the exact
  trusted application origin. Inputs are validated before service calls.
- Preload: fixed methods mapped to fixed channels; never expose `ipcRenderer`,
  a channel string argument, callbacks, or event emitters.
- Native payload ownership stays in `src/lib/types.ts`.
- Secrets: main process only. `safeStorage` ciphertext is stored in
  `~/.agent-memory-manager/agent-config-secrets.json` mode 0600. Encryption
  unavailability rejects saves; there is no plaintext fallback.
- Packaged schemas are copied to `Resources/schemas` and resolved through
  `process.resourcesPath`.
- Release artifacts: macOS ARM64 DMG/ZIP and Windows x64 NSIS from
  `electron-builder`.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Sender is not the current main frame | Reject with `Untrusted IPC sender` |
| Input has unknown/missing/invalid fields | Zod rejection before side effects |
| Renderer attempts navigation/window creation | Deny |
| Permission is requested | Deny |
| Application protocol path escapes renderer root | Return 404 |
| `safeStorage` unavailable | Reject credential save; never write plaintext |
| Packaged output lacks schemas | Profile/Audit returns an explicit schema error or safe profile fallback |

### 5. Good / Base / Bad Cases

- Good: React calls `window.amm.mcp.load("codex")`; main validates the Agent,
  redacts native data, and returns a typed inventory.
- Base: fixture mode executes its in-memory branch without reading
  `window.amm`.
- Bad: expose `window.electron.invoke(channel, input)` or enable Node in React.
- Bad: let renderer code read Agent config files or decrypt provider keys.

### 6. Tests Required

- Window policy asserts sandbox, context isolation, disabled Node integration,
  and trusted-origin matching.
- Native service tests cover parsing, path containment, redaction, write
  exclusivity, backups, config preservation, and secret omission.
- Renderer adapter tests assert exact named preload calls; fixture tests assert
  no desktop IPC.
- `pnpm verify` passes with no Rust toolchain.
- `pnpm build:desktop:debug` packages and launches; live AX state reports
  `app://renderer/index.html`.

### 7. Wrong vs Correct

#### Wrong

```ts
contextBridge.exposeInMainWorld("electron", { invoke: ipcRenderer.invoke });
```

#### Correct

```ts
contextBridge.exposeInMainWorld("amm", {
  mcp: { load: (agent) => ipcRenderer.invoke(channels.loadMcpInventory, { agent }) },
});
```

The correct form makes renderer authority auditable and keeps validation tied
to one known operation.
