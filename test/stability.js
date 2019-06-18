const BN = require("bn.js");
const assert = require("assert");
const utils = require("sophonjs-util");
const initializeTestProvider = require("./helpers/susyweb/initializeTestProvider");

describe("stability", function() {
  let context;

  before("Initialize the provider", async function() {
    context = await initializeTestProvider();
  });

  it("should be able to handle multiple transactions at once and manage nonces accordingly", async function() {
    const { accounts, susyweb } = context;

    const txParams = {
      from: accounts[0],
      to: accounts[1],
      value: susyweb.utils.toWei(new BN(1), "sophy")
    };
    const expected = 5;
    const concurrentTransactions = Array(expected).fill(() => susyweb.sof.sendTransaction(txParams));

    await Promise.all(concurrentTransactions.map((txFn) => assert.doesNotReject(txFn)));
  });

  it("should be able to handle batch transactions", function(done) {
    const { accounts, provider, susyweb } = context;
    const expected = 5;
    const requests = [];

    for (let i = 0; i < expected; i++) {
      let req = susyweb.sof.sendTransaction.request({
        from: accounts[0],
        to: accounts[1],
        value: `0x${new BN(10).pow(new BN(18)).toString("hex")}` // 1 SOF
      });

      Object.assign(req, {
        jsonrpc: "2.0",
        id: 100 + i
      });

      requests.push(req);
    }

    provider.sendAsync(requests, function(err, result) {
      assert(err === undefined || err === null);
      assert(Array.isArray(result));
      assert.deepStrictEqual(result.length, expected);
      done();
    });
  });

  it("should not crash when receiving transactions which don't pass FakeTransaction validation", async function() {
    const { accounts, send } = context;

    const method = "sof_sendTransaction";
    const params = {
      from: accounts[0],
      to: "0x123", // bad address
      value: `0x${new BN(10).pow(new BN(18)).toString("hex")}` // 1 SOF
    };

    await assert.rejects(() => send(method, params), /The field to must have byte length of 20/);
  });

  it("should not crash when receiving a request with too many arguments", async function() {
    const { send } = context;

    const method = "svm_mine";
    const err = await send(method, "0x1", "0x2", "0x3", "0x4", "0x5", "0x6", "0x7", "0x8", "0x9", "0xA").catch(
      (e) => e
    );
    assert(err.message.indexOf("Incorrect number of arguments.") !== -1);
  });

  // TODO: remove `.skip` when working on and/or submitting fix for issue susy-knotsuite/susybraid-cli#453
  describe.skip("race conditions", function(done) {
    let context;

    before("Initialize the provider", async function() {
      context = await initializeTestProvider();
    });

    it("should not cause 'get' of undefined", function(done) {
      const { accounts, provider } = context;
      process.prependOnceListener("uncaughtException", function(err) {
        done(err);
      });

      const blockchain = provider.manager.state.blockchain;
      // processCall or processBlock
      blockchain.vm.stateManager.checkpoint();
      // getCode (or any function that calls trie.get)
      blockchain.stateTrie.get(utils.toBuffer(accounts[0]), function() {});
      blockchain.vm.stateManager.revert(function() {
        done();
      }); // processCall or processBlock
    });

    it("should not cause 'pop' of undefined", function(done) {
      const { provider, susyweb } = context;
      process.prependOnceListener("uncaughtException", function(err) {
        done(err);
      });

      const blockchain = provider.manager.state.blockchain;
      blockchain.vm.stateManager.checkpoint(); // processCall #1
      // processNextBlock triggered by interval mining which at some point calls
      // vm.stateManager.commit() and blockchain.putBlock()
      blockchain.processNextBlock(function(err, tx, results) {
        if (err) {
          return done(err);
        }
        blockchain.vm.stateManager.revert(function() {
          // processCall #1 finishes
          blockchain.latestBlock(function(err, latestBlock) {
            if (err) {
              return done(err);
            }
            blockchain.stateTrie.root = latestBlock.header.stateRoot; // getCode #1 (or any function with this logic)
            susyweb.sof.call({}, function() {
              done();
            }); // processCall #2
          });
        });
      });
    });
  });
});
