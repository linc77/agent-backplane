import { isoNow } from "./shared";

type ActiveStatus = "running" | "cancelling";

export interface BackgroundTaskBase {
  id: string | null;
  status: string;
  finishedAt: string | null;
  error: string | null;
}
export class BackgroundTaskManager<Task extends BackgroundTaskBase, Result> {
  private controller: AbortController | null = null;

  constructor(private task: Task) {}

  get() {
    return structuredClone(this.task);
  }

  start(
    task: Task,
    run: (signal: AbortSignal) => Promise<Result>,
    succeed: (task: Task, result: Result) => Task,
  ) {
    if (this.isActive()) return this.get();
    const id = task.id;
    const controller = new AbortController();
    this.controller = controller;
    this.task = task;
    void run(controller.signal).then((result) => {
      if (this.task.id !== id) return;
      this.task = succeed({ ...this.task, status: "succeeded", finishedAt: isoNow(), error: null }, result);
      this.controller = null;
    }).catch((error) => {
      if (this.task.id !== id) return;
      const cancelled = controller.signal.aborted || (error instanceof Error && error.message.includes("cancelled"));
      this.task = {
        ...this.task,
        status: cancelled ? "cancelled" : "failed",
        finishedAt: isoNow(),
        error: cancelled ? null : error instanceof Error ? error.message : String(error),
      };
      this.controller = null;
    });
    return this.get();
  }

  cancel() {
    if (this.isActive()) {
      this.task = { ...this.task, status: "cancelling" };
      this.controller?.abort();
    }
    return this.get();
  }

  private isActive() {
    return (["running", "cancelling"] satisfies ActiveStatus[]).includes(this.task.status as ActiveStatus);
  }
}
