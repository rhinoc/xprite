-- Capture Aseprite's own window surface without OS screen capture.
-- Invoke with --script-param output=/absolute/path/aseprite-client.png and,
-- optionally, --script-param fixture=/absolute/path/Untitled.png before --script.

local output = app.params.output
assert(output and output ~= "", "reference capture needs --script-param output=...")

local originalLoadLibrary=package.loadlib
package.loadlib=function(file,symbol) local fn,err=originalLoadLibrary(file,symbol);if not fn then io.stderr:write(tostring(err).."\n");io.stderr:flush() end;return fn,err end
local fixture = app.params.fixture
local stage = 0
local timer

local function capture()
  if string.sub(app.params.state or "", 1, 12) == "color-hover-" then
    local hover, loadError = package.loadlib(app.params.inventoryModule, "hover_reference_color_selector")
    assert(hover, loadError)
    hover()
  end
  if app.params.state == "selection-handles" then
    -- Canonical initial animation pose: selection is first created in this
    -- same event callback, then synchronously painted and captured before the
    -- 100ms ants timer can receive any event. No pixels or private fields change.
    app.activeSprite.selection = Selection(Rectangle(220, 180, 64, 48))
    app.refresh()
    local flushInitial, flushError = package.loadlib(app.params.inventoryModule, "flush_reference_initial_selection")
    assert(flushInitial, flushError)
    flushInitial() -- public dispatchMessages flushes paint without polling timers
  end
  if app.params.inventoryModule then
    local inspectWidgets, loadError = package.loadlib(app.params.inventoryModule, "inspect_reference_widgets")
    assert(inspectWidgets, loadError)
    inspectWidgets()
  end
  if app.params.module then
    local captureWindow, loadError = package.loadlib(app.params.module, "capture_reference_window")
    assert(captureWindow, loadError)
    captureWindow()
  end
  assert(app.command.Screenshot{ save=false, srgb=true },
         "Screenshot command failed")

  -- ScreenshotCommand adds the generated Sprite to the UI context and makes
  -- it the last selected document. app.activeSprite therefore refers to the
  -- captured Aseprite client surface, not the fixture document.
  local shot = app.activeSprite
  assert(shot, "Screenshot command did not create an active sprite")
  assert(shot:saveCopyAs(output), "failed to save Aseprite surface")
  print(string.format("Aseprite surface saved: %s (%dx%d)",
                      output, shot.width, shot.height))
  if app.params.state == "new-tilemap-dialog" or app.params.state == "color-range" or app.params.state == "replace-color" or app.params.state == "hue-saturation" or app.params.state == "brightness-contrast" or app.params.state == "invert-color" or app.params.state == "outline" or app.params.state == "gif-options" then
    local finishCapture, loadError = package.loadlib(app.params.module, "finish_reference_capture")
    assert(finishCapture, loadError)
    finishCapture()
  end
  shot:close()

  if (string.sub(app.params.state or "",1,10) == "selection-" or app.params.state == "color-range" or app.params.state == "close-dirty") and app.activeSprite then
    app.activeSprite:close() -- discard only this isolated fixture selection transaction
  end
  timer:stop()
  app.exit()
end

