-- Native Aseprite pixel source. Invoke through generate-hello.py.
-- The only lettering control points and palette live in hello-path.json.
local input = assert(io.open(app.params.source, "r"))
local source = json.decode(input:read("*a"))
input:close()
local output = app.params.output

local function packedColor(rgba)
  return app.pixelColor.rgba(rgba[1], rgba[2], rgba[3], rgba[4])
end

local function cubic(start, curve, progress)
  local inverse = 1 - progress
  local function coordinate(axis)
    return inverse ^ 3 * start[axis]
      + 3 * inverse ^ 2 * progress * curve.control1[axis]
      + 3 * inverse * progress ^ 2 * curve.control2[axis]
      + progress ^ 3 * curve["end"][axis]
  end
  return { x = coordinate("x"), y = coordinate("y") }
end

local points = { source.start }
local lengths = { 0 }
local start = source.start
for _, curve in ipairs(source.curves) do
  for step = 1, source.curveSamples do
    local point = cubic(start, curve, step / source.curveSamples)
    local previous = points[#points]
    points[#points + 1] = point
    lengths[#lengths + 1] = lengths[#lengths]
      + math.sqrt((point.x - previous.x) ^ 2 + (point.y - previous.y) ^ 2)
  end
  start = curve["end"]
end
local totalLength = lengths[#lengths]

local function samplePath(progress)
  local target = math.max(0, math.min(1, progress)) * totalLength
  local low, high = 1, #lengths
  while low < high do
    local middle = math.floor((low + high) / 2)
    if lengths[middle] < target then low = middle + 1 else high = middle end
  end
  local index = math.max(2, low)
  local previous, nextPoint = points[index - 1], points[index]
  local span = lengths[index] - lengths[index - 1]
  local fraction = span == 0 and 0 or (target - lengths[index - 1]) / span
  return {
    x = previous.x + (nextPoint.x - previous.x) * fraction,
    y = previous.y + (nextPoint.y - previous.y) * fraction,
  }
end

-- Brush stamping touches integer pixels only. There is no antialiasing,
-- canvas stroke, font rendering, image scaling, or color interpolation.
local function stamp(image, x, y, color)
  for dy = 0, source.brushSize - 1 do
    for dx = 0, source.brushSize - 1 do
      local pixelX, pixelY = x + dx, y + dy
      if pixelX >= 0 and pixelX < source.width and pixelY >= 0 and pixelY < source.height then
        image:drawPixel(pixelX, pixelY, color)
      end
    end
  end
end

local function visitIntegerLine(x0, y0, x1, y1, visit)
  local dx, dy = math.abs(x1 - x0), -math.abs(y1 - y0)
  local sx, sy = x0 < x1 and 1 or -1, y0 < y1 and 1 or -1
  local error = dx + dy
  while true do
    visit(x0, y0)
    if x0 == x1 and y0 == y1 then break end
    local twiceError = 2 * error
    if twiceError >= dy then error = error + dy; x0 = x0 + sx end
    if twiceError <= dx then error = error + dx; y0 = y0 + sy end
  end
end

local function drawIntegerLine(image, x0, y0, x1, y1, color)
  visitIntegerLine(x0, y0, x1, y1, function(x, y) stamp(image, x, y, color) end)
end

-- Build one immutable integer stroke. Every writing frame reveals a prefix,
-- so already written pixels never change as the Pencil advances.
local writingPixelPath = {}
local pathSteps = math.ceil(totalLength * 2)
local previousX = math.floor(source.start.x + 0.5)
local previousY = math.floor(source.start.y + 0.5)
for step = 1, pathSteps do
  local point = samplePath(step / pathSteps)
  local x, y = math.floor(point.x + 0.5), math.floor(point.y + 0.5)
  visitIntegerLine(previousX, previousY, x, y, function(pixelX, pixelY)
    local previous = writingPixelPath[#writingPixelPath]
    if not previous or previous.x ~= pixelX or previous.y ~= pixelY then
      writingPixelPath[#writingPixelPath + 1] = { x = pixelX, y = pixelY }
    end
  end)
  previousX, previousY = x, y
end

local function writingEndpointIndex(progress)
  return 1 + math.floor((#writingPixelPath - 1) * progress)
end

local function makeInk(progress, frame, animated)
  local image = Image(source.width, source.height, ColorMode.RGB)
  image:clear()
  if progress <= 0 then return image end
  if not animated then
    for index = 1, writingEndpointIndex(progress) do
      local point = writingPixelPath[index]
      stamp(image, point.x, point.y, packedColor(source.ink))
    end
    return image
  end
  local distance = totalLength * progress
  local steps = math.max(1, math.ceil(distance * 2))
  local function pixel(point)
    -- A two-pixel traveling wave is sampled once into each actual cel.
    local wave = animated and 2 * math.sin((point.x - source.start.x) * 0.075
      + frame * math.pi * 2 / source.animationFrames) or 0
    return math.floor(point.x + 0.5), math.floor(point.y + wave + 0.5)
  end
  local previousX, previousY = pixel(samplePath(0))
  for step = 1, steps do
    local point = samplePath(progress * step / steps)
    local x, y = pixel(point)
    local color = packedColor(source.ink)
    if animated then
      local band = math.floor((point.x - source.start.x) / 18
        + frame * #source.palette / source.animationFrames)
      color = packedColor(source.palette[(band % #source.palette) + 1])
    end
    drawIntegerLine(image, previousX, previousY, x, y, color)
    previousX, previousY = x, y
  end
  return image
end

local function makeSprite(name, count, duration, animated)
  local sprite = Sprite(source.width, source.height, ColorMode.RGB)
  local paper = sprite.layers[1]
  paper.name = "Background"
  paper.isVisible = false
  local ink = sprite:newLayer()
  ink.name = "Hello"
  local palette = Palette(#source.palette + 3)
  palette:setColor(0, Color { r = 0, g = 0, b = 0, a = 0 })
  local colors = { source.paper, source.ink }
  for _, color in ipairs(source.palette) do colors[#colors + 1] = color end
  for index, color in ipairs(colors) do
    palette:setColor(index, Color { r = color[1], g = color[2], b = color[3], a = color[4] })
  end
  sprite:setPalette(palette)
  for index = 1, count do
    local frame = index == 1 and sprite.frames[1] or sprite:newEmptyFrame()
    local milliseconds = animated and duration[index]
      or math.floor(index * duration / count) - math.floor((index - 1) * duration / count)
    frame.duration = milliseconds / 1000
    local background = Image(source.width, source.height, ColorMode.RGB)
    background:clear(packedColor(source.paper))
    sprite:newCel(paper, frame, background, Point(0, 0))
    local progress = animated and 1 or (index - 1) / (count - 1)
    sprite:newCel(ink, frame, makeInk(progress, index - 1, animated), Point(0, 0))
  end
  sprite:saveAs(output .. "/" .. name .. ".aseprite")
  sprite:close()
end

if app.params.writingOnly ~= "true" then
  makeSprite("hello", source.animationFrames, source.animationDurationsMs, true)
  print("READY " .. output .. "/hello.aseprite")
end
makeSprite("hello-writing", source.writingFrames, source.writingTotalDurationMs, false)

local writing = {}
for index = 0, source.writingFrames - 1 do
  local progress = index / (source.writingFrames - 1)
  local endpoint = writingPixelPath[writingEndpointIndex(progress)]
  -- Pixel (x, y) occupies [x, x + 1) × [y, y + 1). The 2px brush
  -- stamps from its rounded top-left, so its actual center is offset by 1px.
  local tip = {
    x = endpoint.x + source.brushSize / 2,
    y = endpoint.y + source.brushSize / 2,
  }
  writing[#writing + 1] = { index = index, progress = progress, tip = tip }
end
local metadata = assert(io.open(output .. "/writing-tips.json", "w"))
metadata:write(json.encode(writing))
metadata:close()
