#!/usr/bin/env python3
"""Original profile/loft valve meshes for WallPipe AR, free of third-party CAD."""
from pathlib import Path
import io, math
import numpy as np
import trimesh as tm
from trimesh.visual import TextureVisuals
from trimesh.visual.material import PBRMaterial
OUT=Path(__file__).resolve().parents[1]/'assets'/'valves'
OUT.mkdir(parents=True,exist_ok=True)
PALETTE={
 'body':(118,139,146,255),'metal':(168,181,180,255),
 'brass':(184,143,83,255),'dark':(48,61,64,255),
 'grip':(54,93,117,255),'seat':(38,43,44,255)}
def revolution(profile,axis='y',sections=28):
 m=tm.creation.revolve([[radius,pos] for pos,radius in profile],sections=sections,cap=True)
 if axis=='y':m.apply_transform(tm.transformations.rotation_matrix(math.pi/2,[1,0,0]))
 return m
def shift(mesh,x=0,y=0,z=0):
 mesh.apply_translation((x,y,z));return mesh
def cylinder(r,h,x=0,y=0,z=0,axis='z',sections=16):
 m=tm.creation.cylinder(radius=r,height=h,sections=sections)
 if axis=='y':m.apply_transform(tm.transformations.rotation_matrix(math.pi/2,[1,0,0]))
 return shift(m,x,y,z)
def segment(a,b,r=.006):
 a=np.asarray(a,dtype=float);b=np.asarray(b,dtype=float);d=b-a
 m=tm.creation.cylinder(radius=r,height=np.linalg.norm(d),sections=9)
 m.apply_transform(tm.geometry.align_vectors((0,0,1),d))
 m.apply_translation((a+b)/2);return m
def elliptical_loft(profile,n=28):
 v=[];f=[]
 for z,rx,ry in profile:
  for i in range(n):
   a=2*math.pi*i/n;v.append((rx*math.cos(a),ry*math.sin(a),z))
 for k in range(len(profile)-1):
  for j in range(n):
   a=k*n+j;b=k*n+(j+1)%n;c=(k+1)*n+(j+1)%n;d=(k+1)*n+j
   f.extend(((a,b,c),(a,c,d)))
 for i in range(1,n-1):f.extend(((0,i+1,i),((len(profile)-1)*n,(len(profile)-1)*n+i,(len(profile)-1)*n+i+1)))
 m=tm.Trimesh(vertices=v,faces=f,process=False);m.fix_normals();return m
def outline(points,h=.018):
 n=len(points);v=[(x,y,-h/2) for x,y in points]+[(x,y,h/2) for x,y in points];f=[]
 for i in range(1,n-1):f.extend(((0,i+1,i),(n,n+i,n+i+1)))
 for i in range(n):
  j=(i+1)%n;f.extend(((i,j,n+j),(i,n+j,n+i)))
 m=tm.Trimesh(vertices=v,faces=f,process=False);m.fix_normals();return m
def handwheel(r=.080,spokes=5):
 v=[];f=[];n=36;q=8
 for i in range(n):
  a=2*math.pi*i/n
  for j in range(q):
   b=2*math.pi*j/q;rad=r+.008*math.cos(b)
   v.append((rad*math.cos(a),rad*math.sin(a),.008*math.sin(b)))
 for i in range(n):
  for j in range(q):
   a=i*q+j;b=((i+1)%n)*q+j;c=((i+1)%n)*q+(j+1)%q;d=i*q+(j+1)%q
   f.extend(((a,b,c),(a,c,d)))
 pieces=[('dark',tm.Trimesh(vertices=v,faces=f,process=False)),('metal',cylinder(.020,.019))]
 for i in range(spokes):
  a=2*math.pi*i/spokes;pieces.append(('dark',segment((0,0,0),(r*math.cos(a),r*math.sin(a),0),.006)))
 return pieces
def lever(blue=True):
 return [('metal',cylinder(.023,.015)),
  ('brass',outline([(.01,-.019),(.050,-.019),(.095,-.012),(.116,-.010),(.116,.01),(.095,.012),(.05,.019),(.01,.019)],.013)),
  ('grip' if blue else 'dark',outline([(.093,-.014),(.168,-.017),(.184,-.013),(.19,-.005),(.19,.005),(.184,.013),(.168,.017),(.093,.014)],.023))]
def flange(y,r=.082):
 p=[('metal',shift(revolution([(-.015,0),(-.015,r*.87),(-.008,r),(.008,r),(.015,r*.87),(.015,0)]),y=y))]
 for i in range(8):
  a=i*math.pi/4;p.append(('metal',cylinder(.0055,.008,x=r*.74*math.cos(a),y=y+.017,z=r*.74*math.sin(a),axis='y',sections=6)))
 return p
