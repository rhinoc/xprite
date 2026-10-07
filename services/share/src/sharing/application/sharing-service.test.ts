import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { URL as NodeURL } from "node:url";

import { afterEach, describe, it } from "vitest";

import { D1ShareRepository } from "$/sharing/adapters/cloudflare/d1-repository";
import { readBoundedBody } from "$/sharing/adapters/http/body";
import { ShareHttpHandler } from "$/sharing/adapters/http/handler";
import { IpIdentifier, WebCryptoShareRuntime } from "$/sharing/adapters/runtime/web-crypto";
import { CleanupService } from "$/sharing/application/cleanup-service";
import { SharingService } from "$/sharing/application/sharing-service";
import { validateAse } from "$/sharing/domain/ase-validation";
import { ShareError, ShareErrorCode } from "$/sharing/domain/errors";
import { CleanupMode, ShareState, type ReservationInput } from "$/sharing/domain/model";
import {
  MAX_FILE_BYTES,
  MAX_IP_BYTES,
  MAX_STORAGE_BYTES,
  RESERVATION_LIFETIME_MS,
  SHARE_LIFETIME_MS,
  UPLOAD_RATE_WINDOW_MS,
} from "$/sharing/domain/policy";
import type { ShareObjectStore } from "$/sharing/ports/object-store";

const SCHEMA = readFileSync(new NodeURL("../../../sql/schema.sql", import.meta.url), "utf8");
const KEY = "a".repeat(43);
const OTHER_KEY = "b".repeat(43);
const IP = "ip-a";
const INITIAL_TIME = 1_000_000;
const databases: DatabaseSync[] = [];

interface TestStatement {
  bind(...parameters: SQLInputValue[]): TestStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

/** Execute the production SQL in SQLite, not a hand-written quota substitute. */
class SqliteD1 {
  readonly database = new DatabaseSync(":memory:");
  losePublicationResponse = false;
  timeOffset = 0;

  constructor(now: () => number) {
    this.database.exec(SCHEMA);
    this.database.function("unixepoch", { varargs: true }, () => (now() + this.timeOffset) / 1_000);
    databases.push(this.database);
  }

  prepare(sql: string) {
    const bound = (values: SQLInputValue[] = []): TestStatement => ({
      bind: (...parameters: SQLInputValue[]) => bound(parameters),
      first: async <T>() => (this.database.prepare(sql).get(...values) ?? null) as T | null,
      all: async <T>() => ({ results: this.database.prepare(sql).all(...values) as T[] }),
      run: async () => {
        const result = this.database.prepare(sql).run(...values);
        if (this.losePublicationResponse && sql.includes("SET state = 'active'")) {
          this.losePublicationResponse = false;
          throw new Error("Publication committed but the response was lost");
        }
        return { meta: { changes: Number(result.changes) } };
      },
    });
    return bound();
  }

  binding(): D1Database {
    return this as unknown as D1Database;
  }
  heldBytes(): number {
    return Number(
      this.database.prepare("SELECT held_bytes FROM service_capacity").get()?.held_bytes,
    );
  }
}

class TestRuntime extends WebCryptoShareRuntime {
  time = INITIAL_TIME;
  override now() {
    return this.time;
  }
}

class TestObjects implements ShareObjectStore {
  readonly values = new Map<string, Uint8Array>();
  writes = 0;
  deleteFails = false;
  onWrite: (() => Promise<void>) | null = null;

