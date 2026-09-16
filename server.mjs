import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createStorage } from './lib/storage.mjs';
const project=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif'};
const imageExtensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/avif':'avif'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
async function body(req,max=32*1024*1024){
  let value;
  if(req.body!==undefined){
    value=Buffer.isBuffer(req.body)?req.body.toString():typeof req.body==='string'?req.body:JSON.stringify(req.body);
    if(Buffer.byteLength(value)>max)throw fail('This request is too large.',413);
  }else{
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>max)throw fail('This request is too large.',413);chunks.push(chunk);}
    value=Buffer.concat(chunks).toString();
  }
  try{const input=JSON.parse(value);if(!input||typeof input!=='object'||Array.isArray(input))throw Error();return input;}
  catch{throw fail('The request was not valid.');}
}
export function passwordHash(password){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;}
function checkPassword(password,encoded){const [salt,hash]=encoded.split(':');if(!salt||!hash)return false;const expected=Buffer.from(hash,'hex');const actual=scryptSync(password,salt,64);return expected.length===actual.length&&timingSafeEqual(actual,expected);}
function validImage(bytes,type){if(type==='image/png')return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));if(type==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;if(type==='image/gif')return ['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString());if(type==='image/webp')return bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';if(type==='image/avif')return bytes.subarray(4,8).toString()==='ftyp'&&['avif','avis'].includes(bytes.subarray(8,12).toString());return false;}
export async function createApp({env=process.env,dataDirectory=env.DATA_DIR||path.join(project,'data')}={}){
  if(!env.APP_USERNAME||!env.APP_PASSWORD_HASH)throw Error('Set APP_USERNAME and APP_PASSWORD_HASH in .env before starting Thermalnote. See README.md.');
  if(env.VERCEL&&env.STORAGE_MODE!=='supabase')throw Error('Vercel requires Supabase storage.');
  const storage=await createStorage(env,dataDirectory);
  const sessionAge=7*24*60*60*1000;
  const sessionKey=token=>createHmac('sha256',env.APP_PASSWORD_HASH).update(env.APP_USERNAME+'\0'+token).digest('hex');
  const uploadOrigin=storage.mode==='supabase'?new URL(env.SUPABASE_URL).origin:'';
  const handler=async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: blob:; connect-src 'self' ${uploadOrigin}; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`);
    try{
      const pathname=new URL(req.url,'http://localhost').pathname;
      const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('thermalnote_session='))?.slice(20);
      const authenticated=token&&/^[a-f0-9]{64}$/.test(token)&&(pathname.startsWith('/api/')||pathname.startsWith('/media/'))?await storage.getSession(sessionKey(token)):false;
      const secure=!!env.VERCEL||env.APP_ORIGIN?.startsWith('https:')||env.COOKIE_SECURE==='true';
      const cookie=(value,maxAge)=>`thermalnote_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure?'; Secure':''}`;
      if(req.method!=='GET'&&req.method!=='HEAD'){
        const allowed=[env.APP_ORIGIN,env.VERCEL_URL&&`https://${env.VERCEL_URL}`,env.VERCEL_PROJECT_PRODUCTION_URL&&`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`].filter(Boolean);
        if(!env.VERCEL&&!env.APP_ORIGIN)allowed.push(`http://${req.headers.host}`);
        if(!allowed.includes(req.headers.origin)||req.headers['sec-fetch-site']==='cross-site')throw fail('This request came from another website.',403);
        if(!req.headers['content-type']?.startsWith('application/json'))throw fail('Use a JSON request.',415);
      }
      if(pathname==='/api/login'&&req.method==='POST'){
        const input=await body(req,4096);
        if(await storage.attemptLogin()>10)throw fail('Too many attempts. Please try again in 15 minutes.',429);
        if(typeof input.username!=='string'||typeof input.password!=='string'||input.password.length>1024||!checkPassword(input.password,env.APP_PASSWORD_HASH)||input.username!==env.APP_USERNAME)throw fail('The username or password isn’t right.',401);
        await storage.clearLoginAttempts();const fresh=randomBytes(32).toString('hex');await storage.putSession(sessionKey(fresh),Date.now()+sessionAge);res.setHeader('Set-Cookie',cookie(fresh,sessionAge/1000));return json(res,200,{username:env.APP_USERNAME,storage:storage.mode});
      }
      if(pathname.startsWith('/api/')||pathname.startsWith('/media/')){
        if(!authenticated)throw fail('Please sign in again. Your unsaved draft is still here.',401);
        if(pathname==='/api/session'&&req.method==='GET')return json(res,200,{username:env.APP_USERNAME,storage:storage.mode});
        if(pathname==='/api/logout'&&req.method==='POST'){await storage.deleteSession(sessionKey(token));res.setHeader('Set-Cookie',cookie('',0));return json(res,200,{ok:true});}
        if(pathname==='/api/notes'&&req.method==='GET')return json(res,200,await storage.list());
        if(pathname.startsWith('/api/notes/')){
          const id=pathname.slice('/api/notes/'.length);if(!uuid.test(id))throw fail('Invalid note.');
          const input=await body(req);if(!Number.isSafeInteger(input.version)||input.version<0)throw fail('Invalid note version.');
          if(req.method==='PUT'){if(typeof input.title!=='string'||typeof input.content!=='string')throw fail('A note needs text.');const note=await storage.save({id,title:input.title,content:input.content},input.version);return json(res,200,note);}
          if(req.method==='DELETE'){await storage.remove(id,input.version);return json(res,200,{ok:true});}
        }
        if(pathname==='/api/images/sign'&&req.method==='POST'){
          if(!storage.signUpload)throw fail('Direct upload is unavailable.',400);
          const input=await body(req,4096);
          if(!imageExtensions[input.type]||!Number.isSafeInteger(input.size)||input.size<1||input.size>12*1024*1024)throw fail('Choose a supported image up to 12 MB.');
          const name=`${randomUUID()}.${imageExtensions[input.type]}`;
          return json(res,201,{src:`/media/${name}`,uploadUrl:await storage.signUpload(name)});
        }
        if(pathname==='/api/images'&&req.method==='POST'){
          const input=await body(req,18*1024*1024);if(!imageExtensions[input.type]||typeof input.data!=='string')throw fail('Choose a PNG, JPEG, GIF, WebP, or AVIF image.');
          const bytes=Buffer.from(input.data,'base64');if(bytes.length>12*1024*1024)throw fail('Images can be up to 12 MB.',413);if(!validImage(bytes,input.type))throw fail('That file doesn’t look like a supported image.');
          const name=`${randomUUID()}.${imageExtensions[input.type]}`;await storage.putImage(name,bytes,input.type);return json(res,201,{src:`/media/${name}`});
        }
        if(pathname.startsWith('/media/')&&req.method==='GET'){
          const name=pathname.slice(7);if(!/^[\da-f-]{36}\.(png|jpg|webp|gif|avif)$/.test(name))throw fail('Image not found.',404);if(storage.signDownload){res.writeHead(302,{'Location':await storage.signDownload(name),'Cache-Control':'private, no-store'});return res.end();}const bytes=await storage.getImage(name);res.writeHead(200,{'Content-Type':types[path.extname(name)],'Cache-Control':'private, no-store'});return res.end(bytes);
        }
        throw fail('Not found.',404);
      }
      const publicFiles={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/heat.js':'heat.js','/style.css':'style.css','/favicon.svg':'favicon.svg','/favicon.ico':'favicon.ico','/favicon.png':'favicon.png','/apple-touch-icon.png':'apple-touch-icon.png'};
      if(!publicFiles[pathname]||!['GET','HEAD'].includes(req.method))throw fail('Not found.',404);
      const file=publicFiles[pathname],content=await readFile(path.join(project,'public',file));res.writeHead(200,{'Content-Type':types[path.extname(file)]});res.end(req.method==='HEAD'?undefined:content);
    }catch(error){if(!error.status)console.error('Request failed:',error.code||error.name);json(res,error.status||500,{error:error.status?error.message:'Something went wrong saving your changes. Please try again.'});}
  };
  const server=http.createServer(handler);
  server.on('close',()=>storage.close());return {server,storage,handler};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {server,storage}=await createApp();const port=Number(process.env.PORT||4317);const host=process.env.HOST||'127.0.0.1';
  server.listen(port,host,()=>console.log(`Thermalnote: http://${host}:${port}\nStorage: ${storage.mode}`));
}
