"use strict";
const { createHmac, timingSafeEqual } = require('crypto');
function verifyMPSignature({ signature, requestId, dataId, secret }) {
  if (!secret || typeof signature !== 'string' || typeof requestId !== 'string' || typeof dataId !== 'string') return false;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(dataId) || !/^[a-zA-Z0-9_-]{1,128}$/.test(requestId)) return false;
  const parts = signature.split(',').map(part => part.trim().split('='));
  if (parts.length !== 2 || new Set(parts.map(([key]) => key)).size !== 2) return false;
  const fields = Object.fromEntries(parts);
  if (!/^\d{10,16}$/.test(fields.ts || '') || !/^[a-fA-F0-9]{64}$/.test(fields.v1 || '')) return false;
  // MP retries notifications: durable deduplication, no rejection of valid retries by age.
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${fields.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(fields.v1, 'hex'));
}
module.exports = { verifyMPSignature };
