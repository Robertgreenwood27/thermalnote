import { HeatLayer } from './heat.js';
import { $, api, toast, backup, escapeHTML, now } from './core.js';
import { initWorkout, loadWorkout, flushDays } from './workout.js';
import { MarkLayer, anchorMarks, isDue, parseMarks, retention, review, toggleMark, trimRange } from './marks.js';
const title=$('note-title'), editor=$('note-body');
const drafts=(action,value)=>backup('drafts',action,value);
const heat=new HeatLayer([title,editor]);
const marks=new MarkLayer(editor);
const state={notes:new Map(),queues:new Map(),active:null,loaded:false,storage:'local',uploading:0,study:null};
let listTimer,bookmark;
function safeURL(value){try{const url=new URL(value);return ['http:','https:','mailto:'].includes(url.protocol)?url.href:null;}catch{return null;}}
function sanitize(html){const template=document.createElement('template');template.innerHTML=html;const allowed=new Set(['P','DIV','BR','STRONG','B','EM','I','A','IMG','BLOCKQUOTE','UL','OL','LI','PRE','CODE','H1','H2','H3','HR','S','U']);for(const element of [...template.content.querySelectorAll('*')]){if(!allowed.has(element.tagName)){if(['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH','FORM','INPUT','BUTTON'].includes(element.tagName))element.remove();else element.replaceWith(...element.childNodes);continue;}const href=element.getAttribute('href'),src=element.getAttribute('src'),alt=element.getAttribute('alt');for(const attr of [...element.attributes])element.removeAttribute(attr.name);if(element.tagName==='A'){const url=safeURL(href);if(url){element.href=url;element.target='_blank';element.rel='noopener noreferrer';}else element.replaceWith(...element.childNodes);}if(element.tagName==='IMG'){if(src&&(/^\/media\/[\da-f-]{36}\.(png|jpg|webp|gif|avif)$/.test(src)||/^https:\/\//i.test(src))){element.src=src;element.alt=alt||'Note image';element.loading='lazy';element.referrerPolicy='no-referrer';}else element.remove();}}return template.innerHTML;}
function plain(html){const node=document.createElement('div');node.innerHTML=sanitize(html).replace(/<\/(?:p|div|li|h[1-6])>|<br\s*\/?>/gi,' ');return node.textContent||'';}
function cacheDraft(note){drafts('put',{...note}).catch(()=>{const q=queue(note.id);q.draftWarning=true;renderStatus();});}
function queue(id){if(!state.queues.has(id))state.queues.set(id,{generation:0,saved:0,busy:null,timer:null,maxTimer:null,error:null,retryCount:0});return state.queues.get(id);}
function dirty(note){const q=queue(note.id);q.generation++;q.error=q.error?.status===409?q.error:null;note.updated_at=now();cacheDraft(note);schedule(note.id);renderStatus();clearTimeout(listTimer);listTimer=setTimeout(renderList,180);}
function schedule(id){const q=queue(id);clearTimeout(q.timer);q.timer=setTimeout(()=>save(id),450);if(!q.maxTimer)q.maxTimer=setTimeout(()=>save(id),1600);}
async function save(id){const note=state.notes.get(id);if(!note)return;const q=queue(id);clearTimeout(q.timer);clearTimeout(q.maxTimer);q.timer=q.maxTimer=null;if(q.busy)return q.busy;if(q.saved===q.generation||q.error?.status===409)return;const generation=q.generation;const payload={title:note.title,content:note.content,marks:JSON.stringify(note.marks||[]),version:note.version};
  q.busy=(async()=>{renderStatus();try{const result=await api(`/api/notes/${id}`,{method:'PUT',body:JSON.stringify(payload)});note.version=result.version;note.created_at=result.created_at;if(generation===q.generation)note.updated_at=result.updated_at;q.saved=generation;q.error=null;q.retryCount=0;if(q.generation===generation)await drafts('delete',id).catch(()=>{});else cacheDraft(note);renderList();}catch(error){q.error=error;if(![401,409].includes(error.status)&&q.retryCount<4){q.retryCount++;q.timer=setTimeout(()=>save(id),Math.min(30000,1500*2**q.retryCount));}}finally{q.busy=null;renderStatus();if(!q.error&&q.generation>generation)save(id);}})();return q.busy;
}
async function flush(){const pending=[...state.notes.keys()];await Promise.all(pending.map(async id=>{await save(id);const q=queue(id);if(!q.error&&q.saved<q.generation)await save(id);}));return pending.every(id=>{const q=queue(id);return q.saved===q.generation;});}
function renderList(){const list=$('note-list');list.replaceChildren();const moment=Date.now();const notes=[...state.notes.values()].sort((a,b)=>b.updated_at.localeCompare(a.updated_at));$('note-count').textContent=notes.length;for(const note of notes){const button=document.createElement('button');button.className='note-card'+(note.id===state.active?' active':'');button.setAttribute('aria-current',note.id===state.active?'page':'false');const heading=document.createElement('strong');heading.textContent=note.title||'Untitled';const excerpt=document.createElement('p');excerpt.textContent=plain(note.content).replace(/\s+/g,' ').trim().slice(0,160)||(note.content.includes('<img')?'Image':'');excerpt.hidden=!excerpt.textContent;const time=document.createElement('small');time.textContent=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(new Date(note.updated_at));const warm=(note.marks||[]).filter(mark=>isDue(mark,moment)).length;if(warm){const badge=document.createElement('b');badge.className='warm-badge';badge.textContent=`${warm} warm`;time.append(' · ',badge);}button.append(heading,excerpt,time);button.addEventListener('click',()=>{endStudy();selectNote(note.id);});list.append(button);}if(!notes.length){list.innerHTML='<p class="list-empty">No notes</p>';}}
function renderStatus(){const q=state.active?queue(state.active):null;const failed=[...state.queues.values()].find(item=>item.error);const pending=[...state.queues.values()].some(item=>item.saved<item.generation);const saving=[...state.queues.values()].some(item=>item.busy);const status=$('save-status');status.dataset.state=failed?'error':(pending||saving||state.uploading)?'saving':'saved';status.textContent=failed?'Save failed':state.uploading?'Adding image…':(pending||saving)?'Saving…':'Saved';const error=q?.error||failed;$('save-error').hidden=!error&&!q?.draftWarning;if(error){$('save-error').querySelector('span').textContent=error.message;$('retry-save').textContent=error.status===401?'Sign in again':'Try again';$('retry-save').hidden=error.status===409;$('copy-recovery').hidden=error.status!==409;}else if(q?.draftWarning){$('save-error').querySelector('span').textContent='Local draft backup is unavailable. Keep this tab open until changes are saved.';$('retry-save').hidden=false;$('copy-recovery').hidden=true;}}
function updateMetadata(){const note=state.notes.get(state.active);if(!note)return;const words=(editor.innerText||'').trim().split(/\s+/).filter(Boolean).length;$('word-count').textContent=`${words.toLocaleString()} ${words===1?'word':'words'}`;$('crumb-title').textContent=note.title||'Untitled';$('note-date').textContent=new Intl.DateTimeFormat(undefined,{month:'long',day:'numeric',year:'numeric'}).format(new Date(note.created_at));document.title=`${note.title||'Untitled'} · Thermalnote`;}
function capture(){const note=state.notes.get(state.active);if(!note)return;note.title=title.textContent.replace(/[\r\n]+/g,' ');note.content=editor.innerHTML;note.marks=marks.sync();dirty(note);updateMetadata();renderStudy();}
function selectNote(id){if(state.active&&state.active!==id)save(state.active);state.active=id;const note=state.notes.get(id);title.textContent=note.title;editor.innerHTML=sanitize(note.content);heat.reset();
  // Words can move or vanish between sessions. Marks that still find their text come back; the rest are let go.
  const anchored=anchorMarks(note.marks||[],editor.textContent);const lost=(note.marks||[]).length-anchored.length;note.marks=anchored;marks.load(anchored);
  if(lost)toast(`${lost} ${lost===1?'mark':'marks'} lost the words ${lost===1?'it was':'they were'} holding.`);
  $('editor-scroll').scrollTop=0;closeSidebar();renderList();updateMetadata();renderStatus();renderStudy();}
async function newNote(){const id=crypto.randomUUID();const note={id,title:'',content:'',marks:[],created_at:now(),updated_at:now(),version:0};state.notes.set(id,note);dirty(note);selectNote(id);title.focus();return id;}
async function openNotes(){if(!state.loaded){const notes=await api('/api/notes');state.notes=new Map(notes.map(note=>[note.id,{...note,marks:parseMarks(note.marks)}]));const recovered=await drafts('getAll').catch(()=>[]);for(const draft of recovered){draft.marks=parseMarks(draft.marks);const cloud=state.notes.get(draft.id);if(cloud&&cloud.title===draft.title&&cloud.content===draft.content&&JSON.stringify(cloud.marks)===JSON.stringify(draft.marks)){await drafts('delete',draft.id);continue;}state.notes.set(draft.id,draft);const q=queue(draft.id);q.generation=1;if(cloud&&cloud.version!==draft.version||!cloud&&draft.version>0)q.error=Object.assign(new Error('A recovered draft differs from the saved note. Keep it as a new note to preserve both.'),{status:409});else schedule(draft.id);}state.loaded=true;if(recovered.length)toast('Drafts recovered.');}
  if(!state.notes.size)await newNote();else if(!state.active)selectNote([...state.notes.values()].sort((a,b)=>b.updated_at.localeCompare(a.updated_at))[0].id);else{renderStatus();for(const id of state.notes.keys())if(queue(id).error?.status===401){queue(id).error=null;save(id);}}
  renderStudy();registerTools();
}
function showLogin(){endStudy();heat.reset();$('app-view').hidden=true;$('login-view').hidden=false;$('password').value='';$('password').focus();}
$('login-form').addEventListener('submit',async event=>{event.preventDefault();$('login-error').textContent='';$('login-button').disabled=true;try{const session=await api('/api/login',{method:'POST',body:JSON.stringify({username:$('username').value,password:$('password').value})});$('password').value='';await enterApp(session);}catch(error){$('login-error').textContent=error.message;}finally{$('login-button').disabled=false;}});
$('new-note').addEventListener('click',()=>newNote());
for(const element of [title,editor]){element.addEventListener('input',event=>{if(!event.isComposing)capture();});element.addEventListener('compositionend',capture);}
title.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();editor.focus();}});
title.addEventListener('paste',event=>{event.preventDefault();document.execCommand('insertText',false,event.clipboardData.getData('text/plain').replace(/[\r\n]+/g,' '));});
$('save-status').addEventListener('click',()=>flush());
$('retry-save').addEventListener('click',()=>{const failed=[...state.queues.values()].find(q=>q.error);if(failed?.error.status===401){showLogin();return;}for(const[id,q]of state.queues){if(q.error?.status!==409){q.error=null;q.retryCount=0;save(id);}}});
$('copy-recovery').addEventListener('click',async()=>{let id=state.active;if(queue(id).error?.status!==409)id=[...state.queues].find(([,q])=>q.error?.status===409)?.[0];if(!id)return;const old=state.notes.get(id);const copy={...old,id:crypto.randomUUID(),title:(old.title||'Untitled')+' (recovered)',marks:(old.marks||[]).map(mark=>({...mark})),version:0,created_at:now(),updated_at:now()};state.notes.set(copy.id,copy);dirty(copy);selectNote(copy.id);await save(copy.id);if(queue(copy.id).error)return;state.notes.delete(id);state.queues.delete(id);await drafts('delete',id);try{const cloud=(await api('/api/notes')).find(n=>n.id===id);if(cloud)state.notes.set(id,cloud);}catch{}renderList();toast('Recovered copy saved.');});
$('logout').addEventListener('click',async()=>{if(state.uploading){toast('Let the image finish uploading before signing out.');return;}if(!await flush()||!await flushDays()){toast('Finish saving your changes before signing out.');return;}try{await api('/api/logout',{method:'POST',body:'{}'});location.reload();}catch(error){toast(error.message);}});
$('heat-toggle').setAttribute('aria-pressed',String(heat.enabled));$('heat-toggle').lastChild.textContent=heat.enabled?'Heat on':'Heat off';$('heat-toggle').addEventListener('click',()=>{const enabled=heat.toggle();$('heat-toggle').setAttribute('aria-pressed',String(enabled));$('heat-toggle').lastChild.textContent=enabled?'Heat on':'Heat off';});
// One gesture while writing: this matters, and I could not retrieve it. Sorting it is the notebook's job, not yours.
function markSelection(){
  if(state.study)return;
  const note=state.notes.get(state.active);if(!note)return;
  const selection=getSelection();
  note.marks=marks.sync();
  if(!selection.rangeCount||selection.isCollapsed||!editor.contains(selection.anchorNode)||!editor.contains(selection.focusNode))return toast('Select the words you want to come back to.');
  const range=selection.getRangeAt(0);
  const {start,end}=trimRange(marks.text,marks.offset(range.startContainer,range.startOffset),marks.offset(range.endContainer,range.endOffset));
  if(start<0||end<=start)return toast('Select the words you want to come back to.');
  const before=note.marks.length;
  note.marks=marks.marks=toggleMark(note.marks,start,end,marks.text);
  marks.paint();dirty(note);renderStudy();
  toast(note.marks.length>before?'Marked. It will come back warm.':'Released.');
}
function dueQueue(){const moment=Date.now();return [...state.notes.values()].flatMap(note=>(note.marks||[]).filter(mark=>isDue(mark,moment)).map(mark=>({noteId:note.id,markId:mark.id,score:retention(mark,moment)}))).sort((a,b)=>a.score-b.score);}
function renderStudy(){const warm=dueQueue().length;$('study-count').textContent=warm?`${warm} warm`:'All cool';$('study-button').dataset.warm=warm?'yes':'no';}
function startStudy(){
  const queue=dueQueue();
  if(!queue.length)return toast('Everything you marked is cool right now.');
  state.study={queue,index:0,revealed:false};
  document.body.classList.add('studying');editor.contentEditable='false';title.contentEditable='false';$('study-bar').hidden=false;
  showCard();
}
function endStudy(message){
  if(!state.study)return;
  state.study=null;document.body.classList.remove('studying');editor.contentEditable='true';title.contentEditable='true';$('study-bar').hidden=true;
  marks.hidden=marks.focus=null;marks.paint();renderStudy();renderList();
  if(message)toast(message);
}
// The passage is blanked where it sits, so the sentence you wrote around it is still the prompt.
function showCard(){
  const study=state.study;if(!study)return;
  const card=study.queue[study.index];
  if(card.noteId!==state.active)selectNote(card.noteId);
  const note=state.notes.get(card.noteId),mark=(note?.marks||[]).find(item=>item.id===card.markId);
  if(!mark)return nextCard();
  study.revealed=false;marks.hidden=marks.focus=mark.id;marks.paint();
  $('study-position').textContent=`${study.index+1} of ${study.queue.length}`;
  $('study-note').textContent=note.title||'Untitled';
  $('study-reveal').hidden=false;for(const button of document.querySelectorAll('.grade'))button.hidden=true;
  const range=marks.ranges(marks.nodes(),mark.start,mark.end)[0];
  if(range){const scroller=$('editor-scroll'),box=scroller.getBoundingClientRect(),spot=range.getBoundingClientRect();scroller.scrollTop+=spot.top-box.top-box.height/2+spot.height/2;}
}
function revealCard(){const study=state.study;if(!study||study.revealed)return;study.revealed=true;marks.hidden=null;marks.paint();$('study-reveal').hidden=true;for(const button of document.querySelectorAll('.grade'))button.hidden=false;}
function gradeCard(result){
  const study=state.study;if(!study)return;
  if(!study.revealed)return revealCard();
  const card=study.queue[study.index],note=state.notes.get(card.noteId);
  if(note){note.marks=note.marks.map(mark=>mark.id===card.markId?review(mark,result):mark);if(note.id===state.active)marks.marks=note.marks;dirty(note);}
  nextCard();
}
function nextCard(){const study=state.study;if(++study.index>=study.queue.length)return endStudy('That was the whole warm list. The page is cooler than you left it.');showCard();}
$('study-button').addEventListener('click',()=>state.study?endStudy():startStudy());
$('study-exit').addEventListener('click',()=>endStudy());
$('study-reveal').addEventListener('click',revealCard);
for(const button of document.querySelectorAll('.grade'))button.addEventListener('click',()=>gradeCard(button.dataset.result));
$('mark-passage').addEventListener('mousedown',event=>event.preventDefault());
$('mark-passage').addEventListener('click',markSelection);
// Confidence fades on its own, so the page reheats while it sits open.
setInterval(()=>{if(document.hidden||state.study||!state.loaded)return;marks.paint();renderStudy();},60000);
function closeSidebar(){$('sidebar').classList.remove('open');$('sidebar-shade').hidden=true;}
$('open-sidebar').addEventListener('click',()=>{$('sidebar').classList.add('open');$('sidebar-shade').hidden=false;});$('close-sidebar').addEventListener('click',closeSidebar);$('sidebar-shade').addEventListener('click',closeSidebar);
function currentRange(){const selection=getSelection();if(selection.rangeCount&&editor.contains(selection.anchorNode))return selection.getRangeAt(0).cloneRange();const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);return range;}
function restoreRange(range){editor.focus();const selection=getSelection();selection.removeAllRanges();selection.addRange(range);}
for(const[id,command]of [['format-bold','bold'],['format-italic','italic']]){$(id).addEventListener('mousedown',event=>event.preventDefault());$(id).addEventListener('click',()=>{editor.focus();document.execCommand(command);});}
$('add-link').addEventListener('mousedown',()=>bookmark=currentRange());$('add-link').addEventListener('click',()=>{bookmark=bookmark||currentRange();$('link-text').value=bookmark.toString();$('link-url').value='';$('link-error').textContent='';$('link-dialog').showModal();$('link-url').focus();});$('close-link').addEventListener('click',()=>$('link-dialog').close());
$('link-form').addEventListener('submit',event=>{event.preventDefault();const url=safeURL($('link-url').value);if(!url){$('link-error').textContent='Use a full http:// or https:// address.';return;}$('link-dialog').close();restoreRange(bookmark||currentRange());document.execCommand('insertHTML',false,`<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML($('link-text').value||url)}</a> `);bookmark=null;});
editor.addEventListener('click',event=>{const link=event.target.closest('a');if(link&&(event.ctrlKey||event.metaKey)){event.preventDefault();const url=safeURL(link.href);if(url)window.open(url,'_blank','noopener,noreferrer');}});
function textWithLinks(text){return text.split(/(https?:\/\/[^\s<>]+)/g).map((part,index)=>index%2?`<a href="${escapeHTML(part)}" target="_blank" rel="noopener noreferrer">${escapeHTML(part)}</a>`:escapeHTML(part)).join('').replace(/\n/g,'<br>');}
editor.addEventListener('paste',event=>{event.preventDefault();const files=[...event.clipboardData.files];if(files.length){uploadImages(files,currentRange());return;}const html=event.clipboardData.getData('text/html'),text=event.clipboardData.getData('text/plain');document.execCommand('insertHTML',false,html?sanitize(html):textWithLinks(text));});
$('add-image').addEventListener('mousedown',()=>bookmark=currentRange());$('add-image').addEventListener('click',()=>{bookmark=bookmark||currentRange();$('image-input').click();});$('image-input').addEventListener('change',event=>{uploadImages([...event.target.files],bookmark||currentRange());bookmark=null;event.target.value='';});
editor.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();editor.classList.add('dragover');}});editor.addEventListener('dragleave',()=>editor.classList.remove('dragover'));editor.addEventListener('drop',event=>{editor.classList.remove('dragover');if(!event.dataTransfer.files.length)return;event.preventDefault();const range=document.caretRangeFromPoint?.(event.clientX,event.clientY);uploadImages([...event.dataTransfer.files],range&&editor.contains(range.startContainer)?range:currentRange());});
async function uploadImages(files,range){const noteId=state.active;for(const file of files){if(!['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(file.type)){toast('Choose a PNG, JPEG, GIF, WebP, or AVIF image.');continue;}if(file.size>12*1024*1024){toast('Choose an image smaller than 12 MB.');continue;}state.uploading++;renderStatus();try{let result;if(state.storage==='supabase'){result=await api('/api/images/sign',{method:'POST',body:JSON.stringify({type:file.type,size:file.size})});const upload=await fetch(result.uploadUrl,{method:'PUT',headers:{'Content-Type':file.type,'x-upsert':'false'},body:file,signal:AbortSignal.timeout(120000)});if(!upload.ok)throw new Error('The image upload did not finish. Please try again.');}else{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});result=await api('/api/images',{method:'POST',body:JSON.stringify({data,type:file.type})});}const html=`<img src="${escapeHTML(result.src)}" alt="${escapeHTML(file.name||'Note image')}" loading="lazy"><p><br></p>`;if(!state.notes.has(noteId))continue;if(state.active===noteId){const previous=currentRange();restoreRange(editor.contains(range.startContainer)?range:currentRange());document.execCommand('insertHTML',false,html);range=currentRange();if(editor.contains(previous.startContainer))restoreRange(previous);}else{const note=state.notes.get(noteId);note.content+=html;dirty(note);}}catch(error){toast(`Image wasn’t added. ${error.message||'Please try again.'}`);}finally{state.uploading--;renderStatus();}}}
// A diagram sits inside the writing column, which is rarely wide enough to read it. Clicking one opens it over the page: fit to the screen first, then zoom, pan, or go full screen.
const viewer=$('image-viewer'),viewerImage=$('viewer-image');
let viewerScale=1,viewerFit=0,panned=null,dragged=false;
function measureViewer(){const zoomed=viewer.classList.contains('zoomed');viewer.classList.remove('zoomed');const width=viewerImage.style.width;viewerImage.style.width='';viewerFit=viewerImage.getBoundingClientRect().width;viewerImage.style.width=width;viewer.classList.toggle('zoomed',zoomed);}
function setZoom(scale,anchor){const previous=viewerScale;viewerScale=Math.min(8,Math.max(1,scale));const zoomed=viewerScale>1.01;viewer.classList.toggle('zoomed',zoomed);viewerImage.style.width=zoomed?`${Math.round(viewerFit*viewerScale)}px`:'';$('viewer-zoom').textContent=zoomed?`${Math.round(viewerScale*100)}%`:'Zoom in';$('viewer-zoom').setAttribute('aria-pressed',String(zoomed));
  // Keep whatever was under the pointer (or the middle of the screen) under it after the scale changes.
  if(!zoomed){viewer.scrollTo(0,0);return;}const ratio=viewerScale/previous,x=anchor?anchor.x:viewer.clientWidth/2,y=anchor?anchor.y:viewer.clientHeight/2;viewer.scrollLeft=(viewer.scrollLeft+x)*ratio-x;viewer.scrollTop=(viewer.scrollTop+y)*ratio-y;}
function openViewer(image){viewerImage.src=image.currentSrc||image.src;viewerImage.alt=image.alt||'Note image';if(!viewer.open)viewer.showModal();viewerScale=1;if(viewerImage.complete)measureViewer();setZoom(1);}
function closeViewer(){if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});viewer.close();}
function toggleViewerFullscreen(){if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else viewer.requestFullscreen?.().catch(()=>toast('This browser would not go full screen.'));}
viewerImage.addEventListener('load',()=>{measureViewer();setZoom(viewerScale);});
editor.addEventListener('click',event=>{const image=event.target.closest('img');if(!image||event.ctrlKey||event.metaKey||event.altKey)return;event.preventDefault();openViewer(image);});
viewer.addEventListener('click',event=>{if(event.target===viewer)closeViewer();});
viewer.addEventListener('close',()=>{viewerImage.removeAttribute('src');viewer.classList.remove('zoomed');viewerImage.style.width='';viewerScale=1;});
$('viewer-close').addEventListener('click',closeViewer);
$('viewer-full').addEventListener('click',toggleViewerFullscreen);
$('viewer-zoom').addEventListener('click',()=>setZoom(viewerScale>1.01?1:2));
viewerImage.addEventListener('click',event=>{if(dragged){dragged=false;return;}setZoom(viewerScale>1.01?1:2,{x:event.clientX,y:event.clientY});});
viewer.addEventListener('wheel',event=>{if(event.ctrlKey||viewerScale<=1.01){event.preventDefault();setZoom(viewerScale*(event.deltaY<0?1.2:1/1.2),{x:event.clientX,y:event.clientY});}},{passive:false});
viewerImage.addEventListener('pointerdown',event=>{if(viewerScale<=1.01||event.button)return;event.preventDefault();dragged=false;panned={x:event.clientX,y:event.clientY,left:viewer.scrollLeft,top:viewer.scrollTop};viewerImage.setPointerCapture(event.pointerId);});
viewerImage.addEventListener('pointermove',event=>{if(!panned)return;const dx=event.clientX-panned.x,dy=event.clientY-panned.y;if(Math.abs(dx)+Math.abs(dy)>4)dragged=true;viewer.scrollLeft=panned.left-dx;viewer.scrollTop=panned.top-dy;});
for(const type of ['pointerup','pointercancel'])viewerImage.addEventListener(type,()=>{panned=null;});
viewer.addEventListener('keydown',event=>{if(event.ctrlKey||event.metaKey)return;if(event.key==='+'||event.key==='=')setZoom(viewerScale*1.4);else if(event.key==='-')setZoom(viewerScale/1.4);else if(event.key==='0')setZoom(1);else if(event.key.toLowerCase()==='f')toggleViewerFullscreen();else return;event.preventDefault();});
for(const type of ['resize','fullscreenchange'])addEventListener(type,()=>{if(!viewer.open)return;measureViewer();setZoom(viewerScale);});
$('delete-note').addEventListener('click',()=>$('delete-dialog').showModal());$('delete-dialog').addEventListener('close',async()=>{if($('delete-dialog').returnValue!=='delete')return;const id=state.active;await save(id);const note=state.notes.get(id),q=queue(id);if(q.error){toast('Resolve the save issue before deleting this note.');return;}if(state.uploading){toast('Let the image finish uploading before deleting this note.');return;}try{await api(`/api/notes/${id}`,{method:'DELETE',body:JSON.stringify({version:note.version})});clearTimeout(q.timer);clearTimeout(q.maxTimer);state.notes.delete(id);state.queues.delete(id);await drafts('delete',id);state.active=null;if(state.notes.size)selectNote(state.notes.keys().next().value);else await newNote();toast('Note deleted.');}catch(error){toast(error.message);}});
document.addEventListener('keydown',event=>{if(viewer.open)return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();flush();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='n'&&state.loaded){event.preventDefault();newNote();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='m'&&state.loaded){event.preventDefault();markSelection();}
  if(state.study&&!event.ctrlKey&&!event.metaKey&&!event.altKey){if(event.key===' '||event.key==='Enter'){event.preventDefault();revealCard();}else if(['1','2','3'].includes(event.key)){event.preventDefault();gradeCard(['forgot','hard','got'][Number(event.key)-1]);}}
  if(event.key==='Escape'){endStudy();closeSidebar();}});
window.addEventListener('beforeunload',event=>{if(state.uploading||[...state.queues.values()].some(q=>q.saved<q.generation)){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});window.addEventListener('online',()=>{for(const[id,q]of state.queues)if(q.error&&![401,409].includes(q.error.status)){q.error=null;q.retryCount=0;save(id);}});
let toolsRegistered=false;
function registerTools(){if(toolsRegistered||!document.modelContext?.registerTool)return;toolsRegistered=true;try{document.modelContext.registerTool({name:'list_notes',title:'List notes',description:'List titles and IDs in the signed-in notebook.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async()=>({notes:[...state.notes.values()].map(({id,title})=>({id,title}))})});document.modelContext.registerTool({name:'create_note',title:'Create a note',description:'Create and save a note, then open it in the editor.',inputSchema:{type:'object',properties:{title:{type:'string'},text:{type:'string'}},required:['title','text'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async input=>{if(typeof input?.title!=='string'||typeof input?.text!=='string')throw Error('Title and text are required.');const id=await newNote();title.textContent=input.title;editor.innerHTML=textWithLinks(input.text);capture();await save(id);if(queue(id).error)throw queue(id).error;return{id,title:input.title,saved:true};}});}catch{/* Unsupported experimental browser capability does not affect the notebook. */}}
const MODES={workout:'mode-workout',notes:'mode-notes'};
const readMode=()=>{const hash=location.hash.replace(/^#\/?/,'');return MODES[hash]?hash:(localStorage.getItem('thermalnote-mode')||'workout');};
async function setMode(next){
  if(!MODES[next])next='workout';
  try{localStorage.setItem('thermalnote-mode',next);}catch{/* Private browsing still switches, it just will not remember. */}
  if(location.hash!=='#/'+next)history.replaceState(null,'','#/'+next);
  for(const[name,id]of Object.entries(MODES))$(id).hidden=name!==next;
  for(const button of document.querySelectorAll('[data-mode]'))button.setAttribute('aria-current',String(button.dataset.mode===next));
  document.title=next==='workout'?'Lift · Thermalnote':'Thermalnote';
  try{await (next==='workout'?loadWorkout():openNotes());}catch(error){if(error.status===401)showLogin();else toast(error.message);}
}
let started=false;
async function enterApp(session){
  state.storage=session.storage;$('login-view').hidden=true;$('app-view').hidden=false;
  if(!started){started=true;initWorkout({onUnauthorized:showLogin});}
  await setMode(readMode());
}
document.addEventListener('click',event=>{const target=event.target.closest('[data-mode]');if(target)setMode(target.dataset.mode);});
window.addEventListener('hashchange',()=>setMode(readMode()));
api('/api/session').then(enterApp).catch(error=>{if(error.status!==401)$('login-error').textContent=error.message;});
