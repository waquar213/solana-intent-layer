// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// @title SimpleAMM — a minimal Uniswap-V2-style constant-product pool (ETH ⇄ token)
/// @author Intent Wallet (GIWA · GASOK submission)
/// @notice A GENUINE `x·y=k` automated market maker with a 0.3% fee — real price discovery
///         and real slippage, not a fixed-rate stub. Liquidity is provided by the deployer
///         because a brand-new testnet has none; the AMM itself is a standard, auditable DEX.
///
///         The Intent Wallet routes "swap N ETH for gUSDC" intents through `swapEthForToken`
///         on GIWA, so a natural-language swap settles on this on-chain DEX and the amountOut
///         floor (minOut) protects the user from slippage/MEV exactly like a real router.
contract SimpleAMM {
    IERC20 public immutable token;

    // Reserves are tracked internally (not via balanceOf) so a stray token/ETH donation
    // can never desync the pricing curve.
    uint256 public reserveEth;
    uint256 public reserveToken;

    uint256 public totalLiquidity;
    mapping(address => uint256) public liquidity;

    event LiquidityAdded(address indexed provider, uint256 ethAmount, uint256 tokenAmount, uint256 minted);
    event LiquidityRemoved(address indexed provider, uint256 ethAmount, uint256 tokenAmount, uint256 burned);
    event Swap(address indexed user, bool ethIn, uint256 amountIn, uint256 amountOut);

    error ZeroAmount();
    error BadRatio();
    error NoLiquidity();
    error InsufficientOutput(uint256 got, uint256 min);
    error InsufficientLiquidity(uint256 have, uint256 want);
    error EthTransferFailed();
    error Reentrancy();

    /// @dev Transient reentrancy guard (same pattern as IntentExecutor). Reserves are tracked
    ///      internally and gUSDC has no transfer hooks, so this isn't reachable against the deployed
    ///      token — but the constructor accepts an ARBITRARY token, so guard every mutating path for a
    ///      future redeploy where `swapTokenForEth` pulls tokens (external call) before writing reserves.
    uint256 private _locked = 1;

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(address token_) {
        token = IERC20(token_);
    }

    /// @notice Add liquidity. The first provider sets the price; later providers must supply
    ///         at least the current reserve ratio (excess token is not pulled). LP units track
    ///         each provider's share.
    function addLiquidity(uint256 tokenAmount) external payable nonReentrant returns (uint256 minted) {
        if (msg.value == 0 || tokenAmount == 0) revert ZeroAmount();
        if (totalLiquidity == 0) {
            minted = msg.value; // bootstrap: LP units = ETH deposited
        } else {
            uint256 need = (msg.value * reserveToken) / reserveEth;
            if (tokenAmount < need) revert BadRatio();
            tokenAmount = need;
            minted = (msg.value * totalLiquidity) / reserveEth;
            // Never absorb the provider's ETH + token into the reserves for ZERO LP units (possible
            // when reserveEth has been driven far above totalLiquidity and msg.value is small).
            if (minted == 0) revert ZeroAmount();
        }
        require(token.transferFrom(msg.sender, address(this), tokenAmount), "transferFrom");
        reserveEth += msg.value;
        reserveToken += tokenAmount;
        totalLiquidity += minted;
        liquidity[msg.sender] += minted;
        emit LiquidityAdded(msg.sender, msg.value, tokenAmount, minted);
    }

    /// @notice Redeem `units` of LP for a pro-rata share of BOTH reserves.
    ///
    /// @dev Without this, `addLiquidity` minted LP units that could never be redeemed: the
    ///      bookkeeping (`totalLiquidity` / `liquidity[]`) advertised a claim on the pool that no
    ///      function honoured, and every provider's deposit — including the deployer's seed — was
    ///      permanently locked. Shares are floored so a withdrawal can never pay out more than the
    ///      caller's exact share, and state is written BEFORE the two external transfers
    ///      (checks-effects-interactions), so a reentrant callee sees already-debited reserves.
    function removeLiquidity(uint256 units) external nonReentrant returns (uint256 ethOut, uint256 tokenOut) {
        if (units == 0) revert ZeroAmount();
        uint256 have = liquidity[msg.sender];
        if (units > have) revert InsufficientLiquidity(have, units);
        uint256 supply = totalLiquidity;
        if (supply == 0) revert NoLiquidity();

        // Floor division: the pool keeps any remainder, never the withdrawer.
        ethOut = (units * reserveEth) / supply;
        tokenOut = (units * reserveToken) / supply;
        if (ethOut == 0 && tokenOut == 0) revert ZeroAmount();

        // Effects.
        liquidity[msg.sender] = have - units;
        totalLiquidity = supply - units;
        reserveEth -= ethOut;
        reserveToken -= tokenOut;

        // Interactions.
        if (tokenOut > 0) require(token.transfer(msg.sender, tokenOut), "transfer");
        if (ethOut > 0) {
            (bool ok, ) = payable(msg.sender).call{value: ethOut}("");
            if (!ok) revert EthTransferFailed();
        }
        emit LiquidityRemoved(msg.sender, ethOut, tokenOut, units);
    }

    /// @notice The Uniswap-V2 constant-product output with a 0.3% fee.
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) public pure returns (uint256) {
        if (amountIn == 0 || reserveIn == 0 || reserveOut == 0) return 0;
        uint256 amountInWithFee = amountIn * 997;
        return (amountInWithFee * reserveOut) / (reserveIn * 1000 + amountInWithFee);
    }

    /// @notice A pure quote for the ETH→token direction — the wallet reads this via eth_call
    ///         to show the user the live rate before signing.
    function quoteEthForToken(uint256 ethIn) external view returns (uint256) {
        return getAmountOut(ethIn, reserveEth, reserveToken);
    }

    /// @notice Swap ETH → token. Reverts if the output is below `minOut` (the slippage floor),
    ///         so a thin pool / MEV can never silently deliver less than the user accepted.
    function swapEthForToken(uint256 minOut) external payable nonReentrant returns (uint256 out) {
        if (reserveEth == 0 || reserveToken == 0) revert NoLiquidity();
        if (msg.value == 0) revert ZeroAmount();
        out = getAmountOut(msg.value, reserveEth, reserveToken);
        if (out < minOut) revert InsufficientOutput(out, minOut);
        reserveEth += msg.value;
        reserveToken -= out;
        require(token.transfer(msg.sender, out), "transfer");
        emit Swap(msg.sender, true, msg.value, out);
    }

    /// @notice Swap token → ETH. Caller must `approve` this pool first.
    function swapTokenForEth(uint256 tokenIn, uint256 minOut) external nonReentrant returns (uint256 out) {
        if (reserveEth == 0 || reserveToken == 0) revert NoLiquidity();
        if (tokenIn == 0) revert ZeroAmount();
        out = getAmountOut(tokenIn, reserveToken, reserveEth);
        if (out < minOut) revert InsufficientOutput(out, minOut);
        require(token.transferFrom(msg.sender, address(this), tokenIn), "transferFrom");
        reserveToken += tokenIn;
        reserveEth -= out;
        (bool ok, ) = payable(msg.sender).call{value: out}("");
        if (!ok) revert EthTransferFailed();
        emit Swap(msg.sender, false, tokenIn, out);
    }
}
