// Horizon error result codes mapped to Fortexa‑stable categories
export enum HorizonErrorCategory {
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
  BAD_SEQUENCE = "BAD_SEQUENCE",
  MALFORMED_XDR = "MALFORMED_XDR",
  TRANSACTION_FAILED = "TRANSACTION_FAILED",
  TIMEOUT_OR_NETWORK_FAILURE = "TIMEOUT_OR_NETWORK_FAILURE",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Map a Horizon result code (transaction or operation) to a stable category.
 * Returns UNKNOWN_ERROR when the code is not recognised.
 */
export function normalizeHorizonError(code: string | undefined): HorizonErrorCategory {
  if (!code) return HorizonErrorCategory.UNKNOWN_ERROR;
  switch (code) {
    // Transaction level codes
    case "tx_bad_seq":
      return HorizonErrorCategory.BAD_SEQUENCE;
    case "tx_insufficient_balance":
      return HorizonErrorCategory.INSUFFICIENT_BALANCE;
    case "tx_malformed":
      return HorizonErrorCategory.MALFORMED_XDR;
    case "tx_failed":
      return HorizonErrorCategory.TRANSACTION_FAILED;
    case "tx_timeout":
    case "tx_internal_error":
      return HorizonErrorCategory.TIMEOUT_OR_NETWORK_FAILURE;
    // Operation level codes (mapped to appropriate categories)
    case "op_underfunded":
    case "op_insufficient_balance":
      return HorizonErrorCategory.INSUFFICIENT_BALANCE;
    case "op_no_destination":
    case "op_line_full":
      return HorizonErrorCategory.TRANSACTION_FAILED;
    default:
      return HorizonErrorCategory.UNKNOWN_ERROR;
  }
}
