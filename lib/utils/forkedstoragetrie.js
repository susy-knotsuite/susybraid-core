const MerklePatriciaTree = require("merkle-patricia-tree");
const BaseTrie = require("merkle-patricia-tree/baseTrie");
const checkpointInterface = require("merkle-patricia-tree/checkpoint-interface");
var utils = require("sophonjs-util");
var inherits = require("util").inherits;
var SusyWeb = require("susyweb");
var to = require("./to.js");

inherits(ForkedStorageBaseTrie, BaseTrie);

function ForkedStorageBaseTrie(db, root, options) {
  BaseTrie.call(this, db, root);

  this.options = options;
  this.address = options.address;
  this.forkBlockNumber = options.forkBlockNumber;
  this.blockchain = options.blockchain;
  this.fork = options.fork;
  this.susyweb = new SusyWeb(this.fork);
}

// Note: This overrides a standard method whereas the other methods do not.
ForkedStorageBaseTrie.prototype.get = function(key, blockNumber, callback) {
  var self = this;

  // Allow an optional blockNumber
  if (typeof blockNumber === "function") {
    callback = blockNumber;
    blockNumber = self.forkBlockNumber;
  }

  // For graviton; https://octonion.institute/susy-js/sophonjs-util/issues/79
  blockNumber = to.rpcQuantityHexString(blockNumber);

  key = utils.toBuffer(key);

  // If the account doesn't exist in our state trie, get it off the wire.
  this.keyExists(key, function(err, exists) {
    if (err) {
      return callback(err);
    }

    if (exists) {
      // TODO: just because we have the key doesn't mean we're at the right
      // block number/root to send it. We need to check the block number
      // before using the data in our own trie.
      MerklePatriciaTree.prototype.get.call(self, key, function(err, r) {
        callback(err, r);
      });
    } else {
      // If this is the main trie, get the whole account.
      if (self.address == null) {
        self.blockchain.fetchAccountFromFallback(key, blockNumber, function(err, account) {
          if (err) {
            return callback(err);
          }

          callback(null, account.serialize());
        });
      } else {
        if (to.number(blockNumber) > to.number(self.forkBlockNumber)) {
          blockNumber = self.forkBlockNumber;
        }
        self.susyweb.sof.getStorageAt(to.hex(self.address), to.hex(key), blockNumber, function(err, value) {
          if (err) {
            return callback(err);
          }

          value = utils.srlp.encode(value);

          callback(null, value);
        });
      }
    }
  });
};

ForkedStorageBaseTrie.prototype.keyExists = function(key, callback) {
  key = utils.toBuffer(key);

  this.findPath(key, function(err, node, remainder, stack) {
    const exists = node && remainder.length === 0;
    callback(err, exists);
  });
};

ForkedStorageBaseTrie.prototype.copy = function() {
  return new ForkedStorageBaseTrie(this.db, this.root, this.options);
};

inherits(ForkedStorageTrie, ForkedStorageBaseTrie);

function ForkedStorageTrie(db, root, options) {
  ForkedStorageBaseTrie.call(this, db, root, options);
  checkpointInterface(this);
}

ForkedStorageTrie.prove = MerklePatriciaTree.prove;
ForkedStorageTrie.verifyProof = MerklePatriciaTree.verifyProof;

module.exports = ForkedStorageTrie;