timer = Timer{
  interval=0.25,
  ontick=function()
    -- Commands can pump a nested UI loop. Stop first to prevent reentrant ticks.
    timer:stop()
    io.stderr:write("Capture stage "..stage.." state "..tostring(app.params.state).."\n");io.stderr:flush()
    if stage == 0 then
      stage = 1
      if app.params.scope == "client" then
        local configureWindow, loadError = package.loadlib(app.params.module, "configure_reference_window")
        assert(configureWindow, loadError)
        configureWindow()
      end
      if fixture and fixture ~= "" then
        assert(app.open(fixture), "failed to open fixture: " .. fixture)
      end

      if app.params.palette and app.params.palette ~= "" then
        -- Indexed fixtures use palette indices. Convert through the public
        -- command before replacing the palette so RGBA colors cannot remap.
        assert(app.command.ChangePixelFormat{ format="rgb" }, "RGB palette preparation failed")
        local colors = {}
        for color in string.gmatch(app.params.palette, "[^;]+") do
          local r, g, b, a = string.match(color, "(%d+),(%d+),(%d+),(%d+)")
          assert(a, "invalid capture palette")
          colors[#colors+1] = Color{ r=tonumber(r), g=tonumber(g), b=tonumber(b), a=tonumber(a) }
        end
        local palette = Palette(#colors)
        for index, color in ipairs(colors) do palette:setColor(index-1, color) end
        app.activeSprite:setPalette(palette)
      end
      if app.params.layer == "regular" then
        if app.activeLayer.isBackground then
          assert(app.command.LayerFromBackground(), "regular layer preparation failed")
        end
        app.activeLayer.name = "Layer"
        assert(not app.activeLayer.isBackground and app.activeLayer.name == "Layer", "capture layer must be regular and named Layer")
      elseif app.params.layer == "background" then
        assert(app.activeLayer.isBackground, "background mode requires an opaque Aseprite background fixture")
      elseif app.params.layer == "preserve" then
        assert(app.activeSprite and app.activeLayer, "project mode requires an active authored layer")
      end
      if (app.params.palette and app.params.palette ~= "") or app.params.layer == "regular" then
        -- Only the isolated fixture copy is saved. Runner rejects any RGBA change.
        app.activeSprite:saveAs(fixture)
      end
      local tool = app.params.tool or "pencil"
      if app.activeTool.id ~= tool then app.activeTool = tool end
      app.fgColor = Color{ r=255, g=255, b=255 }
      app.bgColor = Color{ r=0, g=0, b=0 }
      assert(app.command.SetPaletteEntrySize{ size=11 })
      assert(app.command.Timeline{ open=true })
      if app.params.frame and app.params.frame ~= "" then
        local frame = tonumber(app.params.frame)
        assert(frame and frame >= 1 and frame <= #app.activeSprite.frames, "invalid requested frame")
        app.activeFrame = frame
      end

      -- Force invalidation before the next timer tick. The timer callback is
      -- already running inside the GUI message loop, so this defers capture
      -- until after the Aseprite surface has had a paint opportunity.
      app.refresh()
      timer:start()
    elseif stage < 12 then
      if stage == 1 then
        app.editor.zoom = app.params.zoomFocus == "anchor-center" and 1 or tonumber(app.params.zoom or "1")
        app.editor.scroll = { x=app.activeSprite.width/2, y=app.activeSprite.height/2 }
        if app.params.zoomFocus == "anchor-center" then
          app.command.Zoom { percentage=tostring(100*tonumber(app.params.zoom or "1")), focus="center" }
        end
      end
      if stage == 11 and app.params.state == "view-show-menu" and app.params.capabilities == "basic" then
        local applyShow, loadError = package.loadlib(app.params.inventoryModule, "apply_reference_view_show_capabilities")
        assert(applyShow, loadError)
        applyShow()
      end
      if stage == 11 and app.params.state == "file-export-menu" and app.params.capabilities == "basic" then
        local applyExport, loadError = package.loadlib(app.params.inventoryModule, "apply_reference_export_capabilities")
        assert(applyExport, loadError)
        applyExport()
      end
      if stage == 10 and app.params.state == "view-show-menu" then
        local openShow, loadError = package.loadlib(app.params.inventoryModule, "open_reference_view_show_menu")
        assert(openShow, loadError)
        openShow()
      end
      if stage == 10 and app.params.state == "file-export-menu" then
        local openExport, loadError = package.loadlib(app.params.inventoryModule, "open_reference_export_menu")
        assert(openExport, loadError)
        openExport()
      end
      if stage == 9 and (app.params.homeLayout == "no-news" or app.params.homeLayout == "no-news-no-folders") then
        local applyHome, loadError = package.loadlib(app.params.inventoryModule, "apply_reference_home_layout")
        assert(applyHome, loadError)
        applyHome()
      end
      if stage == 9 and (app.params.capabilities == "basic" or app.params.capabilities == "features1-6") then
        local applyCapabilities, loadError = package.loadlib(app.params.inventoryModule, "apply_reference_capabilities")
        assert(applyCapabilities, loadError)
        applyCapabilities()
      end
      if stage == 8 and (app.params.state == "file-menu" or app.params.state == "file-export-menu") then
        assert(app.command.ShowMenu{ menu="file_menu" }, "File menu command failed")
      end
      if stage == 8 and (app.params.state == "view-menu" or app.params.state == "view-show-menu") then
        assert(app.command.ShowMenu{ menu="view_menu" }, "View menu command failed")
      end
      if stage == 8 and app.params.state == "home" then
        assert(app.command.Home(), "Home command failed")
      end
      if stage == 8 and app.params.state == "ink-shading" then stage=9;timer:start();app.command.SetInkType{type=Ink.SHADING};return end
      if stage == 8 and app.params.state == "dynamics-gradient" then
        local openDynamics,err=package.loadlib(app.params.inventoryModule,"open_reference_gradient_dynamics")
        assert(openDynamics,err);openDynamics()
      end
      if stage == 8 and app.params.state == "symmetry" then app.command.SymmetryMode{orientation="horizontal"} end
      if stage == 8 and (app.params.state == "tilemap-tiles" or app.params.state == "tilemap-selected" or app.params.state == "tilemap-flipped") then
        assert(app.activeLayer and app.activeLayer.isTilemap, "tilemap-tiles requires a Tilemap layer")
        assert(app.command.ToggleTilesMode(), "Toggle Tiles Mode command failed")
        if app.params.state == "tilemap-selected" then app.fgTile=2;app.bgTile=3 end
        if app.params.state == "tilemap-flipped" then app.fgTile=2147483650;app.bgTile=1073741827 end
      end
      if stage == 8 and app.params.state == "new-tilemap-dialog" then
        stage=9
        timer:start()
        assert(app.command.NewLayer{type="tilemap",ask=true}, "New Tilemap Layer command failed")
        return
      end
      if stage == 8 and app.params.state == "tiled" then app.command.TiledMode{axis="both"} end
      if stage == 8 and app.params.state == "onion" then app.command.ShowOnionSkin() end
      if stage == 8 and app.params.state == "palette-presets" then
        stage = 9
        timer:start()
        assert(app.command.ShowPalettePresets{}, "Palette Presets command failed")
        return
      end
      if stage == 8 and app.params.state == "grid" then
        assert(app.command.ShowGrid(), "grid command failed")
      elseif stage == 8 and app.params.state == "layer-edges" then
        assert(app.command.ShowLayerEdges(), "layer edges command failed")
      end
      if stage == 8 and app.params.state == "close-dirty" then
        -- Public selection transaction dirties only the isolated document. RGBA
        -- pixels and the prepared fixture on disk remain exactly unchanged.
        app.activeSprite.selection = Selection(Rectangle(0, 0, 1, 1))
        stage = 9
        timer:start()
        app.command.CloseFile()
        return
      end
      if stage == 8 and (app.params.state == "layer-properties" or app.params.state == "layer-mode" or app.params.state == "group-properties") then
        stage = 9
        timer:start()
        if app.params.state == "group-properties" then
          for _, layer in ipairs(app.activeSprite.layers) do if layer.isGroup then app.activeLayer=layer; break end end
        end
        assert(app.command.LayerProperties(), "Layer Properties command failed")
        return
      end
      if stage == 10 and app.params.state == "layer-mode" then
        local openMode, loadError = package.loadlib(app.params.inventoryModule, "open_reference_layer_mode")
        assert(openMode, loadError)
        openMode()
      end
      if stage == 8 and app.params.state == "frame-properties" then
        stage = 9
        timer:start()
        assert(app.command.FrameProperties{ frame="current" }, "Frame Properties command failed")
        return
      end
      if stage == 8 and (app.params.state == "preferences" or app.params.state == "preferences-experimental") then
        stage = 9
        timer:start()
        app.command.Options()
        return
      end
      if stage == 10 and app.params.state == "preferences-experimental" then
        local openSection, err = package.loadlib(app.params.inventoryModule, "open_reference_experimental")
        assert(openSection, err); openSection()
      end
      if stage == 11 and app.params.state == "preferences-experimental" and app.params.capabilities == "features1-6" then
        local matchControls, err = package.loadlib(app.params.inventoryModule, "match_reference_experimental")
        assert(matchControls, err); matchControls()
      end
      if stage == 8 and app.params.state == "new-sprite" then
        stage = 9
        timer:start()
        app.command.NewFile{ ui=true, width=64, height=64, colorMode="rgb" }
        return
      end
      if stage == 8 and (app.params.state == "sprite-size" or app.params.state == "canvas-size" or app.params.state == "color-range" or string.sub(app.params.state or "",1,10) == "selection-") and app.params.state ~= "selection-handles" then
        if string.sub(app.params.state or "",1,10) == "selection-" then
          app.activeSprite.selection = Selection(Rectangle(4, 4, 8, 8))
        end
        stage = 9
        timer:start()
        if app.params.state == "sprite-size" then app.command.SpriteSize{ui=true}
        elseif app.params.state == "canvas-size" then app.command.CanvasSize{ui=true}
        elseif app.params.state == "color-range" then app.command.MaskByColor{ui=true}
        else app.command.ModifySelection{ui=true,modifier=string.sub(app.params.state,11)} end
        return
      end
      if stage == 8 and app.params.state == "timeline-settings" then
        local openPopup,err=package.loadlib(app.params.inventoryModule,"open_reference_timeline_settings")
        assert(openPopup,err);openPopup()
      end
      if stage == 10 and string.sub(app.params.state or "",1,13) == "export-sheet-" then
        local name="open_reference_sheet_"..string.gsub(string.sub(app.params.state,14),"-","_")
        local openSection,err=package.loadlib(app.params.inventoryModule,name)
        assert(openSection,err);openSection()
      end
      if stage == 11 and app.params.state == "timeline-settings" and app.params.capabilities == "features1-6" then
        local matchSettings,err=package.loadlib(app.params.inventoryModule,"match_reference_timeline_settings")
        assert(matchSettings,err);matchSettings()
      end
      if stage == 10 and app.params.state == "gif-options" then
        local accept,err=package.loadlib(app.params.inventoryModule,"accept_reference_export_for_gif")
        assert(accept,err);accept()
      end
      local featureCommand = ({ ["grid-settings"]="GridSettings", ["replace-color"]="ReplaceColor", ["hue-saturation"]="HueSaturation", ["brightness-contrast"]="BrightnessContrast", ["invert-color"]="InvertColor", ["outline"]="Outline", ["export-sheet"]="ExportSpriteSheet", ["import-sheet"]="ImportSpriteSheet", ["export-file"]="SaveFileCopyAs", ["gif-options"]="SaveFileCopyAs", ["preview"]="TogglePreview" })[app.params.state] or (string.sub(app.params.state or "",1,13)=="export-sheet-" and "ExportSpriteSheet" or nil)
      if stage == 8 and featureCommand then
        stage = 9
        timer:start()
        if app.params.state=="gif-options" then app.command[featureCommand]{ui=true,filename=app.params.output..".gif"}
        else app.command[featureCommand]{ui=true} end
        return
      end
      if stage == 8 and app.params.state == "insert-text" then
        -- PasteText enters a nested modal event loop. Advance before calling
        -- and restart the timer so later ticks can capture without reopening it.
        stage = 9
        timer:start()
        app.command.PasteText{ ui=true }
        return
      end
      if stage == 8 and app.params.state == "color-popup-hsv" then
        -- Color table constructor preserves HsvType, selecting HSV controls
        -- while retaining the same white RGBA fixture color.
        app.fgColor = Color{ hue=0, saturation=0, value=1, alpha=255 }
        assert(app.command.PaletteEditor{ popup="foreground" }, "HSV foreground popup command failed")
      end
      if stage == 8 and app.params.state == "color-popup-foreground" then
        assert(app.command.PaletteEditor{ popup="foreground" }, "foreground popup command failed")
      end
      stage = stage + 1
      app.refresh()
      timer:start()
    else
      capture()
    end
  end
}

timer:start()
