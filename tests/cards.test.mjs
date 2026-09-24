import test from 'node:test';
import assert from 'node:assert/strict';
import { cardsIn, heatName, serializeNote } from '../public/cards.js';
import { DAY, review } from '../public/marks.js';
const at=1_700_000_000_000;

test('cards are read from saved HTML with their confidence',()=>{
 const html=`<p>TACACS+ is</p><div class="card" data-card="a1" data-recalls="2" data-lapses="1" data-reviewed="${at}" data-created="${at}"><div class="card-front">TACACS+</div><div class="card-back">Cisco AAA over TCP</div></div><div class="card" data-card="b2"><div class="card-front">x</div><div class="card-back"></div></div>`;
 const [first,second]=cardsIn(html,at);
 assert.deepEqual(first,{id:'a1',recalls:2,lapses:1,reviewed:at,created:at});
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
