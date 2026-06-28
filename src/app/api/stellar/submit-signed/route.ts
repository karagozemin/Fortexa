/**
 * POST /api/stellar/submit-signed
 *
 * Accepts a signed XDR, verifies the source account matches the session
 * wallet, then submits to Horizon. Horizon result-code enrichment is
 * preserved for valid-but-rejected transactions.
 *
 * Security: defense-in-depth only — no signing or key custody here.
 *
 * Issue: #26
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWalletForSession } from '@/lib/storage/user-wallet-store';
import { submitSignedXdr } from '@/lib/stellar/client';

export async function POST(req: NextRequest) {
  // ── 1. Parse body ────────────────────────────────────────────────────────
  let signedXdr: string;
  let sessionKey: string;

  try {
    const body = await req.json();
    signedXdr = body?.signedXdr;
    sessionKey = body?.sessionKey ?? req.headers.get('x-session-key') ?? '';

    if (typeof signedXdr !== 'string' || !signedXdr.trim()) {
      return NextResponse.json(
        { error: 'Missing or invalid signedXdr in request body.' },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

      malformed_xdr:    400,
      wrong_network:    400,
      source_mismatch:  400,
      missing_wallet:   400,
    };
    return NextResponse.json(
      { error: verification.detail, reason: verification.reason },
      { status: statusMap[verification.reason] },
    );
  }

  // ── 3. Submit to Horizon ─────────────────────────────────────────────────
  try {
    const result = await submitSignedXdr(signedXdr);
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    // Horizon rejected a structurally valid transaction — preserve result codes
    if (isHorizonError(err)) {
      return NextResponse.json(
        {
          error: 'Horizon rejected the transaction.',
          resultCodes: err.response?.data?.extras?.result_codes ?? null,
          horizonDetail: err.response?.data ?? null,
        },
        { status: 400 },
      );
    }
    console.error('[submit-signed] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error during submission.' },
      { status: 500 },
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface HorizonError {
  response?: {
    data?: {
      extras?: { result_codes?: unknown };
      [key: string]: unknown;
    };
  };
}

function isHorizonError(err: unknown): err is HorizonError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'response' in err
  );
}
