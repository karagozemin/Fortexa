/**
 * Tests for POST /api/stellar/submit-signed
 *
 * Covers basic acceptance criteria:
 *  1. Valid signed XDR → forwards to Horizon (200)
 *  2. Missing signedXdr → 400 validation error
 *  3. Horizon rejects valid XDR → 400 with result_codes preserved
 *  4. Invalid JSON → 400
 *
 * Note: XDR source verification (PR #45) has been removed.
 * Re-integrate if needed in a future PR.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock the Stellar client submit
vi.mock('@/lib/stellar/client', () => ({
  submitSignedXdr: vi.fn(),
}));

import { POST } from './route';
import { submitSignedXdr } from '@/lib/stellar/client';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, sessionKey = 'sess-abc') {
  return new NextRequest('http://localhost/api/stellar/submit-signed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-session-key': sessionKey,
    },
    body: JSON.stringify(body),
  });
}

// ── Route tests ───────────────────────────────────────────────────────────────

describe('POST /api/stellar/submit-signed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('1. returns 200 and Horizon result when XDR is valid', async () => {
    vi.mocked(submitSignedXdr).mockResolvedValue({ hash: 'txhash123', ledger: 1 });

    const res = await POST(makeRequest({ signedXdr: 'valid-xdr' }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.hash).toBe('txhash123');
    expect(submitSignedXdr).toHaveBeenCalledWith('valid-xdr');
  });

  it('2. returns 400 when signedXdr is missing from body', async () => {
    const res = await POST(makeRequest({ sessionKey: 'sess-abc' }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/signedXdr/i);
    expect(submitSignedXdr).not.toHaveBeenCalled();
  });

  it('3. returns 400 when signedXdr is empty string', async () => {
    const res = await POST(makeRequest({ signedXdr: '' }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/signedXdr/i);
    expect(submitSignedXdr).not.toHaveBeenCalled();
  });

  it('4. returns 400 with invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/stellar/submit-signed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/JSON/i);
  });

  it('5. returns 400 with Horizon result_codes when Horizon rejects a valid tx', async () => {
    vi.mocked(submitSignedXdr).mockRejectedValue({
      response: {
        data: {
          extras: { result_codes: { transaction: 'tx_bad_seq' } },
        },
      },
    });

    const res = await POST(makeRequest({ signedXdr: 'valid-xdr' }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.resultCodes?.transaction).toBe('tx_bad_seq');
    expect(data.error).toMatch(/Horizon/i);
  });

  it('6. returns 500 on unexpected error', async () => {
    vi.mocked(submitSignedXdr).mockRejectedValue(new Error('Unknown error'));

    const res = await POST(makeRequest({ signedXdr: 'valid-xdr' }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toMatch(/Internal server error/i);
  });

  it('7. accepts sessionKey from body or header', async () => {
    vi.mocked(submitSignedXdr).mockResolvedValue({ hash: 'tx1', ledger: 1 });

    // Test with header
    const req1 = makeRequest({ signedXdr: 'xdr1' }, 'sess-from-header');
    const res1 = await POST(req1);
    expect(res1.status).toBe(200);

    // Test with body
    const req2 = makeRequest({ signedXdr: 'xdr2', sessionKey: 'sess-from-body' });
    const res2 = await POST(req2);
    expect(res2.status).toBe(200);
  });
});