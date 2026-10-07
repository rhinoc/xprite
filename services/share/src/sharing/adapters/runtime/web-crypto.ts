import type { ClientIpIdentifier, ShareRuntime } from "$/sharing/ports/runtime";

const ID_BYTES = 16;
const MANAGEMENT_HASH_PREFIX = "xprite-share-management:";
const IP_HASH_PREFIX = "xprite-share-ip:";
const HEX_BASE = 16;
const HEX_BYTE_LENGTH = 2;

function hexadecimal(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(HEX_BASE).padStart(HEX_BYTE_LENGTH, "0")).join(
    "",
  );
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

export class WebCryptoShareRuntime implements ShareRuntime {
  now(): number {
    return Date.now();
  }

  makeId(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(ID_BYTES));
    return btoa(String.fromCharCode(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/u, "");
  }

  async hashManagementKey(key: string): Promise<string> {
    return this.hashBytes(new TextEncoder().encode(MANAGEMENT_HASH_PREFIX + key));
  }

  async hashBytes(bytes: Uint8Array): Promise<string> {
    return hexadecimal(new Uint8Array(await crypto.subtle.digest("SHA-256", ownedBuffer(bytes))));
  }

  equalsHash(left: string, right: string): boolean {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index++)
      difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    return difference === 0;
  }
}

/** HMAC instead of a plain IP hash: the small address space is enumerable. */
export class IpIdentifier implements ClientIpIdentifier {
  private readonly key: Promise<CryptoKey>;

  constructor(secret: string) {
    this.key = crypto.subtle.importKey(
      "raw",
      ownedBuffer(new TextEncoder().encode(secret)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }

  async identify(ip: string): Promise<string> {
    const input = ownedBuffer(new TextEncoder().encode(IP_HASH_PREFIX + canonicalIp(ip)));
    return hexadecimal(new Uint8Array(await crypto.subtle.sign("HMAC", await this.key, input)));
  }
}

const IPV4_PARTS = 4;
const MAX_IPV4_OCTET = 255;
const DECIMAL_OCTET = /^\d{1,3}$/u;

function canonicalIp(ip: string): string {
  if (ip.includes(":")) {
    const host = new URL(`http://[${ip}]/`).hostname;
    return host.slice(1, -1).toLowerCase();
  }
  const octets = ip.split(".");
  if (
    octets.length !== IPV4_PARTS ||
    octets.some((value) => !DECIMAL_OCTET.test(value) || Number(value) > MAX_IPV4_OCTET)
  ) {
    throw new Error("Invalid trusted client IP");
  }
  return octets.map(Number).join(".");
}
