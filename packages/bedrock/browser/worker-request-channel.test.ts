import { describe, expect, it } from "vitest";

import { WorkerRequestChannel } from "$/worker-request-channel";

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
});
