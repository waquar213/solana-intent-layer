// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IntentExecutor — on-chain settlement for AI-planned intents on GIWA
/// @author Intent Wallet (GIWA · GASOK submission)
/// @notice The wallet plans an intent OFF-CHAIN (natural language → typed, validated
///         steps), then submits it here to execute ON-CHAIN. This contract runs the
///         planned transfer steps atomically and emits a verifiable record that binds
///         the intent's hash to exactly what executed. It is the on-chain half of
///         "AI proposes, deterministic code verifies, the device signature disposes":
///
///           • No owner, no admin, no upgrade key — nobody can pause it, drain it, or
///             re-point it. Every caller runs their OWN intent, funded by their OWN call.
///           • The contract is stateless between calls — it never custodies funds. It
///             forwards `msg.value` within a single transaction and refunds any dust.
///           • `intentHash` is the CALLER'S OWN commitment to the off-chain plan, emitted
///             in the log as an audit anchor. NOTE: the contract does NOT verify
///             keccak256(steps) == intentHash on-chain — it gates nothing (see `execute`).
///             In this wallet's self-funded, self-signed flow (the caller both signs the
///             plan off-chain AND submits this call) it faithfully tags what they
///             authorized; it is NOT a substitution-proof binding for a relayer / meta-tx
///             model — that would require adding an on-chain `keccak256(steps)` check here.
///
///         This is intentionally minimal and auditable: the "trustless settlement"
///         value is that there is nothing here to trust.
contract IntentExecutor {
    /// @notice One transfer leg of a planned intent.
    struct Step {
        address payable to;
        uint256 amount; // wei
    }

    /// @notice Emitted once per successful intent, binding the plan hash to the result.
    event IntentExecuted(
        bytes32 indexed intentHash,
        address indexed sender,
        uint256 stepCount,
        uint256 totalValue
    );

    /// @notice Emitted once per executed leg — a per-step on-chain audit trail.
    event StepExecuted(bytes32 indexed intentHash, uint256 indexed index, address to, uint256 amount);

    error EmptyIntent();
    error ValueMismatch(uint256 sent, uint256 required);
    error TransferFailed(uint256 index);
    error Reentrancy();

    /// @dev Transient reentrancy guard. `execute` makes external calls in a loop; the
    ///      guard makes the "checks-effects-interactions" story airtight even though the
    ///      contract holds no persistent balances to drain.
    uint256 private _locked = 1;

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    /// @notice Execute an AI-planned intent: run each transfer leg atomically.
    /// @param intentHash A commitment to the off-chain plan (e.g. keccak256 of the
    ///        canonical intent JSON). Purely a binding/audit anchor — it gates nothing,
    ///        so it can never be used to lock a user out of their own funds.
    /// @param steps The transfer legs the planner produced. Total must be fully funded
    ///        by `msg.value`; any surplus is refunded to the caller.
    function execute(bytes32 intentHash, Step[] calldata steps) external payable nonReentrant {
        uint256 n = steps.length;
        if (n == 0) revert EmptyIntent();

        // Checks: the caller must fund the whole plan up front.
        uint256 total;
        for (uint256 i; i < n; ++i) {
            total += steps[i].amount;
        }
        if (msg.value < total) revert ValueMismatch(msg.value, total);

        // Interactions: forward each leg. A failed leg reverts the WHOLE intent, so the
        // plan is all-or-nothing — a partially-executed intent can never be reported as done.
        for (uint256 i; i < n; ++i) {
            (bool ok, ) = steps[i].to.call{value: steps[i].amount}("");
            if (!ok) revert TransferFailed(i);
            emit StepExecuted(intentHash, i, steps[i].to, steps[i].amount);
        }

        // Refund any over-funding to the sender — the contract keeps nothing.
        uint256 refund = msg.value - total;
        if (refund > 0) {
            (bool ok, ) = payable(msg.sender).call{value: refund}("");
            if (!ok) revert TransferFailed(type(uint256).max);
        }

        emit IntentExecuted(intentHash, msg.sender, n, total);
    }

    /// @notice Reject bare ETH — funds only ever move through `execute()`, never by
    ///         accident or a mistaken transfer. The contract is not a wallet.
    receive() external payable {
        revert("IntentExecutor: use execute()");
    }
}
