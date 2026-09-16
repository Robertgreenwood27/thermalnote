import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
export class ConflictError extends Error { constructor(){super('This note changed in another window. Keep this draft as a new note, or reopen the latest version.');this.status=409;} }
export async function createStorage(env, directory) {
  if (env.STORAGE_MODE === 'supabase') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required for Supabase mode.');
    const url=env.SUPABASE_URL.replace(/\/$/,'');
    const headers={apikey:env.SUPABASE_SECRET_KEY};
    if(env.SUPABASE_SECRET_KEY.startsWith('eyJ')) headers.Authorization=`Bearer ${env.SUPABASE_SECRET_KEY}`;
    const request=async(endpoint,options={})=>{
      const response=await fetch(`${url}${endpoint}`,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(20000)});
      if(!response.ok){ const error=await response.json().catch(()=>({})); if(error.code==='TN409')throw new ConflictError();const failure=new Error('Cloud storage is unavailable. Your draft is still here.');failure.status=503;throw failure;}
      return response;
    };
    return {
      mode:'supabase',
      async list(){const results=[];for(let offset=0;;offset+=1000){const page=await(await request(`/rest/v1/thermalnote_notes?deleted_at=is.null&order=updated_at.desc,id.asc&limit=1000&offset=${offset}`)).json();results.push(...page);if(page.length<1000)break;}return results;},
      async save(note,expected){const data=await(await request('/rest/v1/rpc/thermalnote_save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({note_id:note.id,note_title:note.title,note_content:note.content,expected_version:expected})})).json();return Array.isArray(data)?data[0]:data;},
      async remove(id,expected){await request('/rest/v1/rpc/thermalnote_delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({note_id:id,expected_version:expected})});},
      async putImage(name,bytes,type){await request(`/storage/v1/object/thermalnote-images/${name}`,{method:'POST',headers:{'Content-Type':type},body:bytes});},
      async getImage(name){const response=await request(`/storage/v1/object/thermalnote-images/${name}`);return Buffer.from(await response.arrayBuffer());},
      close(){}
    };
  }
  await mkdir(path.join(directory,'uploads'),{recursive:true,mode:0o700});
  const db=new DatabaseSync(path.join(directory,'notes.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY,title TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,version INTEGER NOT NULL,deleted_at TEXT);');
  return {
    mode:'local',
    async list(){return db.prepare('SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC').all();},
    async save(note,expected){
      const now=new Date().toISOString();
      if(expected===0){try{db.prepare('INSERT INTO notes (id,title,content,created_at,updated_at,version) VALUES (?,?,?,?,?,1)').run(note.id,note.title,note.content,now,now);}catch(e){if(e.message.includes('UNIQUE'))throw new ConflictError();throw e;}}
      else{const result=db.prepare('UPDATE notes SET title=?,content=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL').run(note.title,note.content,now,note.id,expected);if(!result.changes)throw new ConflictError();}
      return db.prepare('SELECT * FROM notes WHERE id=?').get(note.id);
    },
    async remove(id,expected){const result=db.prepare('UPDATE notes SET deleted_at=?,version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL').run(new Date().toISOString(),id,expected);if(!result.changes)throw new ConflictError();},
    async putImage(name,bytes){await writeFile(path.join(directory,'uploads',name),bytes,{flag:'wx',mode:0o600});},
    async getImage(name){return readFile(path.join(directory,'uploads',name));},
    close(){db.close();}
  };
}
