import { afterEach, describe, expect, it, vi } from "vitest";

import { runWorkerJob, SerialWorker } from "$/worker-job";

class JobWorker {
  onmessage: ((event: MessageEvent<number>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

function job(worker: JobWorker, signal?: AbortSignal) {
  return runWorkerJob<string, number, number>({
    worker: worker as unknown as Worker,
    request: "input",
    signal,
    timeoutMs: 100,
    timeoutError: () => new Error("timeout"),
    transportError: () => new Error("transport"),
    readResponse: (value) => value * 2,
  });
}

afterEach(() => vi.useRealTimers());

describe("dedicated worker jobs", () => {
  it("cleans up successful operations and ignores an already queued late response", async () => {
    const worker = new JobWorker();
    const pending = job(worker);
    const receive = worker.onmessage!;
    receive({ data: 3 } as MessageEvent<number>);
    receive({ data: 10 } as MessageEvent<number>);
    expect(await pending).toBe(6);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(worker.onmessage).toBeNull();
    expect(worker.onerror).toBeNull();
    expect(worker.onmessageerror).toBeNull();
  });

  it("does not post an already cancelled job and terminates a running cancelled job", async () => {
    const controller = new AbortController();
    controller.abort();
    const cancelled = new JobWorker();
    await expect(job(cancelled, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled.postMessage).not.toHaveBeenCalled();
    expect(cancelled.terminate).toHaveBeenCalledTimes(1);

    const running = new JobWorker();
    const active = new AbortController();
    const pending = job(running, active.signal);
    active.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(running.terminate).toHaveBeenCalledTimes(1);
  });

  it("times out and releases abort listeners before later cancellation", async () => {
    vi.useFakeTimers();
    const worker = new JobWorker();
    const controller = new AbortController();
    const pending = job(worker, controller.signal);
    const rejected = expect(pending).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    controller.abort();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("passes only explicit transferables and preserves semantic response errors", async () => {
    const worker = new JobWorker();
    const bytes = new Uint8Array([1]);
    const semanticError = new Error("invalid result");
    const pending = runWorkerJob<Uint8Array, number, number>({
      worker: worker as unknown as Worker,
      request: bytes,
      transfer: [bytes.buffer],
      timeoutMs: 100,
      timeoutError: () => new Error("timeout"),
      transportError: () => new Error("transport"),
      readResponse() {
        throw semanticError;
      },
    });
    expect(worker.postMessage).toHaveBeenCalledWith(bytes, [bytes.buffer]);
    worker.onmessage!({ data: 0 } as MessageEvent<number>);
    await expect(pending).rejects.toBe(semanticError);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("disposes post failures and unreadable messages without retrying", async () => {
    const failedPost = new JobWorker();
    failedPost.postMessage.mockImplementation(() => {
      throw new DOMException("Clone failed", "DataCloneError");
    });
    await expect(job(failedPost)).rejects.toThrow("transport");
    expect(failedPost.postMessage).toHaveBeenCalledTimes(1);
    expect(failedPost.terminate).toHaveBeenCalledTimes(1);

    const unreadable = new JobWorker();
    const pending = job(unreadable);
    unreadable.onmessageerror!();
    await expect(pending).rejects.toThrow("transport");
    expect(unreadable.terminate).toHaveBeenCalledTimes(1);
  });
});

describe("serial worker jobs", () => {
  function serial() {
    const created: JobWorker[] = [];
    const runner = new SerialWorker(() => {
      const worker = new JobWorker();
      created.push(worker);
      return worker as unknown as Worker;
    });
    const run = (signal?: AbortSignal, readResponse = (value: number) => value * 2) =>
      runner.run<string, number, number>({
        request: "input",
        signal,
        timeoutMs: 100,
        timeoutError: () => new Error("timeout"),
        transportError: () => new Error("transport"),
        readResponse,
      });
    return { runner, created, run };
  }

  it("keeps one worker, with its caches, across finished jobs", async () => {
    const { runner, created, run } = serial();
    runner.prepare();
    expect(created).toHaveLength(1);
    const first = run();
    created[0].onmessage!({ data: 1 } as MessageEvent<number>);
    expect(await first).toBe(2);
    const second = run();
    created[0].onmessage!({ data: 2 } as MessageEvent<number>);
    expect(await second).toBe(4);
    const failed = run(undefined, () => {
      throw new Error("reported");
    });
    created[0].onmessage!({ data: 3 } as MessageEvent<number>);
    await expect(failed).rejects.toThrow("reported");
    expect(created).toHaveLength(1);
    expect(created[0].terminate).not.toHaveBeenCalled();
    expect(created[0].onmessage).toBeNull();
    runner.dispose();
    expect(created[0].terminate).toHaveBeenCalledTimes(1);
  });

  it("replaces the worker after a cancelled, failed or timed out job", async () => {
    vi.useFakeTimers();
    const { created, run } = serial();
    const controller = new AbortController();
    const cancelled = run(controller.signal);
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    expect(created[0].terminate).toHaveBeenCalledTimes(1);

    const broken = run();
    expect(created).toHaveLength(2);
    created[1].onerror!({ preventDefault() {} } as ErrorEvent);
    await expect(broken).rejects.toThrow("transport");
    expect(created[1].terminate).toHaveBeenCalledTimes(1);

    const slow = run();
    const rejected = expect(slow).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(created[2].terminate).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(3);
  });

  it("cancels a running job when the next one starts", async () => {
    const { created, run } = serial();
    const first = run();
    const second = run();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(created[0].terminate).toHaveBeenCalledTimes(1);
    created[1].onmessage!({ data: 5 } as MessageEvent<number>);
    expect(await second).toBe(10);
  });
});

describe("serial worker refusals", () => {
  it("refuses an already cancelled job without keeping a broken worker", async () => {
    const created: JobWorker[] = [];
    const runner = new SerialWorker(() => {
      const worker = new JobWorker();
      created.push(worker);
      return worker as unknown as Worker;
    });
    const controller = new AbortController();
    controller.abort();
    const options = {
      request: "input",
      timeoutMs: 100,
      timeoutError: () => new Error("timeout"),
      transportError: () => new Error("transport"),
      readResponse: (value: number) => value,
    };
    await expect(
      runner.run<string, number, number>({ ...options, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(created[0].postMessage).not.toHaveBeenCalled();
    const next = runner.run<string, number, number>(options);
    created[1].onmessage!({ data: 7 } as MessageEvent<number>);
    expect(await next).toBe(7);
  });
});
