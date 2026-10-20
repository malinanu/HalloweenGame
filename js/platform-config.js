// Which platform this build is for. `npm run package -- --target <name>` rewrites this file.
//   target: 'web' | 'youtube' | 'crazygames' | 'gamedistribution'
//   vendor: skin baked into single-skin platform builds (null = the server/default skin)
//   gameDistributionId: your game id from the GameDistribution developer dashboard
export const PLATFORM_CONFIG = { target: 'web', vendor: null, gameDistributionId: '' };
