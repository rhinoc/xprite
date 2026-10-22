import { describe, expect, it } from "vitest";

import { WorkerRequestChannel, type WorkerTransportFailure } from "$/worker-request-channel";

class RequestWorker extends EventTarget {
  readonly requests: number[] = [];
  postMessage(request: { id: number }): void {
    this.requests.push(request.id);
  }
}

describe("persistent worker request channels", () => {
  it("rejects pending and subsequent requests after a fatal transport error", async () => {
    const worker = new RequestWorker();
    const failure = new Error("Transport failed");
    const channel = new WorkerRequestChannel<{ id: number }, { id: number }>(worker, {
      closedError: () => new Error("Closed"),
      transportError: () => failure,
    });
    const pending = channel.request({ id: channel.nextRequestId() }, (response) => response.id);
    const rejected = expect(pending).rejects.toBe(failure);
    worker.dispatchEvent(new Event("error"));
    await rejected;
    expect(channel.isFailed).toBe(true);
    await expect(
      channel.request({ id: channel.nextRequestId() }, (response) => response.id),
    ).rejects.toBe(failure);
    expect(worker.requests).toEqual([1]);
    channel.close();
  });

  it("tells a worker that never started apart from one that failed later", async () => {
    const failures: WorkerTransportFailure[] = [];
    const open = () => {
      const worker = new RequestWorker();
      const channel = new WorkerRequestChannel<{ id: number }, { id: number }>(worker, {
        closedError: () => new Error("Closed"),
        transportError: (_event, failure) => {
          failures.push(failure);
          return new Error("Transport failed");
        },
      });
      return { worker, channel };
    };
    // A missing or unparsable worker script: a bare error Event before any answer.
    const missing = open();
    missing.worker.dispatchEvent(new Event("error"));
    // A script error while starting carries its message and file.
    const thrown = open();
    thrown.worker.dispatchEvent(
      Object.assign(new Event("error"), { message: "Uncaught Error: boom", filename: "w.js" }),
    );
    // Once the worker has answered, its script evidently loaded.
    const started = open();
    const answered = started.channel.request({ id: started.channel.nextRequestId() }, (r) => r.id);
    started.worker.dispatchEvent(new MessageEvent("message", { data: { id: 1 } }));
    await answered;
    started.worker.dispatchEvent(new Event("error"));
    // A payload the worker could not deserialize is not a load failure either.
    const undecodable = open();
    undecodable.worker.dispatchEvent(new Event("messageerror"));
    expect(failures).toEqual([
      { startup: true },
      { startup: false },
      { startup: false },
      { startup: false },
    ]);
    for (const { channel } of [missing, thrown, started, undecodable]) channel.close();
  });
});
