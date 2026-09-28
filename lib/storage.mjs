import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
export class ConflictError extends Error { constructor(message='This note changed in another window. Keep this draft as a new note, or reopen the latest version.'){super(message);this.status=409;} }
// The account from APP_USERNAME is 'primary'; everything written before profiles existed is theirs.
export const PRIMARY='primary';
// The primary account's images keep their original place in storage; anyone else's live in a folder of their own.
const objectPath=(owner,name)=>owner===PRIMARY?name:`${owner}/${name}`;
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
      async list(owner){const results=[];for(let offset=0;;offset+=1000){const page=await(await request(`/rest/v1/thermalnote_notes?owner=eq.${encodeURIComponent(owner)}&deleted_at=is.null&order=updated_at.desc,id.asc&limit=1000&offset=${offset}`)).json();results.push(...page);if(page.length<1000)break;}return results;},
      async save(owner,note,expected){const data=await(await request('/rest/v1/rpc/thermalnote_owner_save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({note_owner:owner,note_id:note.id,note_title:note.title,note_content:note.content,note_marks:note.marks??'[]',expected_version:expected})})).json();return Array.isArray(data)?data[0]:data;},
      async remove(owner,id,expected){await request('/rest/v1/rpc/thermalnote_owner_delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({note_owner:owner,note_id:id,expected_version:expected})});},
      async listDays(owner){const results=[];for(let offset=0;;offset+=1000){const page=await(await request(`/rest/v1/thermalnote_days?owner=eq.${encodeURIComponent(owner)}&order=date.desc&limit=1000&offset=${offset}`)).json();results.push(...page);if(page.length<1000)break;}return results;},
      async saveDay(owner,date,data,expected){try{const row=await(await request('/rest/v1/rpc/thermalnote_owner_day_save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({day_owner:owner,day_date:date,day_data:data,expected_version:expected})})).json();return Array.isArray(row)?row[0]:row;}catch(error){throw error.status===409?new ConflictError('This day changed in another window. Reopen it to load the latest sets.'):error;}},
      async putImage(owner,name,bytes,type){await request(`/storage/v1/object/thermalnote-images/${objectPath(owner,name)}`,{method:'POST',headers:{'Content-Type':type},body:bytes});},
      async getImage(owner,name){const response=await request(`/storage/v1/object/thermalnote-images/${objectPath(owner,name)}`);return Buffer.from(await response.arrayBuffer());},
      async signUpload(owner,name){
        const data=await(await request(`/storage/v1/object/upload/sign/thermalnote-images/${objectPath(owner,name)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
        return `${url}/storage/v1${data.url}`;
      },
      async signDownload(owner,name){
        const data=await(await request(`/storage/v1/object/sign/thermalnote-images/${objectPath(owner,name)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:120})})).json();
        return `${url}/storage/v1${data.signedURL}`;
      },
      async getSession(key){const data=await(await request(`/rest/v1/thermalnote_sessions?token_hash=eq.${key}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=owner&limit=1`)).json();return data[0]?.owner||null;},
      async putSession(key,expires,owner){await request('/rest/v1/thermalnote_sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token_hash:key,expires_at:new Date(expires).toISOString(),owner})});},
      async deleteSession(key){await request(`/rest/v1/thermalnote_sessions?token_hash=eq.${key}`,{method:'DELETE'});},
      async attemptLogin(){return(await request('/rest/v1/rpc/thermalnote_login_attempt',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();},
      async clearLoginAttempts(){await request('/rest/v1/thermalnote_login_attempts?id=eq.login',{method:'DELETE'});},
      close(){}
    };
  }
  await mkdir(path.join(directory,'uploads'),{recursive:true,mode:0o700});
  const { DatabaseSync } = await import('node:sqlite');
  const db=new DatabaseSync(path.join(directory,'notes.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY,title TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,version INTEGER NOT NULL,deleted_at TEXT,marks TEXT NOT NULL DEFAULT '[]');`);
  // Notebooks written before study marks existed gain the column without touching a word of their text.
  if(!db.prepare("SELECT count(*) AS present FROM pragma_table_info('notes') WHERE name='marks'").get().present)db.exec("ALTER TABLE notes ADD COLUMN marks TEXT NOT NULL DEFAULT '[]'");
  db.exec('CREATE TABLE IF NOT EXISTS days (date TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL);');
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS login_attempts (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);`);
  // Profiles: rows written before them belong to the primary account. Days are rebuilt keyed by
  // (owner,date) in one transaction, so a failure leaves the original table exactly as it was.
  const hasColumn=(table,column)=>!!db.prepare('SELECT count(*) AS present FROM pragma_table_info(?) WHERE name=?').get(table,column).present;
  if(!hasColumn('notes','owner'))db.exec("ALTER TABLE notes ADD COLUMN owner TEXT NOT NULL DEFAULT 'primary'");
  if(!hasColumn('sessions','owner'))db.exec("ALTER TABLE sessions ADD COLUMN owner TEXT NOT NULL DEFAULT 'primary'");
  if(!hasColumn('days','owner')){
    db.exec('BEGIN');
    try{db.exec(`CREATE TABLE days_owned (owner TEXT NOT NULL, date TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY (owner,date));
      INSERT INTO days_owned (owner,date,data,updated_at,version) SELECT 'primary',date,data,updated_at,version FROM days;
      DROP TABLE days; ALTER TABLE days_owned RENAME TO days;`);db.exec('COMMIT');}
    catch(error){db.exec('ROLLBACK');throw error;}
  }
  return {
    mode:'local',
    async getSession(key){return db.prepare('SELECT owner FROM sessions WHERE token_hash=? AND expires_at>?').get(key,Date.now())?.owner||null;},
    async putSession(key,expires,owner){db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());db.prepare('INSERT INTO sessions(token_hash,expires_at,owner) VALUES (?,?,?)').run(key,expires,owner);},
    async deleteSession(key){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(key);},
    async attemptLogin(){const now=Date.now();const value=db.prepare(`INSERT INTO login_attempts(id,count,expires_at) VALUES ('login',1,?)
      ON CONFLICT(id) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,
      expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count`).get(now+900000,now,now);return value.count;},
    async clearLoginAttempts(){db.prepare("DELETE FROM login_attempts WHERE id='login'").run();},
    async list(owner){return db.prepare('SELECT * FROM notes WHERE owner=? AND deleted_at IS NULL ORDER BY updated_at DESC').all(owner);},
    async save(owner,note,expected){
      const now=new Date().toISOString(),marks=note.marks??'[]';
      if(expected===0){try{db.prepare('INSERT INTO notes (owner,id,title,content,marks,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,1)').run(owner,note.id,note.title,note.content,marks,now,now);}catch(e){if(e.message.includes('UNIQUE'))throw new ConflictError();throw e;}}
      else{const result=db.prepare('UPDATE notes SET title=?,content=?,marks=?,updated_at=?,version=version+1 WHERE owner=? AND id=? AND version=? AND deleted_at IS NULL').run(note.title,note.content,marks,now,owner,note.id,expected);if(!result.changes)throw new ConflictError();}
      return db.prepare('SELECT * FROM notes WHERE id=?').get(note.id);
    },
    async remove(owner,id,expected){const result=db.prepare('UPDATE notes SET deleted_at=?,version=version+1 WHERE owner=? AND id=? AND version=? AND deleted_at IS NULL').run(new Date().toISOString(),owner,id,expected);if(!result.changes)throw new ConflictError();},
    async listDays(owner){return db.prepare('SELECT date,data,updated_at,version FROM days WHERE owner=? ORDER BY date DESC').all(owner).map(row=>({...row,data:JSON.parse(row.data)}));},
    async saveDay(owner,date,data,expected){
      const stamp=new Date().toISOString(),text=JSON.stringify(data);
      if(expected===0){try{db.prepare('INSERT INTO days (owner,date,data,updated_at,version) VALUES (?,?,?,?,1)').run(owner,date,text,stamp);}catch(e){if(e.message.includes('UNIQUE'))throw new ConflictError('This day changed in another window. Reopen it to load the latest sets.');throw e;}}
      else{const result=db.prepare('UPDATE days SET data=?,updated_at=?,version=version+1 WHERE owner=? AND date=? AND version=?').run(text,stamp,owner,date,expected);if(!result.changes)throw new ConflictError('This day changed in another window. Reopen it to load the latest sets.');}
      const row=db.prepare('SELECT date,data,updated_at,version FROM days WHERE owner=? AND date=?').get(owner,date);return {...row,data:JSON.parse(row.data)};
    },
    async putImage(owner,name,bytes){const file=path.join(directory,'uploads',objectPath(owner,name));await mkdir(path.dirname(file),{recursive:true,mode:0o700});await writeFile(file,bytes,{flag:'wx',mode:0o600});},
    async getImage(owner,name){return readFile(path.join(directory,'uploads',objectPath(owner,name)));},
    close(){db.close();}
  };
}
