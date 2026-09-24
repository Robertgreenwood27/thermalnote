import test from 'node:test';
import assert from 'node:assert/strict';
import { cardsIn, heatName, serializeNote } from '../public/cards.js';
import { DAY, review } from '../public/marks.js';
const at=1_700_000_000_000;

test('cards are read from saved HTML with their confidence',()=>{
 const html=`<p>TACACS+ is</p><div class="card" data-card="a1" data-recalls="2" data-lapses="1" data-reviewed="${at}" data-created="${at}"><div class="card-front">TACACS+</div><div class="card-back">Cisco AAA over TCP</div></div><div class="card" data-card="b2"><div class="card-front">x</div><div class="card-back"></div></div>`;
 const [first,second]=cardsIn(html,at);
 assert.deepEqual(first,{id:'a1',recalls:2,lapses:1,reviewed:at,created:at,hasBack:true});
 assert.equal(second.hasBack,false,'an empty back is noticed');
 assert.equal(second.id,'b2');
 assert.equal(second.recalls,0,'a card with no history starts warm');
 assert.equal(cardsIn('<div class="card-front">no id</div>').length,0);
});

test('a card cools as it is recalled and warms again as evidence ages',()=>{
 const card={id:'a',recalls:0,lapses:0,reviewed:at,created:at};
 assert.equal(heatName(card,at),'red');
 const known=review(review(review(card,'got',at),'got',at),'got',at);
 assert.equal(heatName(known,at),'cool');
 assert.notEqual(heatName(known,at+60*DAY),'cool');
});

test('display state painted on cards never reaches the saved note',()=>{
 const live='<div class="card" data-card="a" data-recalls="0" data-heat="red" data-flipped="" data-editing="" contenteditable="false"><div class="card-front" contenteditable="true">front</div><div class="card-back" contenteditable="true"></div></div>';
 assert.equal(serializeNote(live),'<div class="card" data-card="a" data-recalls="0"><div class="card-front">front</div><div class="card-back"></div></div>');
});

test('each direction keeps its own evidence',()=>{
 const html=`<div class="card" data-card="a" data-recalls="4" data-reviewed="${at}" data-created="${at}" data-rrecalls="1" data-rreviewed="${at-3*DAY}"><div class="card-front">OSPF AD</div><div class="card-back">110</div></div><div class="card" data-card="b" data-recalls="2"><div class="card-front">front only</div><div class="card-back"><br></div></div>`;
 const [forward]=cardsIn(html,at),[back,frontOnly]=cardsIn(html,at,'backward');
 assert.equal(forward.recalls,4);
 assert.equal(back.recalls,1,'backwards reads its own streak');
 assert.equal(back.reviewed,at-3*DAY);
 assert.equal(heatName(forward,at),'cool');
 assert.notEqual(heatName(back,at),'cool','knowing it forwards does not make it known backwards');
 assert.equal(frontOnly.recalls,0,'a card never drilled backwards starts warm that way');
 assert.equal(frontOnly.hasBack,false);
});