  async writeOnce(id: string, bytes: Uint8Array): Promise<void> {
    if (this.onWrite) await this.onWrite();
    if (this.values.has(id))
      throw new ShareError(ShareErrorCode.Conflict, "Existing object or write fence");
    this.values.set(id, new Uint8Array(bytes));
    this.writes++;
  }
  async read(id: string) {
    return this.values.get(id) ?? null;
  }
  async delete(id: string) {
    if (this.deleteFails) throw new Error("R2 unavailable");
    this.values.delete(id);
  }
  async fence(id: string) {
    this.values.set(id, new Uint8Array(0));
  }
}

function fixture() {
  const runtime = new TestRuntime();
  const sql = new SqliteD1(() => runtime.time);
  const repository = new D1ShareRepository(sql.binding());
  const objects = new TestObjects();
  const service = new SharingService(repository, objects, runtime);
  const cleanup = new CleanupService(repository, objects, runtime);
  return { sql, repository, objects, runtime, service, cleanup };
}

function emptyAse(size = 144): Uint8Array {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, size, true);
  view.setUint16(4, 0xa5e0, true);
  view.setUint16(6, 1, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(128, size - 128, true);
  view.setUint16(132, 0xf1fa, true);
  if (size > 144) {
    // An unknown, bounded chunk: the official format permits readers to skip it.
    view.setUint16(134, 1, true);
    view.setUint32(144, size - 144, true);
    view.setUint16(148, 0x7fff, true);
  }
  return bytes;
}

async function metadata(runtime: TestRuntime, bytes = emptyAse()): Promise<ReservationInput> {
  return {
    requestId: crypto.randomUUID(),
    fileName: "sprite.aseprite",
    sizeBytes: bytes.byteLength,
    sha256: await runtime.hashBytes(bytes),
  };
}

async function reserveBytes(f: ReturnType<typeof fixture>, size: number, ip = IP) {
  return f.repository.reserve({
    id: f.runtime.makeId(),
    requestId: crypto.randomUUID(),
    ipKey: ip,
    managementHash: await f.runtime.hashManagementKey(KEY),
    fileName: "sprite.ase",
    sizeBytes: size,
    sha256: "0".repeat(64),
    createdAt: f.runtime.time,
    reservationUntil: f.runtime.time + RESERVATION_LIFETIME_MS,
  });
}

function failure(code: ShareErrorCode) {
  return (error: unknown) => error instanceof ShareError && error.code === code;
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("share capacity and persistence", () => {
  it("does not let a delayed publication reclaim a reservation already expired in database time", async () => {
    const f = fixture();
    const old = await reserveBytes(f, MAX_FILE_BYTES);
    assert.equal(await f.repository.claimUpload(old.id, f.runtime.time), true);
    f.sql.timeOffset = RESERVATION_LIFETIME_MS;
    assert.equal((await f.repository.capacity(IP, f.runtime.time)).reservedBytes, 0);
    const fresh = await reserveBytes(f, MAX_FILE_BYTES);
    assert.equal(fresh.createdAt, f.runtime.time + f.sql.timeOffset);
    assert.equal(
      await f.repository.publish(old.id, f.runtime.time, f.runtime.time + SHARE_LIFETIME_MS),
      false,
    );
  });
  it("admits exactly one of two competing uploads at the IP limit", async () => {
    const f = fixture();
    for (let index = 0; index < 39; index++) {
      if (index === 29) f.runtime.time += UPLOAD_RATE_WINDOW_MS + 1;
      await reserveBytes(f, MAX_FILE_BYTES);
    }
    const results = await Promise.allSettled([
      reserveBytes(f, MAX_FILE_BYTES),
      reserveBytes(f, MAX_FILE_BYTES),
    ]);
    assert.equal(results.filter((value) => value.status === "fulfilled").length, 1);
    assert.equal((await f.repository.capacity(IP, f.runtime.time)).reservedBytes, MAX_IP_BYTES);
    assert.equal(f.sql.heldBytes(), MAX_IP_BYTES);
  });

  it("releases expired IP capacity before R2 cleanup, retaining physical capacity", async () => {
    const f = fixture();
    await reserveBytes(f, MAX_FILE_BYTES);
    f.runtime.time += RESERVATION_LIFETIME_MS;
    assert.deepEqual(await f.repository.capacity(IP, f.runtime.time), {
      usedBytes: 0,
      reservedBytes: 0,
    });
    assert.equal(f.sql.heldBytes(), MAX_FILE_BYTES);
    await reserveBytes(f, MAX_FILE_BYTES);
    await f.cleanup.run();
    assert.equal(f.sql.heldBytes(), MAX_FILE_BYTES);
  });

  it("keeps the global storage guard atomic across different IPs", async () => {
    const f = fixture();
    f.sql.database
      .prepare("UPDATE service_capacity SET held_bytes = ?")
      .run(MAX_STORAGE_BYTES - MAX_FILE_BYTES);
    const results = await Promise.allSettled([
      reserveBytes(f, MAX_FILE_BYTES, "ip-a"),
      reserveBytes(f, MAX_FILE_BYTES, "ip-b"),
    ]);
    assert.equal(results.filter((value) => value.status === "fulfilled").length, 1);
    assert.equal(f.sql.heldBytes(), MAX_STORAGE_BYTES);
  });

  it("does not double charge simultaneous retries of the same request", async () => {
    const f = fixture();
    const input = await metadata(f.runtime);
    const records = await Promise.all([
      f.service.reserve(input, KEY, IP),
      f.service.reserve(input, KEY, IP),
    ]);
    assert.equal(records[0]!.id, records[1]!.id);
    assert.equal(f.sql.heldBytes(), input.sizeBytes);
    await assert.rejects(
      f.service.reserve({ ...input, fileName: "different.ase" }, KEY, IP),
      failure(ShareErrorCode.Conflict),
    );
    await assert.rejects(
      f.service.reserve(input, OTHER_KEY, IP),
      failure(ShareErrorCode.Unauthorized),
    );
  });

  it("enforces creation frequency even after reservations are revoked", async () => {
    const f = fixture();
    for (let index = 0; index < 30; index++) {
      const record = await reserveBytes(f, 144);
      await f.repository.retire(record.id, f.runtime.time);
    }
    await assert.rejects(reserveBytes(f, 144), failure(ShareErrorCode.RateLimited));
    f.runtime.time += UPLOAD_RATE_WINDOW_MS + 1;
    await reserveBytes(f, 144);
  });
});

describe("share lifecycle", () => {
  it("recovers a lost publication response and does not rewrite published files", async () => {
    const f = fixture();
    const bytes = emptyAse();
    const input = await metadata(f.runtime, bytes);
    const record = await f.service.reserve(input, KEY, IP);
    f.sql.losePublicationResponse = true;
    const share = await f.service.upload(record.id, KEY, bytes);
    assert.equal(share.expiresAt, f.runtime.time + SHARE_LIFETIME_MS);
    assert.deepEqual(await f.service.upload(record.id, KEY, bytes), share);
    assert.equal(f.objects.writes, 1);
    assert.deepEqual((await f.service.download(record.id)).bytes, bytes);
  });

  it("requires management credentials even when the requester has the same IP", async () => {
    const f = fixture();
    const record = await f.service.reserve(await metadata(f.runtime), KEY, IP);
    await assert.rejects(
      f.service.revoke(record.id, OTHER_KEY),
      failure(ShareErrorCode.Unauthorized),
    );
    assert.equal((await f.repository.get(record.id))?.state, ShareState.Reserved);
  });

  it("fences a delayed R2 write when revocation races the writer", async () => {
    const f = fixture();
    const bytes = emptyAse();
    const record = await f.service.reserve(await metadata(f.runtime), KEY, IP);
    let entered!: () => void;
    let resume!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    f.objects.onWrite = async () => {
      entered();
      await gate;
    };
    const upload = f.service.upload(record.id, KEY, bytes);
    const rejected = assert.rejects(upload, failure(ShareErrorCode.Conflict));
    await started;
    await f.service.revoke(record.id, KEY);
    assert.equal((await f.repository.get(record.id))?.cleanupMode, CleanupMode.Fence);
    await f.cleanup.run();
    resume();
    await rejected;
    assert.equal(f.objects.values.get(record.id)?.byteLength, 0);
    assert.equal(f.sql.heldBytes(), 0);
    await assert.rejects(f.service.metadata(record.id), failure(ShareErrorCode.Gone));
  });

  it("releases capacity once and retries cleanup without making a revoked file accessible", async () => {
    const f = fixture();
    const bytes = emptyAse();
    const record = await f.service.reserve(await metadata(f.runtime), KEY, IP);
    await f.service.upload(record.id, KEY, bytes);
    await f.service.revoke(record.id, KEY);
    assert.deepEqual(await f.service.capacity(IP), { usedBytes: 0, reservedBytes: 0 });
    f.objects.deleteFails = true;
    assert.equal((await f.cleanup.run()).failed, 1);
    assert.equal(f.sql.heldBytes(), bytes.byteLength);
    await assert.rejects(f.service.download(record.id), failure(ShareErrorCode.Gone));
    f.objects.deleteFails = false;
    f.runtime.time += 60_001;
    await f.cleanup.run();
    await f.service.revoke(record.id, KEY);
    await f.cleanup.run();
    assert.equal(f.sql.heldBytes(), 0);
    assert.equal(f.objects.values.size, 0);
  });

  it("never publishes a changed file or an expired upload reservation", async () => {
    const f = fixture();
    const bytes = emptyAse();
    const record = await f.service.reserve(await metadata(f.runtime), KEY, IP);
    const changed = new Uint8Array(bytes);
    changed[16] = 1;
    await assert.rejects(
      f.service.upload(record.id, KEY, changed),
      failure(ShareErrorCode.InvalidFile),
    );
    f.runtime.time += RESERVATION_LIFETIME_MS;
    await assert.rejects(f.service.upload(record.id, KEY, bytes), failure(ShareErrorCode.Gone));
    assert.equal(f.objects.values.size, 0);
  });

  it("expires an active share precisely, without waiting for the cleanup job", async () => {
    const f = fixture();
    const bytes = emptyAse();
    const record = await f.service.reserve(await metadata(f.runtime), KEY, IP);
    const share = await f.service.upload(record.id, KEY, bytes);
    f.runtime.time = share.expiresAt;
    await assert.rejects(f.service.metadata(record.id), failure(ShareErrorCode.Gone));
    assert.equal((await f.service.capacity(IP)).usedBytes, 0);
    assert.equal(f.sql.heldBytes(), bytes.byteLength);
    await f.cleanup.run();
    assert.equal(f.sql.heldBytes(), 0);
  });
});

describe("share HTTP and input boundaries", () => {
  it("accepts the exact file limit and rejects oversized or truncated ASE data", () => {
    validateAse(emptyAse(MAX_FILE_BYTES));
    assert.throws(
      () => validateAse(emptyAse(MAX_FILE_BYTES + 1)),
      failure(ShareErrorCode.FileTooLarge),
    );
    assert.throws(
      () => validateAse(emptyAse().subarray(0, 143)),
      failure(ShareErrorCode.InvalidFile),
    );
    const broken = emptyAse(160);
    new DataView(broken.buffer).setUint32(144, 100, true);
    assert.throws(() => validateAse(broken), failure(ShareErrorCode.InvalidFile));
  });

  it("rejects an oversized streamed body without trusting Content-Length", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_FILE_BYTES));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    const request = new Request(
      "https://api.example.test",
      Object.assign({ method: "PUT", body }, { duplex: "half" }),
    );
    await assert.rejects(
      readBoundedBody(request, MAX_FILE_BYTES),
      failure(ShareErrorCode.FileTooLarge),
    );
  });

