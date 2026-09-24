local inputs = {
 { path=assert(os.getenv('ASEPRITE_FIXTURE_XPRITE'), 'Set ASEPRITE_FIXTURE_XPRITE'), name='xprite' }
}
if app.params['input'] then for _,input in ipairs(inputs) do input.path=app.params['input']..'/'..input.name..'.ase' end end
local root=app.params['output']
assert(root and #root>0, 'Pass --script-param output=...')
local result={}
for _,input in ipairs(inputs) do
 local sprite=app.open(input.path)
 assert(sprite,'Cannot open fixture')
 local info={name=input.name,width=sprite.width,height=sprite.height,layers={},frames={}}
 for i,layer in ipairs(sprite.layers) do info.layers[#info.layers+1]={name=layer.name,visible=layer.isVisible,editable=layer.isEditable,opacity=layer.opacity} end
 for i,frame in ipairs(sprite.frames) do
  local image=Image(sprite.spec)
  image:drawSprite(sprite,frame.frameNumber)
  local filename=root..'/'..input.name..'-'..string.format('%03d',i)..'.png'
  image:saveAs(filename)
  info.frames[#info.frames+1]={index=i-1,duration=math.floor(frame.duration*1000+0.5),file=filename}
 end
 result[#result+1]=info
 sprite:close()
end
local file=assert(io.open(root..'/metadata.json','w'));file:write(json.encode(result));file:close()
print('ASEPRITE_ORACLE_COMPLETE '..#result)
