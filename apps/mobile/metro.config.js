// Metro config so the isolated Expo app can bundle the AUDITED monorepo packages from their
// built dist/ (@intent-wallet/core = the wallet crypto, @intent-wallet/chains = the on-chain
// adapters that build/broadcast real EVM/SOL/BTC transactions) while resolving their
// @noble/@scure deps from THIS app's own node_modules. Package-exports is enabled for the
// @noble/* subpath exports (e.g. '@noble/ciphers/aes'). Both packages are RN-safe (pure
// @noble/@scure crypto, no Node built-ins) once getRandomValues is polyfilled (see polyfill.ts).
// PREREQ: build them first — `pnpm --filter @intent-wallet/core --filter @intent-wallet/chains build`.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..');
const corePkg = path.resolve(workspaceRoot, 'packages/core');
const chainsPkg = path.resolve(workspaceRoot, 'packages/chains');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [projectRoot, corePkg, chainsPkg];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.extraNodeModules = {
  '@intent-wallet/core': corePkg,
  '@intent-wallet/chains': chainsPkg,
};
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
