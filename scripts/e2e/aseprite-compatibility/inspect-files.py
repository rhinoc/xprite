"""Read-only structural audit of Aseprite .ase/.aseprite files. No pixels are rewritten."""
import struct, json, sys, hashlib, zlib
from pathlib import Path

def inspect(path):
 b=Path(path).read_bytes(); u16=lambda p:struct.unpack_from('<H',b,p)[0];u32=lambda p:struct.unpack_from('<I',b,p)[0]
 out={'file':str(path),'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'magic':hex(u16(4)),'frames':u16(6),'width':u16(8),'height':u16(10),'depth':u16(12),'flags':u32(14),'speed':u16(18),'transparentIndex':b[28],'layers':[],'frameDetails':[],'chunkCounts':{}}
 p=128
 for frame in range(out['frames']):
  size=u32(p); count=u32(p+12) or u16(p+6); row={'index':frame,'duration':u16(p+8),'cels':[]};q=p+16
  for n in range(count):
   length=u32(q);kind=u16(q+4);t=q+6;key=hex(kind);out['chunkCounts'][key]=out['chunkCounts'].get(key,0)+1
   if kind==0x2004:
    nameLength=u16(t+16);out['layers'].append({'flags':u16(t),'type':u16(t+2),'childLevel':u16(t+4),'blendMode':u16(t+10),'opacity':b[t+12],'name':b[t+18:t+18+nameLength].decode('utf8')})
   elif kind==0x2005:
    cel={'layer':u16(t),'x':struct.unpack_from('<h',b,t+2)[0],'y':struct.unpack_from('<h',b,t+4)[0],'opacity':b[t+6],'type':u16(t+7),'zIndex':struct.unpack_from('<h',b,t+9)[0]}
    if cel['type'] in (0,2):
     cel.update(width=u16(t+16),height=u16(t+18));data=b[t+20:q+length];raw=zlib.decompress(data) if cel['type']==2 else data;cel['decodedBytes']=len(raw);cel['pixelsSha256']=hashlib.sha256(raw).hexdigest()
    elif cel['type']==1:cel['linkedFrame']=u16(t+16)
    row['cels'].append(cel)
   q+=length
  assert q==p+size,(frame,q,p+size)
  out['frameDetails'].append(row);p+=size
 assert p==len(b),(p,len(b))
 return out
results=[inspect(p) for p in sys.argv[1:]]
print(json.dumps(results,indent=2))
