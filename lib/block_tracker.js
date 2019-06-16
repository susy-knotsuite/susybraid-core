// this replaces `sof-block-tracker` in the provider-engine, as that block tracker is meant to work with
// an external provider instance

const EventEmitter = require("events");
var blockHelper = require("./utils/block_helper");

function SusybraidBlockTracker(opts) {
  opts = opts || {};
  EventEmitter.apply(this);
  if (!opts.blockchain) {
    throw new Error("RpcBlockTracker - no blockchain specified.");
  }
  if (!opts.blockchain.on) {
    throw new Error("RpcBlockTracker - blockchain is not an EventEmitter.");
  }
  this._blockchain = opts.blockchain;
  this.start = this.start.bind(this);
  this.stop = this.stop.bind(this);
  this.getTrackingBlock = this.getTrackingBlock.bind(this);
  this.awaitCurrentBlock = this.awaitCurrentBlock.bind(this);
  this._setCurrentBlock = this._setCurrentBlock.bind(this);
}

SusybraidBlockTracker.prototype = Object.create(EventEmitter.prototype);
SusybraidBlockTracker.prototype.constructor = SusybraidBlockTracker;

SusybraidBlockTracker.prototype.getTrackingBlock = function() {
  return this._currentBlock;
};

SusybraidBlockTracker.prototype.getCurrentBlock = function() {
  return this._currentBlock;
};

SusybraidBlockTracker.prototype.awaitCurrentBlock = function() {
  const self = this;
  // return if available
  if (this._currentBlock) {
    return this._currentBlock;
  }
  // wait for "sync" event
  return new Promise((resolve) => this.once("block", resolve)).then(() => self._currentBlock);
};

SusybraidBlockTracker.prototype.start = function(opts = {}) {
  this._blockchain.on("block", this._setCurrentBlock);
  return Promise.resolve();
};

SusybraidBlockTracker.prototype.stop = function() {
  this._isRunning = false;
  this._blockchain.removeListener("block", this._setCurrentBlock);
};

//
// private
//

SusybraidBlockTracker.prototype._setCurrentBlock = function(newBlock) {
  let block = blockHelper.toJSON(newBlock, true);
  if (this._currentBlock && this._currentBlock.hash === block.hash) {
    return;
  }
  const oldBlock = this._currentBlock;
  this._currentBlock = block;
  this.emit("latest", block);
  this.emit("sync", { block, oldBlock });
  this.emit("block", block);
};

module.exports = SusybraidBlockTracker;
