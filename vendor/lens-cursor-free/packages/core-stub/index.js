const ERR = 'CORE_NOT_INSTALLED: link ../lens-cursor-free-core via npm run link:core';

function fail(name) {
  return async () => {
    throw new Error(`${ERR} (${name})`);
  };
}

export const runRelayStartup = fail('runRelayStartup');
export const onRelayBeforeQuit = () => {};
export const runRelayQuitRelease = fail('runRelayQuitRelease');
export const getRelaySwitchInFlight = () => false;
export const setRelayMainWindow = () => {};
export const getRelayMainWindow = () => null;
export const setRelayIsQuitting = () => {};
export const getRelayIsQuitting = () => false;
