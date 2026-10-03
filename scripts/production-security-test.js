'use strict';
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { verifyMPSignature } = require('../backend/mpSignature');
const { assertJoinAllowed, createAttemptLimiter, paymentsEnabled, paidCompetitionEnabled } = require('../backend/productionPolicy');
const { validatePayment } = require('../backend/paymentManagerMP');
const { createMatch, addLatePlayer, destroyMatch } = require('../backend/diceManager');
let count = 0;
function test(name, fn) { fn(); count++; console.log(`OK ${name}`); }
const privateRoom = { id: 'r', code: '123456', private: true, status: 'playing', maxPlayers: 5, currentTurnIndex: 0, players: [{ id: 'owner' }] };
test('private room UUID does not authorize entry', () => assert.throws(() => assertJoinAllowed(privateRoom, 'other')));
test('private code requires owner approval while playing', () => assert.throws(() => assertJoinAllowed(privateRoom, 'other', { code: '123456' })));
test('owner approval grants private entry', () => assert.doesNotThrow(() => assertJoinAllowed(privateRoom, 'other', { approved: true })));
test('members can reconnect without a new code', () => assert.doesNotThrow(() => assertJoinAllowed(privateRoom, 'owner')));
test('tournament outsiders cannot join even with approval', () => assert.throws(() => assertJoinAllowed({ ...privateRoom, isTournamentMatch: true }, 'other', { approved: true })));
test('public games accept late joining', () => assert.doesNotThrow(() => assertJoinAllowed({ ...privateRoom, private: false }, 'other')));
test('active stakes reject late joining', () => assert.throws(() => assertJoinAllowed({ ...privateRoom, private: false, betting: { pot: 100 } }, 'other')));
test('waiting private rooms accept their code', () => assert.doesNotThrow(() => assertJoinAllowed({ ...privateRoom, status: 'waiting' }, 'other', { code: '123456' })));
test('sensitive features fail closed', () => { assert.equal(paymentsEnabled({}), false); assert.equal(paidCompetitionEnabled({}), false); });
test('lookup limiter restricts, resets, and bounds keys', () => {
  const allow = createAttemptLimiter({ limit: 2, windowMs: 100, maxKeys: 1 });
  assert(allow('a', 0)); assert(allow('a', 1)); assert(!allow('a', 2)); assert(!allow('b', 3)); assert(allow('b', 101));
});
const secret = 'test-only-secret';
const signed = { secret, dataId: '123', requestId: 'request-123', signature: '' };
signed.signature = `ts=1700000000000,v1=${createHmac('sha256', secret).update('id:123;request-id:request-123;ts:1700000000000;').digest('hex')}`;
test('valid HMAC, including delayed retry, is accepted', () => assert(verifyMPSignature(signed)));
test('forged body resource is rejected', () => assert(!verifyMPSignature({ ...signed, dataId: '124' })));
test('missing secret/signature is rejected', () => { assert(!verifyMPSignature({ ...signed, secret: '' })); assert(!verifyMPSignature({ ...signed, signature: null })); });
test('ambiguous or malformed signature is rejected', () => { assert(!verifyMPSignature({ ...signed, signature: signed.signature + ',ts=1700000000000' })); assert(!verifyMPSignature({ ...signed, signature: 'ts=1700000000000,v1=z' })); });
const order = { id: 'order', currency: 'ARS', amount_cents: '50000', live_mode: false };
const payment = { id: '123', external_reference: 'order', currency_id: 'ARS', transaction_amount: 500, live_mode: false, collector_id: 42 };
test('payment validates the immutable order and seller', () => assert.doesNotThrow(() => validatePayment(payment, order, { MP_COLLECTOR_ID: '42' })));
for (const [key, value] of Object.entries({ external_reference: 'wrong', currency_id: 'USD', transaction_amount: 501, live_mode: true, collector_id: 43 })) {
  test(`reject payment mismatch: ${key}`, () => assert.throws(() => validatePayment({ ...payment, [key]: value }, order, { MP_COLLECTOR_ID: '42' })));
}
test('a second payment against one order requires refund review', () => assert.throws(() => validatePayment(payment, { ...order, payment_id: '456' }, { MP_COLLECTOR_ID: '42' })));
test('late player creates a complete playable state', () => {
  createMatch(privateRoom);
  try { const joined = addLatePlayer('r', { id: 'late', name: 'Late' }); assert(joined.ok); assert(joined.match.players.find(p => p.id === 'late').joinedLate); }
  finally { destroyMatch('r'); }
});
console.log(`${count} production security tests passed`);
