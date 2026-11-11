"""Generate 24 generic 3D pipe-network GLB files. Requires numpy and trimesh."""
from pathlib import Path
import itertools
import numpy as np
import trimesh
from trimesh.visual import TextureVisuals
from trimesh.visual.material import PBRMaterial

OUT = Path(__file__).resolve().parents[1] / 'assets'
OUT.mkdir(exist_ok=True)
COLORS = {
 'water': ((130,177,200,255),(67,224,247,255)),
 'air': ((130,172,176,255),(92,233,179,255)),
 'plant': ((176,161,156,255),(255,174,99,255)),
}
PATHS = {
 'water': ([(-1.39,.45),(-.89,.45),(-.23,.45),(.44,.45),(1.38,.45)], [(-.89,.45),(-.89,-.12),(-.89,-.60),(-.89,-1.06)], (-.23,.45),(-.89,-.60)),
 'air': ([(-1.39,.15),(-.89,.15),(-.23,.15),(.44,.15),(1.38,.15)], [(-.89,.15),(-.89,-.36),(-.89,-.84),(-.89,-1.20)], (-.23,.15),(-.89,-.84)),
 'plant': ([(-1.39,.63),(-.89,.63),(-.23,.63),(.44,.63),(1.38,.63)], [(-.89,.63),(-.89,-.07),(-.89,-.55),(-.89,-1.07)], (-.23,.63),(-.89,-.55))
}

def pipe(a,b,r=.07):
 a,b=np.array(a,dtype=float),np.array(b,dtype=float)
 d=b-a
 m=trimesh.creation.cylinder(radius=r,height=np.linalg.norm(d),sections=16)
 t=trimesh.geometry.align_vectors([0,0,1],d/np.linalg.norm(d))
 if t is None:t=np.eye(4)
 t[:3,3]=(a+b)/2
 m.apply_transform(t)
 return m

def sphere(at,r=.07):
 m=trimesh.creation.icosphere(subdivisions=1,radius=r)
 m.apply_translation(at)
 return m

def generate(mode,v1,v2,flow):
 main,branch,c1,c2=PATHS[mode]
 metal,flowcol=COLORS[mode]
 solids={'pipe':[],'dark':[],'handle':[],'flow':[]}
 def put(tag,obj):solids[tag].append(obj)
 def p(pt,z=.10):return (pt[0],pt[1],z)
 for route in (main,branch):
  for a,b in zip(route,route[1:]):
   put('pipe',pipe(p(a),p(b),.072))
   put('dark',pipe(p(a,.15),p(b,.15),.019))
  for node in route[1:-1]:put('pipe',sphere(p(node),.078))
 for point,opened in ((c1,v1),(c2,v2)):
  x,y=point
  put('dark',sphere((x,y,.18),.14))
  put('pipe',pipe((x,y,.14),(x,y,.30),.105))
  a=0 if opened else np.pi/2
  a+= .30 if point==c2 else 0
  start=(x,y,.32);end=(x+.24*np.cos(a),y+.24*np.sin(a),.32)
  put('handle',pipe(start,end,.028))
  put('handle',sphere(end,.045))
 if flow:
  for route,opened,stop in ((main,v1,c1),(branch,v2,c2)):
   total=sum(np.linalg.norm(np.array(b)-np.array(a)) for a,b in zip(route,route[1:]))
   passed=0.
   for a,b in zip(route,route[1:]):
    length=np.linalg.norm(np.array(b)-np.array(a))
    for t in (.25,.65):
     at=np.array(a)+(np.array(b)-np.array(a))*t
     # No downstream indicators after a closed valve.
     if not opened and np.linalg.norm(at-np.array(route[0]))>np.linalg.norm(np.array(stop)-np.array(route[0])):continue
     put('flow',sphere((at[0],at[1],.198),.033))
    passed+=length
 scene=trimesh.Scene()
 colors={'pipe':metal,'dark':(34,67,87,255),'handle':(250,189,108,255),'flow':flowcol}
 for tag,meshes in solids.items():
  if not meshes:continue
  m=trimesh.util.concatenate(meshes)
  m.visual=TextureVisuals(material=PBRMaterial(baseColorFactor=colors[tag],doubleSided=True,metallicFactor=.35,roughnessFactor=.48))
  scene.add_geometry(m,geom_name=tag,node_name=tag)
 return scene

for mode in COLORS:
 for v1,v2,flow in itertools.product((False,True),repeat=3):
  path=OUT/f'{mode}-{int(v1)}{int(v2)}-{int(flow)}.glb'
  path.write_bytes(generate(mode,v1,v2,flow).export(file_type='glb'))
  print(path.relative_to(OUT.parent),path.stat().st_size)
