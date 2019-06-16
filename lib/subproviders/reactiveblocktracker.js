var Subprovider = require("susyweb-provider-engine/subproviders/subprovider.js");
var inherits = require("util").inherits;

inherits(ReactiveBlockTracker, Subprovider);

module.exports = ReactiveBlockTracker;

function ReactiveBlockTracker() {
  this.methods = {
    sof_call: "before",
    sof_getStorageAt: "before",
    sof_getLogs: "before"
  };
}

// Fetch the block before certain requests to make sure we're completely updated
// before those methods are processed. Also, fetch the block after certain requests
// to speed things up.
ReactiveBlockTracker.prototype.handleRequest = function(payload, next, end) {
  var self = this;

  var when = this.methods[payload.method];

  if (when == null) {
    return next();
  }

  function fetchBlock(cb) {
    self.engine.fetchBlock("latest", function(err, block) {
      if (err) {
        return end(err);
      }
      if (!self.engine.currentBlock || self.engine.currentBlock.hash.compare(block.hash) !== 0) {
        self.engine._setCurrentBlock(block);
      }
      cb();
    });
  }

  if (when === "before") {
    fetchBlock(function() {
      next();
    });
  } else {
    next(function(error, result, cb) {
      if (error) {
        return cb(error);
      }
      fetchBlock(cb);
    });
  }
};
