import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
/** Public Lua behavior oracle in an isolated Aseprite GUI process. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveAsepriteExecutable, resolveAsepriteSource } from "../../base/reference-paths.mjs";
const executable = resolveAsepriteExecutable();
const source = resolveAsepriteSource();
const output = path.resolve(process.argv[2] ?? `.tmp/aseprite-home-defaults-${Date.now()}`);
await fs.mkdir(output, { recursive: true });
const reportFile = path.join(output, "report.json");
if (
  await fs.access(reportFile).then(
    () => true,
    () => false,
  )
)
  throw new Error("Preserving existing evidence; use a fresh output directory.");
const run = await fs.mkdtemp(path.join(os.tmpdir(), "aseprite-home-defaults-"));
const profile = path.join(run, "profile");
await fs.mkdir(profile);
const luaFile = path.join(run, "oracle.lua");
const lua = `local log=assert(io.open(${JSON.stringify(path.join(output, "lua.log"))},"w"))
local function print(message) log:write(message.."\\n");log:flush() end
local timer
local function show(sprite)
  local p=app.preferences.document(sprite).show
  return {grid=p.grid, auto_guides=p.auto_guides,layer_edges=p.layer_edges,brush_preview=p.brush_preview}
end
local function emit(id,s)
 print('HOME_DEFAULTS '..id..' '..tostring(s.grid)..' '..tostring(s.auto_guides)..' '..tostring(s.layer_edges)..' '..tostring(s.brush_preview))
end
local function same(a,b)
 for k,v in pairs(a) do assert(b[k]==v,'changed '..k) end
end
timer=Timer{interval=0.5,ontick=function()
 timer:stop()
 local ok,err=xpcall(function()
  local initial=show(nil)
  emit('defaults_initial',initial)
  local existing=Sprite(8,8,ColorMode.RGB)
  same(show(existing),initial)
  assert(app.command.Home(),'Home command failed')
  assert(app.activeSprite==nil,'Home must have no active sprite')
  assert(app.command.ShowGrid(),'ShowGrid failed')
  assert(app.command.ShowAutoGuides(),'ShowAutoGuides failed')
  assert(app.command.ShowLayerEdges(),'ShowLayerEdges failed')
  assert(app.command.ShowBrushPreview(),'ShowBrushPreview failed')
  local defaults=show(nil)
  for k,v in pairs(initial) do assert(defaults[k]==(not v),'default did not toggle '..k) end
  emit('defaults_after_home',defaults)
  same(show(existing),initial)
  emit('existing_after_home',show(existing))
  local created=Sprite(9,9,ColorMode.RGB)
  same(show(created),defaults)
  emit('new_inherits_defaults',show(created))
  assert(app.command.ShowGrid(),'New sprite grid toggle failed')
  local changed=show(created)
  assert(changed.grid==initial.grid,'New sprite grid did not toggle')
  same(show(nil),defaults)
  same(show(existing),initial)
  emit('defaults_after_document_toggle',show(nil))
  emit('existing_after_document_toggle',show(existing))
  print('HOME_DEFAULTS_VERIFIED')
  created:close()
  existing:close()
 end,debug.traceback)
 if not ok then print('HOME_DEFAULTS_ERROR '..tostring(err)) end
 app.exit()
end}
timer:start()
`;
await fs.writeFile(luaFile, lua);
await fs.writeFile(path.join(output, "oracle.lua"), lua);
await fs.writeFile(
  path.join(profile, "aseprite.ini"),
  `[script_access]\n${crypto.createHash("sha1").update(luaFile).digest("hex")} = 6\n[general]\nvisible_timeline = true\n`,
);
let report = {
  verified: false,
  executable,
  profileIsolation: true,
  operations:
    "Public Sprite constructor, app.command.Home/Show*, app.preferences.document, activeSprite",
  sourceFiles: {},
  cases: [],
};
try {
  for (const relative of [
    "src/app/commands/cmd_show.cpp",
    "src/app/pref/preferences.cpp",
    "src/app/ui_context.cpp",
    "src/app/script/preferences_object.cpp",
  ])
    report.sourceFiles[relative] = crypto
      .createHash("sha256")
      .update(await fs.readFile(path.join(source, relative)))
      .digest("hex");
  const processLog = execFileSync(executable, ["--script", luaFile], {
    env: { ...process.env, ASEPRITE_USER_FOLDER: profile },
    timeout: 20000,
    encoding: "utf8",
  });
  await fs.writeFile(path.join(output, "aseprite.log"), processLog);
  const log = await fs.readFile(path.join(output, "lua.log"), "utf8");
  report.exitStatus = 0;
  assert.match(log, /HOME_DEFAULTS_VERIFIED/);
  assert.doesNotMatch(log, /HOME_DEFAULTS_ERROR/);
  report.cases = [
    ...log.matchAll(/HOME_DEFAULTS (\w+) (true|false) (true|false) (true|false) (true|false)/g),
  ].map(([, id, grid, autoGuides, layerEdges, brushPreview]) => ({
    id,
    grid: grid === "true",
    autoGuides: autoGuides === "true",
    layerEdges: layerEdges === "true",
    brushPreview: brushPreview === "true",
  }));
  assert.equal(report.cases.length, 6);
  report.verified = true;
} catch (error) {
  report.error = String(error);
  report.exitStatus = error.status ?? report.exitStatus ?? null;
  report.signal = error.signal ?? null;
  if (error.stdout || error.stderr)
    await fs.writeFile(
      path.join(output, "aseprite.log"),
      String(error.stdout ?? "") + String(error.stderr ?? ""),
    );
  process.exitCode = 1;
} finally {
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
  await fs.rm(run, { recursive: true, force: true });
}
console.log(
  JSON.stringify(
    { report: reportFile, verified: report.verified, cases: report.cases, error: report.error },
    null,
    2,
  ),
);
