//! SimpleStaking (Solana) — the devnet twin of the EVM SimpleStaking pool.
//!
//! `stake(amount)` moves `amount` lamports from the user into a program vault PDA and records
//! the user's principal in a per-user PDA. `unstake(amount)` returns that principal from the
//! vault (via an invoke_signed system transfer). Non-custodial: the user signs; the program
//! only moves lamports it already holds in the vault, and never below a user's recorded balance.
//!
//! Deliberately reward-free on Solana (unlike the EVM pool's APR) to keep the on-chain logic
//! minimal and auditable for the demo; principal in = principal out.
//!
//! The Intent Wallet routes a "stake N SOL" intent to `stake` on devnet, signed in-browser.
use anchor_lang::prelude::*;
use anchor_lang::system_program;

// PLACEHOLDER — replace with the real id from `anchor keys list` after the first build (and
// mirror it in Anchor.toml). It must be a VALID 32-byte base58 pubkey: the previous placeholder
// decoded to only 31 bytes, which made `declare_id!` fail and cascaded into "cannot find value
// `ID`" from the #[program] macro — the program would not compile at all.
declare_id!("Ep1GzVPzhq1BZfzza1wcvxmRrfHAHugnwuyo7FhU8ZbK");

#[program]
pub mod staking {
    use super::*;

    /// Stake `amount` lamports: transfer user → vault (system CPI) and add to the user's principal.
    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        require!(amount > 0, StakingError::ZeroAmount);
        // The vault is a 0-data SystemAccount, so the runtime requires its balance to be either
        // ZERO or at least rent-exempt. A first stake below that minimum would make the system
        // transfer fail with an opaque InsufficientFundsForRent; refuse it here with a named error
        // the client can actually explain to the user.
        let min_vault = Rent::get()?.minimum_balance(0);
        let vault_after = ctx.accounts.vault.lamports().checked_add(amount).ok_or(StakingError::Overflow)?;
        require!(vault_after >= min_vault, StakingError::BelowRentExemption);
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;
        let acct = &mut ctx.accounts.stake_account;
        acct.owner = ctx.accounts.user.key();
        acct.amount = acct.amount.checked_add(amount).ok_or(StakingError::Overflow)?;
        emit!(Staked { user: acct.owner, amount, new_principal: acct.amount });
        Ok(())
    }

    /// Unstake `amount` lamports of principal: transfer vault → user (invoke_signed with the
    /// vault PDA seeds) and subtract from the user's principal. Reverts if it exceeds principal.
    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        require!(amount > 0, StakingError::ZeroAmount);
        let acct = &mut ctx.accounts.stake_account;
        require!(amount <= acct.amount, StakingError::InsufficientStake);

        // Same rule on the way out: the vault must end at exactly zero or stay rent-exempt.
        // Otherwise the transfer fails and the remaining stakers' funds become unwithdrawable.
        let min_vault = Rent::get()?.minimum_balance(0);
        let vault_after = ctx.accounts.vault.lamports().checked_sub(amount).ok_or(StakingError::Overflow)?;
        require!(vault_after == 0 || vault_after >= min_vault, StakingError::BelowRentExemption);

        let bump = ctx.bumps.vault;
        let seeds: &[&[u8]] = &[b"vault", &[bump]];
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;
        acct.amount = acct.amount.checked_sub(amount).ok_or(StakingError::Overflow)?;
        emit!(Unstaked { user: acct.owner, amount, remaining: acct.amount });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + StakeAccount::LEN,
        seeds = [b"stake", user.key().as_ref()],
        bump
    )]
    pub stake_account: Account<'info, StakeAccount>,
    /// CHECK: the vault is a PDA holding pooled lamports only (no data); seeds constrain it.
    #[account(mut, seeds = [b"vault"], bump)]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    // The stake account is derived from the signer's key, so a user can only ever touch their own.
    #[account(mut, seeds = [b"stake", user.key().as_ref()], bump)]
    pub stake_account: Account<'info, StakeAccount>,
    #[account(mut, seeds = [b"vault"], bump)]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct StakeAccount {
    pub owner: Pubkey,
    pub amount: u64,
}
impl StakeAccount {
    pub const LEN: usize = 32 + 8;
}

#[event]
pub struct Staked {
    pub user: Pubkey,
    pub amount: u64,
    pub new_principal: u64,
}
#[event]
pub struct Unstaked {
    pub user: Pubkey,
    pub amount: u64,
    pub remaining: u64,
}

#[error_code]
pub enum StakingError {
    #[msg("amount must be greater than zero")]
    ZeroAmount,
    #[msg("unstake exceeds staked principal")]
    InsufficientStake,
    #[msg("arithmetic overflow")]
    Overflow,
    #[msg("this would leave the vault below the rent-exempt minimum; stake more or withdraw the full amount")]
    BelowRentExemption,
}
