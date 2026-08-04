/**
 * The deterministic half of the sandbox: the CAPABILITY POLICY (which host methods a
 * plugin's grants expose, and its resource limits) and the USAGE CHECK (did a run
 * breach a limit). The isolate itself — a V8 isolate / WASM / worker with hard
 * memory+CPU caps — is runtime infra; this module computes the policy it enforces and
 * turns raw usage into limit violations the lifecycle health monitor acts on.
 *
 * The exposed surface is built ONLY from granted permissions and never includes a
 * forbidden method, so the isolate is handed a capability object with no path to
 * keys/signing/db even if the plugin asks by name.
 */
import { methodsFor } from './permissions.js';
import { resolveLimits } from './trust.js';
import type { Permission, ResourceLimits, TrustLevel } from './types.js';

export interface SandboxPolicy {
  limits: ResourceLimits;
  /** The exact host methods this plugin may call — nothing else is on the surface. */
  allowedMethods: string[];
}

export function sandboxPolicyFor(
  trustLevel: TrustLevel,
  granted: readonly Permission[],
  requestedLimits?: Partial<ResourceLimits>,
): SandboxPolicy {
  return {
    limits: resolveLimits(trustLevel, requestedLimits),
    allowedMethods: methodsFor(granted),
  };
}

export interface ResourceUsage {
  memoryMb: number;
  cpuMs: number;
  storageMb: number;
  elapsedMs: number;
}

export interface UsageCheck {
  withinLimits: boolean;
  violations: string[];
}

/** Turn measured usage into concrete limit violations (memory / cpu / storage / timeout). */
export function checkUsage(usage: ResourceUsage, limits: ResourceLimits): UsageCheck {
  const violations: string[] = [];
  if (usage.memoryMb > limits.memoryMb) violations.push(`memory ${usage.memoryMb}MB > ${limits.memoryMb}MB`);
  if (usage.cpuMs > limits.cpuMs) violations.push(`cpu ${usage.cpuMs}ms > ${limits.cpuMs}ms`);
  if (usage.storageMb > limits.storageMb) violations.push(`storage ${usage.storageMb}MB > ${limits.storageMb}MB`);
  if (usage.elapsedMs > limits.timeoutMs) violations.push(`timeout ${usage.elapsedMs}ms > ${limits.timeoutMs}ms`);
  return { withinLimits: violations.length === 0, violations };
}
