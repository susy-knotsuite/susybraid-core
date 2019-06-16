// make sourcemaps work!
require("source-map-support/register");

const debug = require("debug")("susybraid");

// we use optional dependencies which may, or may not exist, so try native first
try {
  // make sure these exist before we try to load susybraid with native modules
  const optionalDependencies = require("./package.json").optionalDependencies;
  const wrongSusyWeb = require("susyweb/package.json").version !== optionalDependencies["susyweb"];
  const wrongSophonJs = require(
    "sophonjs-wallet/package.json"
  ).version !== optionalDependencies["sophonjs-wallet"];
  if (wrongSusyWeb || wrongSophonJs) {
    useBundled();
  } else {
    module.exports = require("./public-exports.js");
    module.exports._webpacked = false;
    debug("Optional dependencies installed; exporting susybraid-core with native optional dependencies.");
  }
} catch (nativeError) {
  debug(nativeError);

  // grabbing the native/optional deps failed, try using our webpacked build.
  useBundled();
}

function useBundled() {
  try {
    module.exports = require("./build/susybraid.core.node.js");
    module.exports._webpacked = true;
    debug("Optional dependencies not installed; exporting susybraid-core from `./build` directory.");
  } catch (webpackError) {
    debug("susybraid-core could not be exported; optional dependencies nor webpack build available for export.");
    throw webpackError;
  }
}
