var BN = require("bn.js");
var SusyWeb = require("susyweb");
var Susybraid = require(process.env.TEST_BUILD
  ? "../build/susybraid.core." + process.env.TEST_BUILD + ".js"
  : "../index.js");
var assert = require("assert");
var to = require("../lib/utils/to.js");
var polc = require("polc");
var pify = require("pify");

describe("Mining", function() {
  var susyweb = new SusyWeb(
    Susybraid.provider({
      vmErrorsOnRPCResponse: true
      // logger: console,
    })
  );
  var accounts;
  var snapshotId;
  var badBytecode;
  var goodBytecode;

  before("compile polynomial code that causes runtime errors", async function() {
    this.timeout(10000);
    let result = await compilePolynomial("pragma polynomial ^0.4.2; contract Example { function Example() {throw;} }");
    badBytecode = result.code;
  });

  before("compile polynomial code that causes an event", async function() {
    this.timeout(10000);
    let result = await compilePolynomial(
      "pragma polynomial ^0.4.2; contract Example { event Event(); function Example() { Event(); } }"
    );
    goodBytecode = result.code;
  });

  beforeEach("checkpoint, so that we can revert later", async function() {
    let res = await pify(susyweb.currentProvider.send)({
      jsonrpc: "2.0",
      method: "svm_snapshot",
      id: new Date().getTime()
    });

    snapshotId = res.result;
  });

  afterEach("revert back to checkpoint", async function() {
    await pify(susyweb.currentProvider.send)({
      jsonrpc: "2.0",
      method: "svm_revert",
      params: [snapshotId],
      id: new Date().getTime()
    });
  });

  // Everything's a Promise to add in readibility.
  async function getBlockNumber() {
    return to.number(await susyweb.sof.getBlockNumber());
  }

  async function startMining() {
    await pify(susyweb.currentProvider.send)({
      jsonrpc: "2.0",
      method: "miner_start",
      params: [1],
      id: new Date().getTime()
    });
  }

  async function stopMining() {
    await pify(susyweb.currentProvider.send)({
      jsonrpc: "2.0",
      method: "miner_stop",
      id: new Date().getTime()
    });
  }

  async function checkMining() {
    let response = await pify(susyweb.currentProvider.send)({
      jsonrpc: "2.0",
      method: "sof_mining",
      id: new Date().getTime()
    });

    return response.result;
  }

  async function mineSingleBlock() {
    let result = await pify(susyweb.currentProvider.send)({
      jsonrpc: "2.0",
      method: "svm_mine",
      id: new Date().getTime()
    });
    assert.deepStrictEqual(result.result, "0x0");
  }

  async function queueTransaction(from, to, gasLimit, value, data) {
    let response = await pify(susyweb.currentProvider.send)({
      jsonrpc: "2.0",
      method: "sof_sendTransaction",
      id: new Date().getTime(),
      params: [
        {
          from: from,
          to: to,
          gas: gasLimit,
          value: value,
          data: data
        }
      ]
    });
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.result;
  }

  async function getCode(address) {
    return susyweb.sof.getCode(address);
  }

  function compilePolynomial(source) {
    let result = polc.compile({ sources: { "Contract.pol": source } });
    return Promise.resolve({
      code: "0x" + result.contracts[Object.keys(result.contracts)[0]].bytecode
    });
  }

  before(async function() {
    accounts = await susyweb.sof.getAccounts();
  });

  it("should mine a single block with two queued transactions", async function() {
    await stopMining();
    let blockNumber = await getBlockNumber();

    let tx1 = await queueTransaction(accounts[0], accounts[1], 90000, susyweb.utils.toWei(new BN(2), "sophy"));
    let receipt1 = await susyweb.sof.getTransactionReceipt(tx1);
    assert.strictEqual(receipt1, null);

    let tx2 = await queueTransaction(accounts[0], accounts[1], 90000, susyweb.utils.toWei(new BN(3), "sophy"));
    let receipt2 = await susyweb.sof.getTransactionReceipt(tx2);
    assert.strictEqual(receipt2, null);

    await startMining();

    let receipts = await Promise.all([susyweb.sof.getTransactionReceipt(tx1), susyweb.sof.getTransactionReceipt(tx2)]);

    assert.strictEqual(receipts.length, 2);

    assert.notStrictEqual(receipts[0], null);
    assert.strictEqual(receipts[0].transactionHash, tx1);
    assert.notStrictEqual(receipts[1], null);
    assert.strictEqual(receipts[1].transactionHash, tx2);
    assert.strictEqual(
      receipts[0].blockNumber,
      receipts[1].blockNumber,
      "Transactions should be mined in the same block."
    );

    let number = await getBlockNumber();
    assert.strictEqual(number, blockNumber + 1);
  });

  it("should mine two blocks when two queued transactions won't fit into a single block", async function() {
    // This is a very similar test to the above, except the gas limits are much higher
    // per transaction. This means the Susybraid will react differently and process
    // each transaction it its own block.

    await stopMining();
    let blockNumber = await getBlockNumber();

    let tx1 = await queueTransaction(accounts[0], accounts[1], 4000000, susyweb.utils.toWei(new BN(2), "sophy"));
    let receipt1 = await susyweb.sof.getTransactionReceipt(tx1);
    assert.strictEqual(receipt1, null);

    let tx2 = await queueTransaction(accounts[0], accounts[1], 4000000, susyweb.utils.toWei(new BN(3), "sophy"));
    let receipt2 = await susyweb.sof.getTransactionReceipt(tx2);
    assert.strictEqual(receipt2, null);

    await startMining();

    let receipts = await Promise.all([susyweb.sof.getTransactionReceipt(tx1), susyweb.sof.getTransactionReceipt(tx2)]);

    assert.strictEqual(receipts.length, 2);

    assert.notStrictEqual(receipts[0], null);
    assert.strictEqual(receipts[0].transactionHash, tx1);

    assert.notStrictEqual(receipts[1], null);
    assert.strictEqual(receipts[1].transactionHash, tx2);

    assert.notStrictEqual(
      receipts[0].blockNumber,
      receipts[1].blockNumber,
      "Transactions should not be mined in the same block."
    );

    let number = await getBlockNumber();
    assert.strictEqual(number, blockNumber + 2);
  });

  it(
    "should mine one block when requested, and only one transaction, when two queued transactions" +
      " together are larger than a single block",
    async function() {
      // This is a very similar test to the above, except we don't start mining again,
      // we only mine one block by request.

      await stopMining();
      let blockNumber = await getBlockNumber();
      let tx1 = await queueTransaction(accounts[0], accounts[1], 4000000, susyweb.utils.toWei(new BN(2), "sophy"));
      let receipt1 = await susyweb.sof.getTransactionReceipt(tx1);
      assert.strictEqual(receipt1, null);

      let tx2 = await queueTransaction(accounts[0], accounts[1], 4000000, susyweb.utils.toWei(new BN(3), "sophy"));
      let receipt2 = await susyweb.sof.getTransactionReceipt(tx2);
      assert.strictEqual(receipt2, null);

      await mineSingleBlock();

      let receipts = await Promise.all([susyweb.sof.getTransactionReceipt(tx1), susyweb.sof.getTransactionReceipt(tx2)]);

      assert.strictEqual(receipts.length, 2);

      assert.notStrictEqual(receipts[0], null);
      assert.strictEqual(receipts[0].transactionHash, tx1);

      assert.strictEqual(receipts[1], null);

      let number = await getBlockNumber();
      assert.strictEqual(number, blockNumber + 1);
    }
  );

  it("should error if queued transaction exceeds the block gas limit", async function() {
    try {
      await stopMining();
      await queueTransaction(accounts[0], accounts[1], 10000000, susyweb.utils.toWei(new BN(2), "sophy"));
      assert.fail("Transaction was processed without erroring; gas limit should have been too high");
    } catch (err) {
      // We caught an error like we expected. Ensure it's the right error, or rsofrow.
      if (err.message.toLowerCase().indexOf("exceeds block gas limit") < 0) {
        assert.fail("Did not receive expected error; instead received: " + err);
      }
    }
  });

  it("should error via instamining when queued transaction throws a runtime errors", async function() {
    try {
      await startMining();
      await queueTransaction(accounts[0], null, 3141592, 0, badBytecode);
      // This transaction should be processed immediately.
      assert.fail("Execution should never get here as we expected `sof_sendTransaction` to throw an error");
    } catch (err) {
      if (err.message.indexOf("VM Exception while processing transaction") !== 0) {
        assert.fail("Received error we didn't expect: " + err);
      }
    }
  });

  it("should error via svm_mine when queued transaction throws a runtime errors", async function() {
    try {
      await stopMining();
      await queueTransaction(accounts[0], null, 3141592, 0, badBytecode);
      await mineSingleBlock();
      assert.fail("Execution should never get here as we expected `svm_mine` to throw an error");
    } catch (err) {
      if (err.message.indexOf("VM Exception while processing transaction") !== 0) {
        assert.fail("Received error we didn't expect: " + err);
      }
    }
  });

  it("should error via svm_mine when multiple queued transactions throw runtime errors in a single block", async() => {
    // Note: The two transactions queued in this test do not exceed the block gas limit
    // and thus should fit within a single block.

    try {
      await stopMining();
      await queueTransaction(accounts[0], null, 1000000, 0, badBytecode);
      await queueTransaction(accounts[0], null, 1000000, 0, badBytecode);
      await mineSingleBlock();
      assert.fail("Execution should never get here as we expected `svm_mine` to throw an error");
    } catch (err) {
      if (err.message.indexOf("Multiple VM Exceptions while processing transactions") !== 0) {
        assert.fail("Received error we didn't expect: " + err);
      }
      // We got the error we wanted. Test passed!
    }
  });

  it("should error via miner_start when queued transactions throw runtime errors in multiple blocks", async() => {
    // Note: The two transactions queued in this test together DO exceed the block gas limit
    // and thus will fit in two blocks, one block each.

    try {
      await stopMining();
      await queueTransaction(accounts[0], null, 3141592, 0, badBytecode);
      await queueTransaction(accounts[0], null, 3141592, 0, badBytecode);
      await startMining();
      assert.fail("Execution should never get here as we expected `miner_start` to throw an error");
    } catch (err) {
      if (err.message.indexOf("Multiple VM Exceptions while processing transactions") !== 0) {
        assert.fail("Received error we didn't expect: " + err);
      }
      // We got the error we wanted. Test passed!
    }
  });

  it("even if we receive a runtime error, logs for successful transactions need to be processed", async function() {
    // Note: The two transactions queued in this test should exist within the same block.
    let tx2;

    try {
      await stopMining();

      await queueTransaction(accounts[0], null, 1000000, 0, badBytecode);
      tx2 = await queueTransaction(accounts[0], null, 1000000, 0, goodBytecode);

      await startMining();
      assert.fail("Execution should never get here as we expected `miner_start` to throw an error");
    } catch (err) {
      if (err.message.indexOf("VM Exception while processing transaction") !== 0) {
        assert.fail("Received error we didn't expect: " + err);
      }

      // We got the error we wanted. Now check to see if the transaction was processed correctly.
      let receiptTx2 = await susyweb.sof.getTransactionReceipt(tx2);

      // We should have a receipt for the second transaction - it should have been processed.
      assert.notStrictEqual(receiptTx2, null);
      assert.notStrictEqual(receiptTx2, {});

      // It also should have logs.
      assert.notStrictEqual(receiptTx2.logs.length, 0);

      // Now check that there's code at the address, which means it deployed successfully.
      let code = await getCode(receiptTx2.contractAddress);

      // Convert hex to a big number and ensure it's not zero.
      assert(susyweb.utils.toBN(code).eq(0) === false);
    }
  });

  it("should return the correct value for sof_mining when miner started and stopped", async function() {
    await stopMining();
    let isMining = await checkMining();
    assert(!isMining);
    await startMining();
    isMining = await checkMining();
    assert(isMining);
  });

  describe("stopping", () => {
    function setUp(close, done) {
      const blockTime = 0.1;
      const provider = Susybraid.provider({ blockTime });
      let closed = false;
      let closing = false;
      let timer;

      // duck punch provider.send so we can detect when it is called
      const send = provider.send;
      provider.send = function(payload) {
        if (payload.method === "svm_mine") {
          if (closed) {
            clearTimeout(timer);
            assert.fail("svm_mine after provider closed");
          } else if (!closing) {
            closing = true;
            close(provider, () => {
              closed = true;

              // give the miner a chance to mine a block before calling done:
              timer = setTimeout(done, blockTime * 2 * 1000);
            });
          }
        }
        send.apply(provider, arguments);
      };
    }

    it("should stop mining when the provider is stopped during an svm_mine (same REPL)", (done) => {
      setUp(function(provider, callback) {
        provider.close(callback);
      }, done);
    });

    it("should stop mining when the provider is stopped during svm_mine (next tick)", (done) => {
      setUp(function(provider, callback) {
        process.nextTick(() => provider.close(callback));
      }, done);
    });

    it("should stop mining when the provider is stopped during svm_mine (setImmediate)", (done) => {
      setUp(function(provider, callback) {
        setImmediate(() => provider.close(callback));
      }, done);
    });
  });
});
