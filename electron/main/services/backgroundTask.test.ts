import { describe, expect, it, vi } from "vitest";
import { BackgroundTaskManager } from "./backgroundTask";

interface Task {
  id: string | null;
  status: string;
  finishedAt: string | null;
  error: string | null;
  value: string | null;
}

const idle = (): Task => ({ id: null, status: "idle", finishedAt: null, error: null, value: null });
const running = (id: string): Task => ({ ...idle(), id, status: "running" });

describe("background task state", () => {
  it("keeps one running task and marks cancellation after abort", async () => {
    const manager = new BackgroundTaskManager<Task, string>(idle());
    const run = vi.fn((signal: AbortSignal) => new Promise<string>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("cancelled")));
    }));
    expect(manager.start(running("one"), run, (task, value) => ({ ...task, value })).id).toBe("one");
    expect(manager.start(running("two"), run, (task, value) => ({ ...task, value })).id).toBe("one");
    expect(run).toHaveBeenCalledOnce();
    expect(manager.cancel().status).toBe("cancelling");
    await vi.waitFor(() => expect(manager.get().status).toBe("cancelled"));
  });

  it("allows retry after failure and stores only the current result", async () => {
    const manager = new BackgroundTaskManager<Task, string>(idle());
    manager.start(running("one"), async () => { throw new Error("boom"); }, (task, value) => ({ ...task, value }));
    await vi.waitFor(() => expect(manager.get().status).toBe("failed"));
    manager.start(running("two"), async () => "done", (task, value) => ({ ...task, value }));
    await vi.waitFor(() => expect(manager.get()).toMatchObject({ id: "two", status: "succeeded", value: "done" }));
  });
});
