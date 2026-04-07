import { randomUUID } from "node:crypto";

import { Keypair } from "@stellar/stellar-sdk";
import { NextRequest, NextResponse } from "next/server";

import { getOrCreateUserId, USER_COOKIE_KEY } from "@/lib/auth/user-id";
import { fundWithFriendbot } from "@/lib/stellar/client";
import { upsertUserWallet } from "@/lib/storage/user-wallet-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      mode?: "custodial" | "freighter";
      publicKey?: string;
      fund?: boolean;
    };

    const { userId, shouldSetCookie } = getOrCreateUserId(request);
    const mode = body.mode ?? "custodial";
    const shouldFund = body.fund ?? true;

    let assignedPublicKey = "";
    const source: "custodial" | "freighter" = mode;

    if (mode === "freighter") {
      if (!body.publicKey) {
        return NextResponse.json({ error: "publicKey is required for freighter mode" }, { status: 400 });
      }

      assignedPublicKey = body.publicKey;
      await upsertUserWallet(userId, {
        publicKey: assignedPublicKey,
        source: "freighter",
      });

      if (shouldFund) {
        await fundWithFriendbot(assignedPublicKey);
      }
    } else {
      const keypair = Keypair.random();
      assignedPublicKey = keypair.publicKey();

      await upsertUserWallet(userId, {
        publicKey: keypair.publicKey(),
        secret: keypair.secret(),
        source: "custodial",
      });

      if (shouldFund) {
        await fundWithFriendbot(keypair.publicKey());
      }
    }

    const response = NextResponse.json({
      ok: true,
      userId,
      source,
      network: "stellar-testnet",
      publicKey: assignedPublicKey,
      message:
        source === "freighter"
          ? "Freighter address linked to this user and optionally funded on testnet."
          : "Testnet wallet generated, funded, and assigned to this user.",
    });

    if (shouldSetCookie) {
      response.cookies.set(USER_COOKIE_KEY, userId ?? randomUUID(), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to setup Stellar testnet wallet." },
      { status: 500 }
    );
  }
}