def common():
 parts=flange(-.104)+flange(.104)
 parts.append(('metal',revolution([(-.128,0),(-.128,.043),(-.106,.051),(-.078,.06),(.078,.06),(.106,.051),(.128,.043),(.128,0)])))
 return parts
def assemble(kind):
 body=[];act=[];disc=[];pivot=0
 if kind=='ball':
  body=common()+[
   ('brass',revolution([(-.084,0),(-.084,.059),(-.062,.073),(-.018,.083),(.018,.083),(.062,.073),(.084,.059),(.084,0)],sections=36)),
   ('brass',elliptical_loft([(.043,.046,.039),(.065,.055,.047),(.088,.042,.038),(.105,.028,.028)])),
   ('metal',cylinder(.017,.082,z=.132))]
  act=lever();pivot=.176
 elif kind=='gate':
  body=common()+[
   ('body',revolution([(-.087,0),(-.087,.064),(-.055,.083),(0,.091),(.055,.083),(.087,.064),(.087,0)])),
   ('body',elliptical_loft([(.048,.060,.050),(.074,.072,.056),(.095,.063,.051),(.113,.046,.042),(.145,.036,.034)])),
   ('metal',elliptical_loft([(.142,.049,.041),(.158,.047,.040),(.164,.033,.030)])),
   ('metal',cylinder(.016,.10,z=.207)),('dark',cylinder(.022,.025,z=.240))]
  for i in range(4):
   a=i*math.pi/2;body.append(('metal',cylinder(.007,.01,x=.045*math.cos(a),y=.037*math.sin(a),z=.163,sections=6)))
  act=handwheel();pivot=.260
 elif kind=='butterfly':
  body=[
   ('body',revolution([(-.034,0),(-.034,.077),(-.026,.105),(-.010,.112),(.010,.112),(.026,.105),(.034,.077),(.034,0)],sections=40)),
   ('seat',tm.creation.annulus(r_min=.063,r_max=.079,height=.055,sections=40,transform=tm.transformations.rotation_matrix(math.pi/2,[1,0,0]))),
   ('body',elliptical_loft([(.067,.026,.030),(.097,.031,.030),(.128,.024,.025)])),
   ('metal',cylinder(.014,.05,z=.15)),('dark',cylinder(.03,.013,z=.17))]
  body+=flange(-.050,.080)+flange(.050,.080)
  act=lever(False);pivot=.186
  disc=[('metal',cylinder(.070,.010,axis='y',sections=36)),
        ('dark',segment((0,-.01,-.07),(0,-.01,.07),.008))]
 elif kind=='control':
  body=common()+[
   ('body',revolution([(-.088,0),(-.088,.061),(-.067,.079),(-.040,.096),(0,.105),(.040,.096),(.067,.079),(.088,.061),(.088,0)],sections=36)),
   ('metal',elliptical_loft([(.066,.053,.050),(.091,.061,.056),(.109,.047,.043),(.142,.030,.030),(.156,.027,.027)])),
   ('metal',cylinder(.015,.10,z=.203)),('dark',cylinder(.02,.023,z=.243))]
  act=handwheel(.073,4);pivot=.256
 else:raise ValueError(kind)
 scene=tm.Scene()
 for label,parts,height in [('body',body,0),('actuator',act,pivot),('disc',disc,0)]:
  grouped={}
  for material,mesh in parts:grouped.setdefault(material,[]).append(mesh)
  for mat,meshes in grouped.items():
   merged=tm.util.concatenate(meshes)
   merged.visual=TextureVisuals(material=PBRMaterial(baseColorFactor=PALETTE[mat],metallicFactor=.55 if mat!='grip' else .08,roughnessFactor=.52,doubleSided=True))
   tra=np.eye(4);tra[2,3]=height
   scene.add_geometry(merged,geom_name=label+'_'+mat,node_name=label+'_'+mat,transform=tra)
 out=OUT/(kind+'.glb');out.write_bytes(scene.export(file_type='glb'))
 source=tm.load_scene(io.BytesIO(out.read_bytes()),file_type='glb')
 names=list(source.graph.nodes)
 assert any(x.startswith('actuator_') for x in names)
 if kind=='butterfly':assert any(x.startswith('disc_') for x in names)
 count=sum(len(m.faces) for m in source.geometry.values())
 assert 500<count<24000,(kind,count)
 print(kind,out.stat().st_size,'bytes',count,'triangles')
for kind in ['ball','gate','butterfly','control']:assemble(kind)
