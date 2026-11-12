#!/usr/bin/env python3
"""Author original hollow pipe meshes and swept/blended fittings for WallPipe AR.
Unit radius=1. This is illustrative geometry, not pressure-rated engineering CAD.
"""
from pathlib import Path
import io, math
import numpy as np
import trimesh as tm
from skimage.measure import marching_cubes
from trimesh.visual import TextureVisuals
from trimesh.visual.material import PBRMaterial
OUT=Path(__file__).resolve().parents[1]/'assets'/'pipes'
OUT.mkdir(parents=True,exist_ok=True)
COLORS={'steel':(140,160,162,255),'fitting':(163,175,173,255),'bracket':(90,108,113,255),'fastener':(173,152,118,255)}
scene=tm.Scene()
def add(name,m,mat='steel'):
 assert len(m.faces)>0,name
 m.visual=TextureVisuals(material=PBRMaterial(baseColorFactor=COLORS[mat],metallicFactor=.55,roughnessFactor=.53,doubleSided=True))
 scene.add_geometry(m,geom_name=name,node_name=name)
def sweep_annulus(name,points,tangents,outer=1.,inner=.75,radial=22):
 verts=[];faces=[];pts=np.asarray(points,float);ts=np.asarray(tangents,float)
 for rad in (outer,inner):
  for p,t in zip(pts,ts):
   t=t/np.linalg.norm(t)
   ref=np.array((0.,0.,1.)) if abs(t[2])<.9 else np.array((0.,1.,0.))
   u=np.cross(t,ref);u/=np.linalg.norm(u);v=np.cross(t,u)
   for j in range(radial):
    a=2*math.pi*j/radial
    verts.append(p+rad*(u*math.cos(a)+v*math.sin(a)))
 n=len(pts);off=n*radial
 for surf in range(2):
  for k in range(n-1):
   for j in range(radial):
    j2=(j+1)%radial;a=surf*off+k*radial+j;b=surf*off+k*radial+j2
    c=surf*off+(k+1)*radial+j2;d=surf*off+(k+1)*radial+j
    faces.extend(((a,b,c),(a,c,d)) if surf==0 else ((a,c,b),(a,d,c)))
 for k in (0,n-1):
  for j in range(radial):
   j2=(j+1)%radial;a=k*radial+j;b=k*radial+j2;c=off+k*radial+j2;d=off+k*radial+j
   faces.extend(((a,b,c),(a,c,d)) if k==0 else ((a,c,b),(a,d,c)))
 m=tm.Trimesh(vertices=verts,faces=faces,process=False);m.fix_normals();add(name,m)
def annular_profile(name,profile,mat='fitting',radial=30):
 v=[];f=[];n=len(profile)
 for surf in (1,2):
  for y,outer,inner in profile:
   r=outer if surf==1 else inner
   for j in range(radial):
    a=j*2*math.pi/radial;v.append((r*math.cos(a),y,r*math.sin(a)))
 off=n*radial
 for shell in (0,1):
  for k in range(n-1):
   for j in range(radial):
    j2=(j+1)%radial;a=shell*off+k*radial+j;b=shell*off+k*radial+j2
    c=shell*off+(k+1)*radial+j2;d=shell*off+(k+1)*radial+j
    f.extend(((a,b,c),(a,c,d)) if shell==0 else ((a,c,b),(a,d,c)))
 for k in (0,n-1):
  for j in range(radial):
   j2=(j+1)%radial;a=k*radial+j;b=k*radial+j2;c=off+k*radial+j2;d=off+k*radial+j
   f.extend(((a,b,c),(a,c,d)) if k==0 else ((a,c,b),(a,d,c)))
 m=tm.Trimesh(vertices=v,faces=f,process=False);m.fix_normals();add(name,m,mat)
def smin(a,b,k):
 h=np.clip(.5+.5*(b-a)/k,0,1)
 return np.minimum(a,b)-k*h*(1-h)
def junction(name,arms,step=.19,smooth=.30):
 grid=np.arange(-3.2,3.2+step*.49,step)
 x,y,z=np.meshgrid(grid,grid,grid,indexing='ij')
 def sdf(axis,lo,hi,r):
  t={'x':x,'y':y,'z':z}[axis]
  if axis=='x':rad=np.sqrt(y*y+z*z)
  elif axis=='y':rad=np.sqrt(x*x+z*z)
  else:rad=np.sqrt(x*x+y*y)
  return np.maximum(rad-r,np.maximum(lo-t,t-hi))
 outer=None;inner=None
 for axis,lo,hi,r in arms:
  o=sdf(axis,lo,hi,r);i=sdf(axis,lo-.035,hi+.035,r*.74)
  outer=o if outer is None else smin(outer,o,smooth)
  inner=i if inner is None else smin(inner,i,smooth*.48)
 v,f,_,_=marching_cubes(np.maximum(outer,-inner),0,spacing=(step,step,step))
 m=tm.Trimesh(vertices=v+grid[0],faces=f,process=False);m.fix_normals();add(name,m,'fitting')