  it("normalizes IPv6 identifiers while keeping IP authorization out of share management", async () => {
    const ips = new IpIdentifier("a".repeat(64));
    assert.equal(await ips.identify("2001:db8::1"), await ips.identify("2001:0db8:0:0:0:0:0:1"));
    assert.notEqual(await ips.identify("192.0.2.1"), await ips.identify("192.0.2.2"));
  });

  it("supports reserve, upload, download, and revoke without leaking private metadata", async () => {
    const f = fixture();
    const bytes = emptyAse();
    const http = new ShareHttpHandler(
      f.service,
      f.cleanup,
      {
        async identify() {
          return IP;
        },
      },
      {
        allowedOrigins: new Set(["https://xprite.cc"]),
        viewerUrl: "https://xprite.cc/tools/viewer/",
      },
    );
    const background: Promise<unknown>[] = [];
    const context = {
      waitUntil(promise: Promise<unknown>) {
        background.push(promise);
      },
    } as ExecutionContext;
    const response = await http.fetch(
      new Request("https://api.example.test/v1/shares", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KEY}`,
          Origin: "https://xprite.cc",
          "Content-Type": "application/json",
          "CF-Connecting-IP": "192.0.2.1",
        },
        body: JSON.stringify(await metadata(f.runtime, bytes)),
      }),
      context,
    );
    assert.equal(response.status, 201);
    const record = (await response.json()) as { id: string };
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://xprite.cc");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(
      Object.keys(record).sort(),
      [
        "id",
        "state",
        "fileName",
        "sizeBytes",
        "sha256",
        "reservationUntil",
        "expiresAt",
        "shareUrl",
      ].sort(),
    );
    const uploaded = await http.fetch(
      new Request(`https://api.example.test/v1/shares/${record.id}/upload`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/octet-stream" },
        body: new Uint8Array(bytes).buffer,
      }),
      context,
    );
    assert.equal(uploaded.status, 200);
    const downloaded = await http.fetch(
      new Request(`https://api.example.test/v1/shares/${record.id}/file`),
      context,
    );
    assert.equal(downloaded.status, 200);
    assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), bytes);
    const forbidden = await http.fetch(
      new Request("https://api.example.test/v1/quota", {
        headers: { Origin: "https://other.example" },
      }),
      context,
    );
    assert.equal(forbidden.status, 403);
    const missingIp = await http.fetch(new Request("https://api.example.test/v1/quota"), context);
    assert.equal(missingIp.status, 503);
    const revoked = await http.fetch(
      new Request(`https://api.example.test/v1/shares/${record.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${KEY}` },
      }),
      context,
    );
    assert.equal(revoked.status, 204);
    await Promise.all(background);
    const expired = await http.fetch(
      new Request(`https://api.example.test/v1/shares/${record.id}/file`),
      context,
    );
    assert.equal(expired.status, 410);
  });
});
