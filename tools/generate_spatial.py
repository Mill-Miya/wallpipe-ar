"""Build a 1.6 m x 1.0 m wall-aligned three-dimensional pipe probe."""
from pathlib import Path
import numpy as np
import trimesh
from trimesh.visual import TextureVisuals
from trimesh.visual.material import PBRMaterial

OUT=Path(__file__).resolve().parents[1] / "assets" / "spatial-wall-probe.glb"

def tube(a,b,r=.023,sections=24):
    a,b=np.array(a,dtype=float),np.array(b,dtype=float)
    d=b-a
    mesh=trimesh.creation.cylinder(radius=r,height=np.linalg.norm(d),sections=sections)
    transform=trimesh.geometry.align_vectors([0,0,1],d/np.linalg.norm(d))
    if transform is None:transform=np.eye(4)
    transform[:3,3]=(a+b)/2
    mesh.apply_transform(transform)
    return mesh

def ball(p,r):
    mesh=trimesh.creation.icosphere(subdivisions=2,radius=r)
    mesh.apply_translation(p)
    return mesh

def build():
    # The virtual wall is the XY plane (Z=0); positive Z projects toward user.
    group={key:[] for key in ("pipe","joint","wall","support","valve","handle","terminals")}
    def add(k,m):group[k].append(m)
    frame=[(-.8,-.52,0),(.8,-.52,0),(.8,.52,0),(-.8,.52,0)]
    for i in range(4):add("wall",tube(frame[i],frame[(i+1)%4],.007,12))
    for x in (-.6,-.3,0,.3,.6):
        add("wall",tube((x,-.52,0),(x,-.48,0),.004,10))
        add("wall",tube((x,.48,0),(x,.52,0),.004,10))
    path=[(-.70,.20,.10),(-.38,.20,.10),(-.38,.20,.30),(.20,.20,.30),
          (.20,-.18,.30),(.46,-.18,.37),(.46,-.18,.14),(.70,-.18,.14)]
    for a,b in zip(path,path[1:]):add("pipe",tube(a,b,.044))
    for p in path[1:-1]:add("joint",ball(p,.046))
    for x,y,z in [(-.38,.20,.10),(.20,-.18,.30),(.46,-.18,.14)]:
        add("support",tube((x,y,.006),(x,y,z-.047),.008,12))
    add("valve",ball((-.07,.20,.30),.074))
    add("valve",tube((-.07,.20,.30),(-.07,.20,.45),.023,16))
    add("handle",tube((-.20,.20,.45),(.06,.20,.45),.014,14))
    for x in (-.20,.06):add("handle",ball((x,.20,.45),.022))
    add("terminals",ball(path[0],.052));add("terminals",ball(path[-1],.052))
    colors={"pipe":(72,136,151,255),"joint":(44,102,119,255),
            "wall":(137,153,154,255),"support":(133,142,137,255),
            "valve":(180,111,54,255),"handle":(50,69,76,255),
            "terminals":(102,183,166,255)}
    scene=trimesh.Scene()
    for k,parts in group.items():
        mesh=trimesh.util.concatenate(parts)
        mesh.visual=TextureVisuals(material=PBRMaterial(baseColorFactor=colors[k],
                          metallicFactor=.16,roughnessFactor=.58,doubleSided=True))
        scene.add_geometry(mesh,geom_name=k,node_name=k)
    return scene

if __name__=="__main__":
    scene=build()
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_bytes(scene.export(file_type="glb"))
    measured=trimesh.load(OUT,force="scene")
    assert len(measured.geometry)>=5
    assert 1.5<measured.extents[0]<1.8
    assert .40<measured.extents[2]<.60, "Depth variation is required for parallax"
    print(f"Spatial model: {OUT.name}, {OUT.stat().st_size} bytes, extents={measured.extents}")