sweep_annulus('straight_shell',[(0,-1,0),(0,-.6,0),(0,.6,0),(0,1,0)],[(0,1,0)]*4,radial=28)
R=2.45;angles=np.linspace(-math.pi/2,0,21)
center=np.array((-R,R,0.))
points=[center+np.array((R*math.cos(t),R*math.sin(t),0)) for t in angles]
tangents=[(-math.sin(t),math.cos(t),0) for t in angles]
sweep_annulus('elbow_shell',points,tangents,radial=24)
junction('tee_shell',[('x',-2.35,2.35,1.),('y',0,2.35,.76)])
junction('tee_full_shell',[('x',-2.35,2.35,1.),('y',0,2.35,1.)])
junction('tee_reduced_shell',[('x',-2.35,2.35,1.),('y',0,2.35,.61)])
junction('cross_shell',[('x',-2.35,2.35,1.),('y',-2.35,2.35,1.)],step=.21)
annular_profile('reducer_shell',[(-1.30,1.,.74),(-1.10,1.04,.74),(-.90,1.04,.74),(-.63,.97,.74),(.67,.77,.55),(.90,.76,.55),(1.10,.76,.55),(1.30,.72,.54)])
annular_profile('socket_shell',[(-.72,1.,.74),(-.54,1.04,.74),(-.43,1.18,.73),(-.31,1.18,.73),(-.21,1.05,.74),(.30,1.05,.74),(.45,1.15,.74),(.55,1.15,.74),(.70,1.,.74)],radial=28)
annular_profile('flange_shell',[(-.31,1.,.70),(-.23,1.08,.70),(-.16,1.36,.70),(.16,1.36,.70),(.23,1.08,.70),(.31,1.,.70)],radial=32)
bolts=[]
for end in (-.24,.24):
 for k in range(8):
  a=k*math.tau/8
  m=tm.creation.cylinder(radius=.09,height=.07,sections=6)
  m.apply_transform(tm.geometry.align_vectors((0,0,1),(0,1 if end>0 else -1,0)))
  m.apply_translation((1.11*math.cos(a),end,1.11*math.sin(a)))
  bolts.append(m)
add('flange_fasteners',tm.util.concatenate(bolts),'fastener')
annular_profile('end_connector_shell',[(-.65,1.,.72),(-.49,1.07,.72),(-.34,1.22,.71),(-.23,1.22,.71),(-.07,1.04,.71),(.38,1.04,.71),(.55,1.10,.70),(.67,1.04,.70)],radial=28)
ts=np.linspace(-.87*math.pi,.87*math.pi,25)
strap=[(1.16*math.cos(t),0,1.16*math.sin(t)) for t in ts]
directions=[(-math.sin(t),0,math.cos(t)) for t in ts]
sweep_annulus('clamp_strap',strap,directions,outer=.13,inner=.018,radial=10)
annular_profile('mount_socket',[(-.14,.23,.13),(-.09,.28,.13),(.08,.28,.13),(.14,.23,.13)],'bracket',radial=16)
out=OUT/'pipe-kit.glb';out.write_bytes(tm.exchange.gltf.export_glb(scene,include_normals=True))
# Preserve face normals explicitly for reliable lighting on mobile glTF renderers.
import struct, json
raw=out.read_bytes()
json_size=struct.unpack_from('<I',raw,12)[0]
doc=json.loads(raw[20:20+json_size])
assert all('NORMAL' in p['attributes'] for m in doc['meshes'] for p in m['primitives']), 'Missing normals in GLB'
loaded=tm.load_scene(io.BytesIO(raw),file_type='glb')
required={'straight_shell','elbow_shell','tee_shell','tee_full_shell','tee_reduced_shell','cross_shell','reducer_shell','socket_shell','flange_shell','flange_fasteners','end_connector_shell','clamp_strap','mount_socket'}
assert required.issubset(set(loaded.graph.nodes)),required-set(loaded.graph.nodes)
for mesh in loaded.geometry.values():assert mesh.is_watertight and mesh.is_winding_consistent
print('PIPE KIT',out.stat().st_size,'bytes',sum(len(g.faces) for g in loaded.geometry.values()),'triangles')
