import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.glb':'model/gltf-binary','.css':'text/css; charset=utf-8','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
 const uri=new URL(req.url||'/', 'http://127.0.0.1');
 const normalized=path.posix.normalize(decodeURIComponent(uri.pathname)).replace(/^\/+/, '');
 const target=path.resolve(root,normalized||'index.html');
 if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{
  const body=await fs.readFile(target);
  res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache'});
  res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(8765,'127.0.0.1',()=>console.log('Preview server ready on 8765'));
