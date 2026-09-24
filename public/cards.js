// A card is a block inside the note: a front, a back, and its own confidence carried on the element.
import { TIER_NAMES, tier } from './marks.js';
export const CARD_ATTRS=['data-card','data-recalls','data-lapses','data-reviewed','data-created'];
// Display-only state. It is painted on while the note is open and never saved.
const TRANSIENT=/ (?:data-(?:heat|flipped|studying|editing|armed)(?:="[^"]*")?|contenteditable="[^"]*"|style="[^"]*")/g;
export const serializeNote=html=>html.replace(TRANSIENT,'');
const freshId=()=>Math.random().toString(36).slice(2,10);
const count=value=>Math.max(0,Math.floor(Number(value))||0);
export function cardState(attrs,now=Date.now()){return{id:attrs['data-card']||'',recalls:count(attrs['data-recalls']),lapses:count(attrs['data-lapses']),reviewed:Number(attrs['data-reviewed'])||now,created:Number(attrs['data-created'])||now};}
// Reads cards straight from saved HTML, so every note can be counted without being opened.
export function cardsIn(html,now=Date.now()){
  const found=[];
  for(const [tag] of String(html).matchAll(/<div\b[^>]*\bdata-card="[^"]*"[^>]*>/g)){
    const attrs={};for(const [,name,value] of tag.matchAll(/\b(data-[a-z]+)="([^"]*)"/g))attrs[name]=value;
    const card=cardState(attrs,now);if(card.id)found.push(card);
  }
  return found;
}
export function heatName(card,now=Date.now()){const level=tier(card,now);return level<TIER_NAMES.length?TIER_NAMES[level]:'cool';}
export function writeState(element,card){element.dataset.card=card.id;element.dataset.recalls=String(card.recalls);element.dataset.lapses=String(card.lapses);element.dataset.reviewed=String(Math.round(card.reviewed));element.dataset.created=String(Math.round(card.created));}
export const readState=element=>cardState(Object.fromEntries(CARD_ATTRS.map(name=>[name,element.getAttribute(name)])));
export function makeCard(front,back,seed={},at=Date.now()){
  const card=document.createElement('div');card.className='card';
  writeState(card,{id:freshId(),recalls:seed.recalls||0,lapses:seed.lapses||0,reviewed:seed.reviewed||at,created:at});
  const sides=['card-front','card-back'].map((name,index)=>{const side=document.createElement('div');side.className=name;const content=index?back:front;if(content)side.append(content);return side;});
  card.append(...sides);prepareCard(card,true);return card;
}
// Cards are atomic in the page and editable inside, so a stray Backspace cannot pour a paragraph into a hidden back.
export function prepareCard(card,editable){card.contentEditable='false';for(const side of card.querySelectorAll(':scope>.card-front,:scope>.card-back'))side.contentEditable=String(editable);}
// Repairs whatever a paste or an old save left behind: two sides each, one id each.
export function normalizeCards(root,editable=true){
  const seen=new Set();
  for(const card of root.querySelectorAll('.card')){
    if(card.parentElement.closest('.card')){card.replaceWith(...card.childNodes);continue;}
    for(const name of ['card-front','card-back'])if(!card.querySelector(`:scope>.${name}`)){const side=document.createElement('div');side.className=name;if(name==='card-front')card.prepend(side);else card.append(side);}
    const state=readState(card);if(!state.id||seen.has(state.id))state.id=freshId();seen.add(state.id);writeState(card,state);
    prepareCard(card,editable);
  }
}
export function paintCards(root,now=Date.now()){for(const card of root.querySelectorAll('.card'))card.dataset.heat=heatName(readState(card),now);}
const hasContent=node=>node.nodeType===Node.TEXT_NODE?/\S/.test(node.data):node.nodeName==='IMG'||/\S/.test(node.textContent)||!!node.querySelector?.('img,.card');
function dropEmpty(element){if(element?.isConnected&&element.nodeType===Node.ELEMENT_NODE&&!element.classList.contains('card')&&!hasContent(element))element.remove();}
// Puts a card at a caret position, splitting the block around it so the card stands on its own line.
export function placeCard(root,range,card){
  const marker=document.createElement('span');range.insertNode(marker);
  let top=marker;while(top.parentNode!==root)top=top.parentNode;
  if(top===marker){marker.replaceWith(card);}
  else{
    const tail=document.createRange();tail.setStartAfter(marker);tail.setEnd(top,top.childNodes.length);
    const after=top.cloneNode(false);after.append(tail.extractContents());marker.remove();
    top.after(card);card.after(after);dropEmpty(top);dropEmpty(after);
  }
  if(!card.nextSibling||card.nextSibling.classList?.contains('card')){const line=document.createElement('div');line.append(document.createElement('br'));card.after(line);}
  return card;
}
export function sideOf(node,root){const element=node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement;const side=element?.closest('.card-front,.card-back');return side&&root.contains(side)?side:null;}
function edgeText(node,last){const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let found=null,text;while((text=walker.nextNode())){if(!/\S/.test(text.data))continue;found=text;if(!last)break;}return found;}
function trimEdges(node){const first=edgeText(node,false),last=edgeText(node,true);if(first)first.data=first.data.trimStart();if(last)last.data=last.data.trimEnd();}
// Ctrl+B inside a card: whatever is selected crosses to the other side.
export function moveToOtherSide(range,side){
  const card=side.parentElement,other=card.querySelector(side.classList.contains('card-front')?':scope>.card-back':':scope>.card-front');
  const moved=range.extractContents();trimEdges(moved);trimEdges(side);
  if(hasContent(other)){const line=document.createElement('div');line.append(moved);other.append(line);}else{other.replaceChildren(moved);}
  for(const element of [...side.querySelectorAll('div,p')].reverse())dropEmpty(element);
  if(!side.textContent.trim()&&!side.querySelector('img'))side.replaceChildren();
  return other;
}
// The same gesture that makes a card releases it back into the page.
export function unwrapCard(card){
  const parts=[];
  for(const side of card.querySelectorAll(':scope>.card-front,:scope>.card-back')){if(!hasContent(side))continue;const block=document.createElement('div');block.append(...side.childNodes);parts.push(block);}
  card.replaceWith(...parts);return parts;
}
