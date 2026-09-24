import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("export-dialog-geometry [feature-7-12]", () => {
  it("export-dialog-geometry behavior", async () => {
    const r = await build({
      entryPoints: ["apps/editor/src/managers/files/policies/sprite-sheet-geometry.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { spriteSheetAsepriteLayout, importSpriteSheetAsepriteLayout } = await import(
      `data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString("base64")}`
    );
    function read(name) {
      const fixtureDirectory = new URL("./", import.meta.url),
        widgetsUrl = new URL(`${name}.widgets.json`, fixtureDirectory),
        provenanceUrl = new URL(`${name}.provenance.json`, fixtureDirectory),
        bytes = fs.readFileSync(widgetsUrl),
        provenance = JSON.parse(fs.readFileSync(provenanceUrl, "utf8"));
      assert.equal(
        provenance.widgetInventory.sha256,
        createHash("sha256").update(bytes).digest("hex"),
        `${name} capture provenance`,
      );
      const raw = JSON.parse(bytes.toString("utf8"));
      const all = [];
      const walk = (n) => {
        if (n.visible) all.push(n);
        n.children?.forEach(walk);
      };
      walk(raw.tree);
      return all;
    }
    const mappings = {
      layout: {
        layout: "sheet_type",
        constraint: "constraint_type",
        mergeDuplicates: "merge_dups",
        ignoreEmpty: "ignore_empty",
        powerOfTwo: "power_of_two_size",
      },
      sprite: {
        source: "source",
        layers: "layers",
        frames: "frames",
        splitLayers: "split_layers",
        splitTags: "split_tags",
      },
      borders: {
        borderPadding: "border_padding",
        shapePadding: "shape_padding",
        innerPadding: "inner_padding",
        trimSprite: "trim_sprite_enabled",
        trimCels: "trim_enabled",
        extrude: "extrude_enabled",
      },
      output: { imageEnabled: "image_enabled", dataEnabled: "data_enabled" },
    };
    for (const tab of Object.keys(mappings)) {
      const name = tab === "layout" ? "export-sheet-layout" : `export-sheet-${tab}`,
        nodes = read(name),
        win = nodes.find((n) => n.id === "export_sprite_sheet"),
        client = { x: win.bounds[0] + 6, y: win.bounds[1] + 17 };
      const layout = spriteSheetAsepriteLayout(tab, { imageEnabled: false, dataEnabled: false });
      assert.equal(layout.height, win.bounds[3] * 2, `${tab} height`);
      for (const [field, id] of Object.entries({
        ...mappings[tab],
        openGenerated: "open_generated",
        preview: "preview",
      })) {
        const aseprite = nodes.find((n) => n.id === id);
        const bounds = layout.fields[field],
          label = bounds.labelWidth ?? 0,
          inset = bounds.inset ?? 8;
        const expected = [
          (aseprite.bounds[0] - client.x) * 2,
          (aseprite.bounds[1] - client.y) * 2,
          aseprite.bounds[2] * 2,
          aseprite.bounds[3] * 2,
        ];
        const actual = [
          bounds.x + label,
          bounds.y,
          bounds.width - label - inset,
          bounds.height ?? 32,
        ];
        assert.deepEqual(actual, expected, `${tab}.${field}`);
      }
      for (const name of ["Export", "Cancel"]) {
        const aseprite = nodes.find((n) => n.text === name && n.class === "ui::Button");
        const b = layout.actions[name];
        assert.deepEqual(
          [b.x, b.y, b.width, b.height],
          [
            (aseprite.bounds[0] - client.x) * 2,
            (aseprite.bounds[1] - client.y) * 2,
            aseprite.bounds[2] * 2,
            aseprite.bounds[3] * 2,
          ],
        );
      }
    }
    const nodes = read("import-sheet"),
      win = nodes.find((n) => n.id === "import_sprite_sheet"),
      client = { x: win.bounds[0] + 6, y: win.bounds[1] + 17 },
      layout = importSpriteSheetAsepriteLayout(false);
    assert.equal(layout.height, win.bounds[3] * 2);
    for (const [field, id] of Object.entries({
      layout: "sheet_type",
      x: "x",
      y: "y",
      width: "width",
      height: "height",
      columns: "columns",
      rows: "rows",
      paddingEnabled: "padding_enabled",
      partialTiles: "partial_tiles",
    })) {
      const aseprite = nodes.find((n) => n.id === id),
        b = layout.fields[field],
        label = b.labelWidth ?? 0,
        inset = b.inset ?? 8;
      assert.deepEqual(
        [b.x + label, b.y, b.width - label - inset, b.height ?? 32],
        [
          (aseprite.bounds[0] - client.x) * 2,
          (aseprite.bounds[1] - client.y) * 2,
          aseprite.bounds[2] * 2,
          aseprite.bounds[3] * 2,
        ],
        `import.${field}`,
      );
    }
    console.log(
      "Aseprite widget geometry matches all four collapsed Sprite Sheet tabs and Import Sprite Sheet. This checks authored bounds, not browser pixel scores.",
    );
    const expandedNodes = read("export-sheet-output-expanded"),
      expandedWin = expandedNodes.find((n) => n.id === "export_sprite_sheet"),
      expandedClient = { x: expandedWin.bounds[0] + 6, y: expandedWin.bounds[1] + 17 },
      expanded = spriteSheetAsepriteLayout("output", { imageEnabled: true, dataEnabled: true });
    assert.equal(expanded.height, expandedWin.bounds[3] * 2);
    for (const [field, id] of Object.entries({
      imageEnabled: "image_enabled",
      name: "image_filename",
      dataEnabled: "data_enabled",
      dataName: "data_filename",
      dataFormat: "data_format",
      listLayers: "list_layers",
      listTags: "list_tags",
      listSlices: "list_slices",
      filenameFormat: "data_filename_format",
      tagnameFormat: "data_tagname_format",
      openGenerated: "open_generated",
      preview: "preview",
    })) {
      const aseprite = expandedNodes.find((n) => n.id === id),
        b = expanded.fields[field],
        label = b.labelWidth ?? 0,
        inset = b.inset ?? 8;
      assert.deepEqual(
        [b.x + label, b.y, b.width - label - inset, b.height ?? 32],
        [
          (aseprite.bounds[0] - expandedClient.x) * 2,
          (aseprite.bounds[1] - expandedClient.y) * 2,
          aseprite.bounds[2] * 2,
          aseprite.bounds[3] * 2,
        ],
        `output-expanded.${field}`,
      );
    }
    const f = await build({
      entryPoints: ["apps/editor/src/managers/files/policies/export-file-geometry.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { exportFileAsepriteLayout, gifOptionsAsepriteLayout } = await import(
      `data:text/javascript;base64,${Buffer.from(f.outputFiles[0].contents).toString("base64")}`
    );
    for (const [prefix, windowId, spec, mapping] of [
      [
        "export-file",
        "export_file",
        exportFileAsepriteLayout(false, false),
        {
          output: "output_field",
          resize: "resize",
          area: "area",
          layers: "layers",
          frames: "frames",
          anidir: "anidir",
          forTwitter: "for_twitter",
          ignoreEmpty: "ignore_empty",
        },
      ],
      [
        "gif-options",
        "gif_options",
        gifOptionsAsepriteLayout,
        {
          interlaced: "interlaced",
          loop: "loop",
          palette: "preserve_palette_order",
          dontShow: "dont_show",
        },
      ],
    ]) {
      const nodes = read(prefix),
        win = nodes.find((n) => n.id === windowId),
        client = { x: win.bounds[0] + 6, y: win.bounds[1] + 17 };
      assert.equal(spec.height, win.bounds[3] * 2);
      for (const [field, id] of Object.entries(mapping)) {
        const aseprite = nodes.find((n) => n.id === id),
          b = spec.fields[field],
          label = b.labelWidth ?? 0,
          inset = b.inset ?? 8;
        assert.deepEqual(
          [b.x + label, b.y, b.width - label - inset, b.height ?? 32],
          [
            (aseprite.bounds[0] - client.x) * 2,
            (aseprite.bounds[1] - client.y) * 2,
            aseprite.bounds[2] * 2,
            aseprite.bounds[3] * 2,
          ],
          `${windowId}.${field}`,
        );
      }
    }
    console.log(
      "Expanded Output, Export File, and GIF Options authored bounds also match Aseprite widgets exactly. Browser pixel audit remains separate.",
    );
  }, 60_000);
});
