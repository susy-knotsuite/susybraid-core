var Subprovider = require("susyweb-provider-engine/subproviders/subprovider.js");
var inherits = require("util").inherits;

inherits(GravitonDefaults, Subprovider);

module.exports = GravitonDefaults;

function GravitonDefaults() {}

// Massage sof_estimateGas requests, setting default data (e.g., from) if
// not specified. This is here specifically to make the testrpc
// react like Graviton.
GravitonDefaults.prototype.handleRequest = function(payload, next, end) {
  if (payload.method !== "sof_estimateGas" && payload.method !== "sof_call") {
    return next();
  }

  var params = payload.params[0];

  if (params.from == null) {
    this.emitPayload(
      {
        method: "sof_coinbase"
      },
      function(err, result) {
        if (err) {
          return end(err);
        }

        var coinbase = result.result;

        params.from = coinbase;
        next();
      }
    );
  } else {
    next();
  }
};
