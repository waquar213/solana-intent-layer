// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SimpleStaking — a minimal native-ETH staking pool with a linear, time-based reward.
/// @author Intent Wallet (GIWA · GASOK submission)
/// @notice REAL staking: `stake()` locks native ETH; `unstake(amount)` returns that principal
///         plus any accrued reward. Reward = principal · APR · elapsed / 365d, paid from a
///         SEPARATE deployer-seeded reward pool (funded via `fundRewards()` / a plain send).
///
///         Solvency invariant: the reward is ALWAYS drawn from the pool excess only
///         (`balance − totalStaked`), never from another staker's principal — so one user's
///         reward can never strand another's stake. Principal is always returned in full; a
///         reward shortfall reduces the reward, it never reverts the unstake.
///
///         The Intent Wallet routes a natural-language "stake N ETH" intent to `stake()` — the
///         SAME bytecode on GIWA Sepolia and Ethereum Sepolia — signed in-browser, non-custodial.
contract SimpleStaking {
    struct Position {
        uint256 principal; // staked ETH still locked
        uint256 accrued; // reward settled up to `updatedAt`, not yet withdrawn
        uint256 updatedAt; // last time `accrued` was brought current
    }

    mapping(address => Position) private positions;

    /// @notice Total principal locked across all stakers (excludes the reward pool).
    uint256 public totalStaked;

    /// @notice Annual reward rate in basis points (e.g. 500 = 5% APR). Immutable, set at deploy.
    uint256 public immutable aprBps;

    uint256 private constant YEAR = 365 days;
    uint256 private constant BPS = 10_000;

    event Staked(address indexed user, uint256 amount, uint256 newPrincipal);
    event Unstaked(address indexed user, uint256 principal, uint256 reward);
    event RewardFunded(address indexed from, uint256 amount);

    error ZeroAmount();
    error InsufficientStake(uint256 have, uint256 want);
    error TransferFailed();
    error Reentrancy();

    constructor(uint256 aprBps_) {
        aprBps = aprBps_;
    }

    /// @dev Transient reentrancy guard — same convention as IntentExecutor and SimpleAMM. `unstake`
    ///      is already safe via Checks-Effects-Interactions (its single outbound call runs after every
    ///      state effect), so this is belt-and-suspenders: it makes non-reentrancy STRUCTURAL rather
    ///      than resting on that ordering, and brings all three contracts to one guarded standard.
    uint256 private _locked = 1;

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    /// @notice Fund the reward pool. The deployer seeds this so `unstake` can pay rewards; a
    ///         plain ETH send routes here too.
    function fundRewards() external payable {
        emit RewardFunded(msg.sender, msg.value);
    }

    receive() external payable {
        emit RewardFunded(msg.sender, msg.value);
    }

    /// @dev Bring the caller's accrued reward current and reset the accrual clock.
    function _settle(address user) internal {
        Position storage p = positions[user];
        if (p.principal > 0 && p.updatedAt > 0) {
            uint256 elapsed = block.timestamp - p.updatedAt;
            p.accrued += (p.principal * aprBps * elapsed) / (BPS * YEAR);
        }
        p.updatedAt = block.timestamp;
    }

    /// @notice Stake native ETH (the sent `msg.value`). Re-staking compounds: the accrued
    ///         reward is settled first, then the new amount is added to principal.
    function stake() external payable {
        if (msg.value == 0) revert ZeroAmount();
        _settle(msg.sender);
        Position storage p = positions[msg.sender];
        p.principal += msg.value;
        totalStaked += msg.value;
        emit Staked(msg.sender, msg.value, p.principal);
    }

    /// @notice Unstake `amount` of principal; returns it plus the reward accrued so far. The
    ///         reward is paid best-effort from the pool excess and never reverts on a shortfall.
    function unstake(uint256 amount) external nonReentrant {
        _settle(msg.sender);
        Position storage p = positions[msg.sender];
        if (amount == 0) revert ZeroAmount();
        if (amount > p.principal) revert InsufficientStake(p.principal, amount);

        uint256 principalBefore = p.principal;
        p.principal -= amount;
        totalStaked -= amount;

        // Reward is proportional to the share unstaked (partial unstake keeps the rest accruing),
        // then capped to what the seeded pool can cover. After the two decrements above,
        // `balance − totalStaked − amount` is exactly the reward pool (ETH held beyond every
        // staker's principal), so paying from it can NEVER touch another staker's principal.
        uint256 rewardShare = (p.accrued * amount) / principalBefore;
        uint256 pool = address(this).balance - totalStaked - amount;
        uint256 reward = rewardShare <= pool ? rewardShare : pool;
        p.accrued -= reward; // deduct only what's paid; any unpaid share stays claimable

        (bool ok, ) = payable(msg.sender).call{value: amount + reward}("");
        if (!ok) revert TransferFailed();
        emit Unstaked(msg.sender, amount, reward);
    }

    // ── views ────────────────────────────────────────────────────────────────

    /// @notice The caller-facing principal `user` currently has staked.
    function stakedOf(address user) external view returns (uint256) {
        return positions[user].principal;
    }

    /// @notice The reward `user` would receive right now (accrued + since last settle).
    function pendingReward(address user) external view returns (uint256) {
        Position storage p = positions[user];
        uint256 live = p.principal > 0 && p.updatedAt > 0
            ? (p.principal * aprBps * (block.timestamp - p.updatedAt)) / (BPS * YEAR)
            : 0;
        return p.accrued + live;
    }

    /// @notice The seeded reward pool available to pay rewards (balance beyond all principal).
    function rewardPool() external view returns (uint256) {
        return address(this).balance - totalStaked;
    }
}
