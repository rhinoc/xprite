import { afterEach, describe, expect, it, vi } from "vitest";

import {
  classifyWorkerFailure,
  importWithRetry,
  isManagedWorkerError,
  ManagedSerialWorker,
  ManagedWorkerClient,
  runManagedWorkerJob,
  WorkerFailureKind,
  WorkerFailureStage,
  type ManagedWorkerTransport,
} from "$/managed-worker";

class EventWorker
  extends EventTarget
  implements ManagedWorkerTransport<{ id: number; payload?: string }>
{
  readonly posted: Array<{ id: number; payload?: string }> = [];
  terminated = false;
  constructor(
    private readonly onPost?: (
      worker: EventWorker,
      request: { id: number; payload?: string },
    ) => void,
  ) {
    super();
  }
  postMessage(request: { id: number; payload?: string }): void {
    this.posted.push(request);
    this.onPost?.(this, request);
  }
  terminate(): void {
    this.terminated = true;
  }
  send(data: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

class PropertyWorker implements ManagedWorkerTransport<string> {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessageerror: ((event: Event) => void) | null = null;
  readonly posted: string[] = [];
  terminated = false;
  constructor(private readonly onPost?: (worker: PropertyWorker, request: string) => void) {}
  postMessage(request: string): void {
    this.posted.push(request);
    this.onPost?.(this, request);
  }
  terminate(): void {
    this.terminated = true;
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("classifyWorkerFailure", () => {
  it("classifies startup, runtime, deserialization, timeout, and closed failures", () => {
    expect(
      classifyWorkerFailure({
        stage: WorkerFailureStage.Construction,
        workerAnswered: false,
        cause: new Error("blocked"),
      }).kind,
    ).toBe(WorkerFailureKind.Startup);

    expect(
      classifyWorkerFailure({
        stage: WorkerFailureStage.Error,
        workerAnswered: false,
        event: new Event("error"),
      }).kind,
    ).toBe(WorkerFailureKind.Startup);

    const namedEvent = Object.assign(new Event("error"), {
      message: "Uncaught ReferenceError: x",
      filename: "https://xprite.cc/assets/worker.js?token=abc#frag",
      lineno: 10,
      colno: 4,
    });
    const namedInfo = classifyWorkerFailure({
      stage: WorkerFailureStage.Error,
      workerAnswered: false,
      event: namedEvent,
    });
    expect(namedInfo.kind).toBe(WorkerFailureKind.Runtime);
    expect(namedInfo.filename).toBe("https://xprite.cc/assets/worker.js");
    expect(namedInfo.line).toBe(10);
    expect(namedInfo.column).toBe(4);

    expect(
      classifyWorkerFailure({
        stage: WorkerFailureStage.Error,
        workerAnswered: true,
        event: new Event("error"),
      }).kind,
    ).toBe(WorkerFailureKind.Runtime);

    expect(
      classifyWorkerFailure({
        stage: WorkerFailureStage.MessageError,
        workerAnswered: false,
        event: new Event("messageerror"),
      }).kind,
    ).toBe(WorkerFailureKind.Deserialization);

    expect(
      classifyWorkerFailure({
        stage: WorkerFailureStage.Timeout,
        workerAnswered: true,
      }).kind,
    ).toBe(WorkerFailureKind.Timeout);

    expect(
      classifyWorkerFailure({
        stage: WorkerFailureStage.Closed,
        workerAnswered: false,
      }).kind,
    ).toBe(WorkerFailureKind.Closed);
  });
});

describe("ManagedWorkerClient", () => {
  it("lazily starts, coalesces concurrent startup retries, and succeeds without calling exhausted hook", async () => {
    vi.useFakeTimers();
    const workers: EventWorker[] = [];
    const exhausted = vi.fn();
    const client = new ManagedWorkerClient<
      { id: number; payload?: string },
      { id: number; value: number }
    >({
      workerFactory: () => {
        const index = workers.length;
        const worker = new EventWorker((self, req) => {
          queueMicrotask(() => {
            if (index === 0) self.dispatchEvent(new Event("error"));
            else self.send({ id: req.id, value: req.id * 10 });
          });
        });
        workers.push(worker);
        return worker;
      },
      retryDelayMs: 1000,
      onStartupFailureExhausted: exhausted,
    });

    expect(workers).toHaveLength(0);
    const first = client.request({
      buildRequest: (id) => ({ request: { id, payload: "a" } }),
      readResponse: (r) => r.value,
    });
    const second = client.request({
      buildRequest: (id) => ({ request: { id, payload: "b" } }),
      readResponse: (r) => r.value,
    });
    expect(workers).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1000);
    const results = await Promise.all([first, second]);
    expect(workers).toHaveLength(2);
    expect(results).toHaveLength(2);
    expect(exhausted).not.toHaveBeenCalled();
    client.close();
  });

  it("calls onStartupFailureExhausted once and degrades to fallback when configured", async () => {
    vi.useFakeTimers();
    const exhausted = vi.fn((err: Error) => Object.assign(new Error("reload"), { cause: err }));
    const fatal = vi.fn();
    const factory = vi.fn(
      () =>
        new EventWorker((self) => {
          queueMicrotask(() => self.dispatchEvent(new Event("error")));
        }),
    );
    const client = new ManagedWorkerClient<{ id: number }, { id: number; value: string }>({
      workerFactory: factory,
      retryDelayMs: 500,
      fallbackOnUnavailable: true,
      onStartupFailureExhausted: exhausted,
      onFatalError: fatal,
    });

    const pending = client.request({
      buildRequest: (id) => ({ request: { id } }),
      readResponse: (r) => r.value,
      fallback: () => "fallback-value",
    });
    await vi.runAllTimersAsync();
    expect(await pending).toBe("fallback-value");
    expect(factory).toHaveBeenCalledTimes(2);
    expect(exhausted).toHaveBeenCalledOnce();
    expect(fatal).toHaveBeenCalledOnce();
    expect(client.isUsingFallback).toBe(true);

    // Subsequent calls go straight to fallback without creating a 3rd worker.
    const next = await client.request({
      buildRequest: (id) => ({ request: { id } }),
      readResponse: (r) => r.value,
      fallback: () => "second-fallback",
    });
    expect(next).toBe("second-fallback");
    expect(factory).toHaveBeenCalledTimes(2);
    client.close();
  });

  it("supports streaming intermediate responses that reset stall timeouts", async () => {
    vi.useFakeTimers();
    const worker = new EventWorker();
    const client = new ManagedWorkerClient<
      { id: number },
      { id: number; progress?: number; done?: boolean }
    >({
      worker,
    });
    const seen: number[] = [];
    const pending = client.request({
      buildRequest: (id) => ({ request: { id } }),
      onIntermediate: (msg) => {
        if (msg.progress !== undefined) {
          seen.push(msg.progress);
          return true;
        }
        return false;
      },
      readResponse: (msg) => Boolean(msg.done),
      timeoutMs: 100,
      terminateOnTimeout: true,
    });

    await vi.advanceTimersByTimeAsync(75);
    worker.send({ id: 1, progress: 0.5 });
    await vi.advanceTimersByTimeAsync(75);
    worker.send({ id: 1, progress: 0.9 });
    await vi.advanceTimersByTimeAsync(75);
    worker.send({ id: 1, done: true });

    expect(await pending).toBe(true);
    expect(seen).toEqual([0.5, 0.9]);
    expect(worker.terminated).toBe(false);
    client.close();
  });

  it("aborts individual requests waiting on a startup retry pause without cancelling the client", async () => {
    vi.useFakeTimers();
    let count = 0;
    const client = new ManagedWorkerClient<{ id: number }, { id: number; ok: boolean }>({
      workerFactory: () => {
        const index = count++;
        return new EventWorker((self, req) => {
          queueMicrotask(() => {
            if (index === 0) self.dispatchEvent(new Event("error"));
            else self.send({ id: req.id, ok: true });
          });
        });
      },
      retryDelayMs: 1000,
    });

    const controller = new AbortController();
    const aborted = client.request({
      buildRequest: (id) => ({ request: { id } }),
      readResponse: (r) => r.ok,
      signal: controller.signal,
    });
    const kept = client.request({
      buildRequest: (id) => ({ request: { id } }),
      readResponse: (r) => r.ok,
    });

    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await kept).toBe(true);
    client.close();
  });
});

describe("runManagedWorkerJob", () => {
  it("retries opaque startup failures on property-handler workers and falls back when exhausted", async () => {
    vi.useFakeTimers();
    const workers: PropertyWorker[] = [];
    const exhausted = vi.fn();
    const pending = runManagedWorkerJob<string, string, string>({
      workerFactory: () => {
        const worker = new PropertyWorker((self) => {
          queueMicrotask(() => self.onerror?.(new Event("error")));
        });
        workers.push(worker);
        return worker;
      },
      buildRequest: () => ({ request: "encode" }),
      readResponse: (r) => r,
      retryDelayMs: 250,
      onStartupFailureExhausted: exhausted,
      fallback: () => "in-process",
    });

    await vi.runAllTimersAsync();
    expect(await pending).toBe("in-process");
    expect(workers).toHaveLength(2);
    expect(workers.every((w) => w.terminated)).toBe(true);
    expect(exhausted).toHaveBeenCalledOnce();
  });

  it("does not retry non-opaque runtime errors", async () => {
    const factory = vi.fn(
      () =>
        new PropertyWorker((self) => {
          queueMicrotask(() =>
            self.onerror?.(
              Object.assign(new Event("error"), { message: "boom", filename: "w.js" }),
            ),
          );
        }),
    );
    await expect(
      runManagedWorkerJob<string, string, string>({
        workerFactory: factory,
        buildRequest: () => ({ request: "run" }),
        readResponse: (r) => r,
        retryDelayMs: 1,
      }),
    ).rejects.toSatisfy((err: unknown) => isManagedWorkerError(err, WorkerFailureKind.Runtime));
    expect(factory).toHaveBeenCalledOnce();
  });
});

describe("ManagedSerialWorker", () => {
  it("reuses one worker after answering and retries startup failures before exhaustion", async () => {
    vi.useFakeTimers();
    const workers: PropertyWorker[] = [];
    const serial = new ManagedSerialWorker<string>({
      workerFactory: () => {
        const index = workers.length;
        const worker = new PropertyWorker((self, req) => {
          queueMicrotask(() => {
            if (index === 0) self.onerror?.(new Event("error"));
            else self.onmessage?.({ data: `${req}!` } as MessageEvent);
          });
        });
        workers.push(worker);
        return worker;
      },
      retryDelayMs: 500,
    });

    serial.prepare();
    expect(workers).toHaveLength(1);
    const first = serial.run<string, string>({
      buildRequest: () => ({ request: "a" }),
      readResponse: (r) => r,
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(await first).toBe("a!");
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);

    const second = serial.run<string, string>({
      buildRequest: () => ({ request: "b" }),
      readResponse: (r) => r,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(await second).toBe("b!");
    expect(workers).toHaveLength(2);
    expect(workers[1].terminated).toBe(false);

    serial.dispose();
    expect(workers[1].terminated).toBe(true);
  });
});

describe("importWithRetry", () => {
  it("retries failed module imports up to configured attempts", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const pending = importWithRetry(
      async () => {
        if (calls++ === 0) throw new TypeError("Failed to fetch dynamically imported module");
        return 42;
      },
      { retryDelayMs: 100 },
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toBe(42);
    expect(calls).toBe(2);
  });
});
