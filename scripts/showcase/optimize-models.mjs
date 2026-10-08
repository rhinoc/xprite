import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile, rename, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { pack } from "gltfpack";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUTPUT = resolve(ROOT, "apps/growth/public/showcase/ipad");
const MANIFEST_PATH = resolve(ROOT, "apps/growth/src/adapters/showcase/model-manifest.json");
const MAXIMUM_SIMPLIFICATION_ERROR = "0.001";
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BINARY_CHUNK_TYPE = 0x004e4942;
const WORD_BYTES = 4;
const PROFILES = [
  { name: "macbook-pro", ratio: "0.25", source: "scripts/showcase/devices/macbook-pro.blend" },
  { name: "iphone", ratio: "0.5", source: "scripts/showcase/devices/iphone.blend" },
  { name: "ipad", ratio: "0.5", source: "scripts/showcase/ipad/ipad-showcase.blend" },
  { name: "apple-pencil", ratio: "0.5", source: "scripts/showcase/ipad/ipad-showcase.blend" },
  { name: "hand", ratio: "0.35", source: "scripts/showcase/ipad/hand-tap.blend" },
];
const hash = (data) => createHash("sha256").update(data).digest("hex");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}.`);
}

function parseGlb(bytes) {
  if (bytes.readUInt32LE(0) !== GLB_MAGIC || bytes.readUInt32LE(WORD_BYTES) !== GLB_VERSION)
    throw new Error("Expected glTF 2 GLB.");
  const length = bytes.readUInt32LE(GLB_HEADER_BYTES);
  const textStart = GLB_HEADER_BYTES + CHUNK_HEADER_BYTES;
  const binary = textStart + length;
  return {
    json: JSON.parse(bytes.subarray(textStart, binary).toString()),
    binary: bytes.subarray(
      binary + CHUNK_HEADER_BYTES,
      binary + CHUNK_HEADER_BYTES + bytes.readUInt32LE(binary),
    ),
  };
}

function encodeGlb({ json, binary }) {
  const text = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(text.length / WORD_BYTES) * WORD_BYTES, 0x20);
  text.copy(padded);
  const header = Buffer.alloc(GLB_HEADER_BYTES + CHUNK_HEADER_BYTES);
  header.writeUInt32LE(GLB_MAGIC);
  header.writeUInt32LE(GLB_VERSION, WORD_BYTES);
  header.writeUInt32LE(
    GLB_HEADER_BYTES + CHUNK_HEADER_BYTES * 2 + padded.length + binary.length,
    WORD_BYTES * 2,
  );
  header.writeUInt32LE(padded.length, GLB_HEADER_BYTES);
  header.writeUInt32LE(JSON_CHUNK_TYPE, GLB_HEADER_BYTES + WORD_BYTES);
  const binaryHeader = Buffer.alloc(CHUNK_HEADER_BYTES);
  binaryHeader.writeUInt32LE(binary.length);
  binaryHeader.writeUInt32LE(BINARY_CHUNK_TYPE, WORD_BYTES);
  return Buffer.concat([header, padded, binaryHeader, binary]);
}

function textureCoordinates(value, result = new Set()) {
  if (!value || typeof value !== "object") return result;
  if (typeof value.index === "number") {
    result.add(value.extensions?.KHR_texture_transform?.texCoord ?? value.texCoord ?? 0);
  }
  for (const child of Object.values(value)) textureCoordinates(child, result);
  return result;
}

function pruneUnusedUvs(json) {
  const displays = new Set(
    json.nodes.filter((node) => node.name === "Screen").map((node) => node.mesh),
  );
  json.meshes.forEach((mesh, index) => {
    for (const primitive of mesh.primitives) {
      const used = textureCoordinates(json.materials?.[primitive.material]);
      // Display materials are replaced by an animated canvas after loading.
      if (displays.has(index)) used.add(0);
      for (const attribute of Object.keys(primitive.attributes)) {
        if (attribute.startsWith("TEXCOORD_") && !used.has(Number(attribute.slice(9))))
          delete primitive.attributes[attribute];
      }
    }
  });
}

function stats(json) {
  let vertices = 0;
  let triangles = 0;
  for (const mesh of json.meshes) {
    for (const primitive of mesh.primitives) {
      vertices += json.accessors[primitive.attributes.POSITION].count;
      triangles += json.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3;
    }
  }
  return { vertices, triangles, meshes: json.meshes.length };
}

await mkdir(resolve(ROOT, ".tmp"), { recursive: true });
const temporary = await mkdtemp(resolve(ROOT, ".tmp/showcase-models-"));
run(process.env.BLENDER_BIN ?? "blender", [
  "--background",
  "--python",
  resolve(ROOT, "scripts/showcase/export-runtime-models.py"),
  "--",
  "--output",
  temporary,
]);
const manifest = { tool: "gltfpack 1.3.0", revision: "", models: {} };
for (const profile of PROFILES) {
  const filename = `${profile.name}.glb`;
  const input = await readFile(join(temporary, filename));
  const prepared = parseGlb(input);
  pruneUnusedUvs(prepared.json);
  const sourcePath = join(temporary, `${profile.name}-input.glb`);
  const outputPath = join(temporary, `${profile.name}-optimized.glb`);
  await writeFile(sourcePath, encodeGlb(prepared));
  await pack(
    [
      "-i",
      sourcePath,
      "-o",
      outputPath,
      "-cc",
      "-ce",
      "ext",
      "-si",
      profile.ratio,
      "-se",
      MAXIMUM_SIMPLIFICATION_ERROR,
      "-slb",
      "-kn",
      "-km",
      "-ke",
      "-kv",
      "-vpf",
      "-vtf",
      "-vnf",
      "-vp",
      "16",
    ],
    {
      read: (path) => readFileSync(path),
      write: (path, data) => writeFileSync(path, data),
    },
  );
  const result = await readFile(outputPath);
  const optimized = parseGlb(result).json;
  for (const sourceNode of prepared.json.nodes.filter((node) => node.name === "Screen")) {
    const display = optimized.nodes.find((node) => node.name === sourceNode.name);
    if (
      display?.mesh === undefined ||
      optimized.meshes[display.mesh].primitives.some(
        (primitive) => primitive.attributes.TEXCOORD_0 === undefined,
      )
    )
      throw new Error(`${filename} lost the animated display mesh or its UVs.`);
  }
  manifest.models[filename] = {
    source: profile.source,
    sourceSha256: hash(await readFile(resolve(ROOT, profile.source))),
    exportedBytes: input.length,
    bytes: result.length,
    sha256: hash(result),
    original: stats(prepared.json),
    optimized: stats(optimized),
  };
  console.log(
    `${filename}: ${input.length} → ${result.length} bytes; ${stats(prepared.json).triangles} → ${stats(optimized).triangles} triangles`,
  );
}
manifest.revision = hash(JSON.stringify(manifest.models)).slice(0, 16);
// Publish only after every export and optimization succeeds.
for (const { name } of PROFILES)
  await rename(join(temporary, `${name}-optimized.glb`), join(OUTPUT, `${name}.glb`));
await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Optimized runtime assets written to ${OUTPUT}; editable sources remain unchanged.`);
