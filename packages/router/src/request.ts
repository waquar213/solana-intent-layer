/** A routing request: convert `amountInBase` of `fromSymbol` into `toSymbol`. */
export interface RouteRequest {
  fromSymbol: string;
  toSymbol: string;
  amountInBase: bigint;
  fromDecimals: number;
  chainId: string;
  /** Set (and different from `chainId`) for a cross-chain conversion. */
  toChainId?: string;
}
