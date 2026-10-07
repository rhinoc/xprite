export interface ShareRuntime {
  now(): number;
  makeId(): string;
  hashManagementKey(key: string): Promise<string>;
  hashBytes(bytes: Uint8Array): Promise<string>;
  equalsHash(left: string, right: string): boolean;
}

export interface ClientIpIdentifier {
  identify(ip: string): Promise<string>;
}
