-- Read finished deliverables with native Aseprite, including their pixel colors.
local sprite = app.open(app.params.source)
local frames = {}
local colors = {}
for index, frame in ipairs(sprite.frames) do
  local flattened = Image(sprite.width, sprite.height, ColorMode.RGB)
  flattened:clear()
  flattened:drawSprite(sprite, index, Point(0, 0))
  for pixel in flattened:pixels() do
    local value = pixel()
    local rgba = {
      app.pixelColor.rgbaR(value), app.pixelColor.rgbaG(value),
      app.pixelColor.rgbaB(value), app.pixelColor.rgbaA(value),
    }
    colors[table.concat(rgba, ",")] = rgba
  end
  frames[#frames + 1] = { index = index - 1, durationMs = math.floor(frame.duration * 1000 + 0.5) }
end
local colorList = {}
for _, rgba in pairs(colors) do colorList[#colorList + 1] = rgba end
table.sort(colorList, function(a, b) return table.concat(a, ",") < table.concat(b, ",") end)
local layers = {}
for _, layer in ipairs(sprite.layers) do layers[#layers + 1] = layer.name end
local layerStates = {}
for _, layer in ipairs(sprite.layers) do
  layerStates[#layerStates + 1] = { name = layer.name, visible = layer.isVisible }
end
local report = {
  width = sprite.width, height = sprite.height, frameCount = #sprite.frames,
  frames = frames, colors = colorList, colorCount = #colorList, layers = layers, layerStates = layerStates,
  asepriteVersion = tostring(app.version),
}
local file = assert(io.open(app.params.output, "w"))
file:write(json.encode(report))
file:close()
sprite:close()
