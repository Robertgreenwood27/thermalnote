// Helpers shared by both modes: the API client, toasts, and offline backup.
export const $=id=>document.getElementById(id);
export const escapeHTML=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const now=()=>new Date().toISOString();
export async function api(path,options={}){const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(25000)});const result=await response.json().catch(()=>({error:response.status===413?'That is too large for one save. Your work is still here.':'The server is temporarily unavailable. Your work is still here.'}));if(!response.ok)throw Object.assign(new Error(result.error||'Could not save. Please try again.'),{status:response.status});return result;}
let toastTimer;
export function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
let backupDB;
function openBackup(){if(backupDB)return backupDB;backupDB=new Promise((resolve,reject)=>{const request=indexedDB.open('thermalnote-drafts',2);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts',{keyPath:'id'});if(!db.objectStoreNames.contains('days'))db.createObjectStore('days',{keyPath:'date'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return backupDB;}
// One transaction per call against either store; reads are read-only.
export async function backup(store,action,value){const db=await openBackup();return new Promise((resolve,reject)=>{const transaction=db.transaction(store,action==='getAll'?'readonly':'readwrite');const request=transaction.objectStore(store)[action](value);transaction.oncomplete=()=>resolve(request.result);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});}
