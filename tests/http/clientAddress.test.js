import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from '../../src/config.js';
import { clientAddress } from '../../src/http/clientAddress.js';

const request = (forwarded, remote = '10.0.0.9') => ({
  headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded },
  socket: { remoteAddress: remote },
});

describe('client address', () => {
  it('uses the connection address when no proxy is trusted, ignoring a forged header', () => {
    assert.equal(clientAddress(request('1.2.3.4'), false), '10.0.0.9');
    assert.equal(clientAddress(request(undefined), false), '10.0.0.9');
  });

  it('uses the address the trusted proxy forwards', () => {
    assert.equal(clientAddress(request('203.0.113.7'), true), '203.0.113.7');
    assert.equal(clientAddress(request(' 203.0.113.7 , 10.1.1.1'), true), '203.0.113.7');
  });

  it('falls back to the connection address when the header is missing or empty', () => {
    assert.equal(clientAddress(request(undefined), true), '10.0.0.9');
    assert.equal(clientAddress(request('   '), true), '10.0.0.9');
    assert.equal(clientAddress({ headers: {}, socket: {} }, true), 'unknown');
  });

  it('limits how much of the header it keeps', () => {
    assert.equal(clientAddress(request('9'.repeat(500)), true).length, 64);
  });
});

describe('proxy setting', () => {
  it('is off unless it is switched on', () => {
    assert.equal(loadConfig({}).trustProxy, false);
    for (const TRUST_PROXY of ['', 'false', '0', 'FALSE']) assert.equal(loadConfig({ TRUST_PROXY }).trustProxy, false, TRUST_PROXY);
    for (const TRUST_PROXY of ['true', '1', ' True ']) assert.equal(loadConfig({ TRUST_PROXY }).trustProxy, true, TRUST_PROXY);
  });

  it('rejects anything else', () => {
    assert.throws(() => loadConfig({ TRUST_PROXY: 'maybe' }), /TRUST_PROXY must be true or false/);
  });
});
