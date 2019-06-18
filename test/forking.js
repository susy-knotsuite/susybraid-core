var SusyWeb = require("susyweb");
var SusyWebWsProvider = require("susyweb-providers-ws");
var assert = require("assert");
var Susybraid = require(process.env.TEST_BUILD
  ? "../build/susybraid.core." + process.env.TEST_BUILD + ".js"
  : "../index.js");
var fs = require("fs");
var polc = require("polc");
var to = require("../lib/utils/to.js");
var generateSend = require("./helpers/utils/rpc");

var logger = {
  log: function(msg) {
    /* console.log(msg) */
  }
};

/**
 * NOTE: Naming in these tests is a bit confusing. Here, the "main chain"
 * is the main chain the tests interact with; and the "forked chain" is the
 * chain that _was forked_. This is in contrast to general naming, where the
 * main chain represents the main chain to be forked (like the Sophon live
 * network) and the fork chaing being "the fork".
 */

describe("Forking", function() {
  var contract;
  var contractAddress;
  var secondContractAddress; // used sparingly
  var forkedServer;
  var mainAccounts;
  var forkedAccounts;

  var initialFallbackAccountState = {};

  var forkedSusyWeb = new SusyWeb();
  var mainSusyWeb = new SusyWeb();

  var forkedSusyWebNetworkId = Date.now();
  var forkedSusyWebPort = 21345;
  var forkedTargetUrl = "ws://localhost:" + forkedSusyWebPort;
  var forkBlockNumber;

  var initialDeployTransactionHash;

  before("set up test data", function() {
    this.timeout(10000);
    var source = fs.readFileSync("./test/contracts/examples/Example.pol", { encoding: "utf8" });
    var result = polc.compile(source, 1);

    // Note: Certain properties of the following contract data are hardcoded to
    // maintain repeatable tests. If you significantly change the polynomial code,
    // make sure to update the resulting contract data with the correct values.
    contract = {
      polynomial: source,
      abi: result.contracts[":Example"].interface,
      binary: "0x" + result.contracts[":Example"].bytecode,
      position_of_value: "0x0000000000000000000000000000000000000000000000000000000000000000",
      expected_default_value: 5,
      call_data: {
        gas: "0x2fefd8",
        gasPrice: "0x1", // This is important, as passing it has exposed errors in the past.
        to: null, // set by test
        data: "0x3fa4f245"
      },
      transaction_data: {
        from: null, // set by test
        gas: "0x2fefd8",
        to: null, // set by test
        data: "0x552410770000000000000000000000000000000000000000000000000000000000000019" // sets value to 25 (base 10)
      }
    };
  });

  before("Initialize Fallback Susybraid server", async() => {
    forkedServer = Susybraid.server({
      // Do not change seed. Determinism matters for these tests.
      seed: "let's make this deterministic",
      ws: true,
      logger: logger,
      network_id: forkedSusyWebNetworkId
    });

    await forkedServer.listen(forkedSusyWebPort);
  });

  before("set forkedSusyWeb provider", () => {
    forkedSusyWeb.setProvider(new SusyWebWsProvider(forkedTargetUrl));
  });

  before("Gather forked accounts", async() => {
    forkedAccounts = await forkedSusyWeb.sof.getAccounts();
  });

  before("Deploy initial contracts", async() => {
    const receipt = await forkedSusyWeb.sof.sendTransaction({
      from: forkedAccounts[0],
      data: contract.binary,
      gas: 3141592
    });

    // Save this for a later test.
    initialDeployTransactionHash = receipt.transactionHash;
    contractAddress = receipt.contractAddress;

    // Ensure there's *something* there.
    const code = await forkedSusyWeb.sof.getCode(contractAddress);
    assert.notStrictEqual(code, null);
    assert.notStrictEqual(code, "0x");
    assert.notStrictEqual(code, "0x0");

    // Deploy a second one, which we won't use often.
    const receipt2 = await forkedSusyWeb.sof.sendTransaction({
      from: forkedAccounts[0],
      data: contract.binary,
      gas: 3141592
    });

    secondContractAddress = receipt2.contractAddress;
  });

  before("Make a transaction on the forked chain that produces a log", async() => {
    var forkedExample = new forkedSusyWeb.sof.Contract(JSON.parse(contract.abi), contractAddress);
    var event = forkedExample.events.ValueSet({});

    const eventData = new Promise((resolve, reject) => {
      event.once("data", function(logs) {
        resolve();
      });
    });

    await forkedExample.methods.setValue(7).send({ from: forkedAccounts[0] });
    await eventData;
  });

  before("Get initial balance and nonce", async() => {
    const [balance, nonce] = await Promise.all([
      forkedSusyWeb.sof.getBalance(forkedAccounts[0]),
      forkedSusyWeb.sof.getTransactionCount(forkedAccounts[0])
    ]);
    initialFallbackAccountState = {
      nonce: to.number(nonce),
      balance
    };
  });

  before("Set main susyweb provider, forking from forked chain at this point", async() => {
    mainSusyWeb.setProvider(
      Susybraid.provider({
        fork: forkedTargetUrl.replace("ws", "http"),
        logger,
        // Do not change seed. Determinism matters for these tests.
        seed: "a different seed"
      })
    );

    forkBlockNumber = await forkedSusyWeb.sof.getBlockNumber();
  });

  before("Gather main accounts", async() => {
    mainAccounts = await mainSusyWeb.sof.getAccounts();
  });

  it("should get the id of the forked chain", async() => {
    const id = await mainSusyWeb.sof.net.getId();
    assert.strictEqual(id, forkedSusyWebNetworkId);
  });

  it("should fetch a contract from the forked provider via the main provider", async() => {
    const mainCode = await mainSusyWeb.sof.getCode(contractAddress);
    // Ensure there's *something* there.
    assert.notStrictEqual(mainCode, null);
    assert.notStrictEqual(mainCode, "0x");
    assert.notStrictEqual(mainCode, "0x0");

    // Now make sure it matches exactly.
    const forkedCode = await forkedSusyWeb.sof.getCode(contractAddress);
    assert.strictEqual(mainCode, forkedCode);
  });

  it("should get the balance of an address in the forked provider via the main provider", async() => {
    // Assert preconditions
    const firstForkedAccount = forkedAccounts[0];
    assert(mainAccounts.indexOf(firstForkedAccount) < 0);

    // Now for the real test: Get the balance of a forked account through the main provider.
    const balance = await mainSusyWeb.sof.getBalance(firstForkedAccount);
    assert(balance > 999999);
  });

  it("should get storage values on the forked provider via the main provider", async() => {
    const result = await mainSusyWeb.sof.getStorageAt(contractAddress, contract.position_of_value);
    assert.strictEqual(mainSusyWeb.utils.hexToNumber(result), 7);
  });

  it("should get storage values on the forked provider via the main provider at a block number", async() => {
    const result = await mainSusyWeb.sof.getStorageAt(contractAddress, contract.position_of_value, 1);
    assert.strictEqual(mainSusyWeb.utils.hexToNumber(result), 5);
  });

  it("should execute calls against a contract on the forked provider via the main provider", async() => {
    var example = new mainSusyWeb.sof.Contract(JSON.parse(contract.abi), contractAddress);

    const result = await example.methods.value().call({ from: mainAccounts[0] });
    assert.strictEqual(mainSusyWeb.utils.hexToNumber(result), 7);

    // Make the call again to ensure caches updated and the call still works.
    const result2 = await example.methods.value().call({ from: mainAccounts[0] });
    assert.strictEqual(mainSusyWeb.utils.hexToNumber(result2), 7);
  });

  it("should make a transaction on the main provider while not transacting on the forked provider", async() => {
    var example = new mainSusyWeb.sof.Contract(JSON.parse(contract.abi), contractAddress);

    var forkedExample = new forkedSusyWeb.sof.Contract(JSON.parse(contract.abi), contractAddress);

    // TODO: ugly workaround - not sure why this is necessary.
    if (!forkedExample._requestManager.provider) {
      forkedExample._requestManager.setProvider(forkedSusyWeb.sof._provider);
    }

    await example.methods.setValue(25).send({ from: mainAccounts[0] });

    // It insta-mines, so we can make a call directly after.
    const result = await example.methods.value().call({ from: mainAccounts[0] });
    assert.strictEqual(mainSusyWeb.utils.hexToNumber(result), 25);

    // Now call back to the forked to ensure it's value stayed 5
    const forkedResult = await forkedExample.methods.value().call({ from: forkedAccounts[0] });
    assert.strictEqual(forkedSusyWeb.utils.hexToNumber(forkedResult), 7);
  });

  it("should ignore continued transactions on the forked blockchain by pegging the forked block number", async() => {
    // In this test, we're going to use the second contract address that we haven't
    // used previously. This ensures the data hasn't been cached on the main susyweb trie
    // yet, and it will require it forked to the forked provider at a specific block.
    // If that block handling is done improperly, this should fail.

    var example = new mainSusyWeb.sof.Contract(JSON.parse(contract.abi), secondContractAddress);

    var forkedExample = new forkedSusyWeb.sof.Contract(JSON.parse(contract.abi), secondContractAddress);

    // TODO: ugly workaround - not sure why this is necessary.
    if (!forkedExample._requestManager.provider) {
      forkedExample._requestManager.setProvider(forkedSusyWeb.sof._provider);
    }

    // This transaction happens entirely on the forked chain after forking.
    // It should be ignored by the main chain.
    await forkedExample.methods.setValue(800).send({ from: forkedAccounts[0] });
    // Let's assert the value was set correctly.
    const result = await forkedExample.methods.value().call({ from: forkedAccounts[0] });
    assert.strictEqual(forkedSusyWeb.utils.hexToNumber(result), 800);

    // Now lets check the value on the main chain. It shouldn't be 800.
    const mainResult = await example.methods.value().call({ from: mainAccounts[0] });
    assert.strictEqual(mainSusyWeb.utils.hexToNumber(mainResult), 5);
  });

  it("should maintain a block number that includes new blocks PLUS the existing chain", async() => {
    // Note: The main provider should be at block 5 at this test. Reasoning:
    // - The forked chain has an initial block, which is block 0.
    // - The forked chain performed a transaction that produced a log, resulting in block 1.
    // - The forked chain had two transactions initially, resulting blocks 2 and 3.
    // - The main chain forked from there, creating its own initial block, block 4.
    // - Then the main chain performed a transaction, putting it at block 5.

    const result = await mainSusyWeb.sof.getBlockNumber();
    assert.strictEqual(mainSusyWeb.utils.hexToNumber(result), 5);

    // Now lets get a block that exists on the forked chain.
    const mainBlock = await mainSusyWeb.sof.getBlock(0);
    // And compare it to the forked chain's block
    const forkedBlock = await forkedSusyWeb.sof.getBlock(0);
    // Block hashes should be the same.
    assert.strictEqual(mainBlock.hash, forkedBlock.hash);

    // Now make sure we can get the block by hash as well.
    const mainBlockByHash = await mainSusyWeb.sof.getBlock(mainBlock.hash);
    assert.strictEqual(mainBlock.hash, mainBlockByHash.hash);
  });

  it("should have a genesis block whose parent is the last block from the forked provider", async() => {
    const forkedBlock = await forkedSusyWeb.sof.getBlock(forkBlockNumber);
    const parentHash = forkedBlock.hash;
    const mainGenesisNumber = mainSusyWeb.utils.hexToNumber(forkBlockNumber) + 1;
    const mainGenesis = await mainSusyWeb.sof.getBlock(mainGenesisNumber);
    assert.strictEqual(mainGenesis.parentHash, parentHash);
  });

  // Note: This test also puts a new contract on the forked chain, which is a good test.
  it(
    "should represent the block number correctly in the Oracle contract (oracle.blockhash0)," +
      " providing forked block hash and number",
    async() => {
      const oraclePol = fs.readFileSync("./test/Oracle.pol", { encoding: "utf8" });
      const polcResult = polc.compile(oraclePol);
      const oracleOutput = polcResult.contracts[":Oracle"];

      const contract = new mainSusyWeb.sof.Contract(JSON.parse(oracleOutput.interface));
      const deployTxn = contract.deploy({ data: oracleOutput.bytecode });
      const oracle = await deployTxn.send({ from: mainAccounts[0], gas: 3141592 });

      const block = await mainSusyWeb.sof.getBlock(0);
      const blockhash = await oracle.methods.blockhash0().call();
      assert.strictEqual(blockhash, block.hash);

      const expectedNumber = await mainSusyWeb.sof.getBlockNumber();

      const number = await oracle.methods.currentBlock().call();
      assert.strictEqual(to.number(number), expectedNumber + 1);

      await oracle.methods.setCurrentBlock().send({ from: mainAccounts[0], gas: 3141592 });
      const val = await oracle.methods.lastBlock().call({ from: mainAccounts[0] });
      assert.strictEqual(to.number(val), expectedNumber + 1);
    }
  ).timeout(10000);

  // TODO
  it("should be able to get logs across the fork boundary", async() => {
    const example = new mainSusyWeb.sof.Contract(JSON.parse(contract.abi), contractAddress);
    const event = example.events.ValueSet({ fromBlock: 0, toBlock: "latest" });
    let callcount = 0;
    const eventData = new Promise((resolve, reject) => {
      event.on("data", function(log) {
        callcount++;
        if (callcount === 2) {
          event.removeAllListeners();
          resolve();
        }
      });
    });
    await eventData;
  }).timeout(30000);

  it("should return the correct nonce based on block number", async() => {
    // Note for the first two requests, we choose the block numbers 1 before and after the fork to
    // ensure we're pulling data off the correct provider in both cases.
    const [nonceBeforeFork, nonceAtFork, nonceLatestMain, nonceLatestFallback] = await Promise.all([
      mainSusyWeb.sof.getTransactionCount(forkedAccounts[0], forkBlockNumber - 1),
      mainSusyWeb.sof.getTransactionCount(forkedAccounts[0], forkBlockNumber + 1),
      mainSusyWeb.sof.getTransactionCount(forkedAccounts[0], "latest"),
      forkedSusyWeb.sof.getTransactionCount(forkedAccounts[0], "latest")
    ]);

    // First ensure our nonces for the block before the fork
    // Note that we're asking for the block *before* the forked block,
    // which automatically means we sacrifice a transaction (i.e., one nonce value)
    assert.strictEqual(nonceBeforeFork, initialFallbackAccountState.nonce - 1);

    // Now check at the fork. We should expect our initial state.
    assert.strictEqual(nonceAtFork, initialFallbackAccountState.nonce);

    // Make sure the main susyweb provider didn't alter the state of the forked account.
    // This means the nonce should stay the same.
    assert.strictEqual(nonceLatestMain, initialFallbackAccountState.nonce);

    // And since we made one additional transaction with this account on the forked
    // provider AFTER the fork, it's nonce should be one ahead, and the main provider's
    // nonce for that address shouldn't acknowledge it.
    assert.strictEqual(nonceLatestFallback, nonceLatestMain + 1);
  });

  it("should return the correct balance based on block number", async() => {
    // Note for the first two requests, we choose the block numbers 1 before and after the fork to
    // ensure we're pulling data off the correct provider in both cases.
    const [balanceBeforeFork, balanceAfterFork, balanceLatestMain, balanceLatestFallback] = [
      ...(await Promise.all([
        mainSusyWeb.sof.getBalance(forkedAccounts[0], forkBlockNumber - 1),
        mainSusyWeb.sof.getBalance(forkedAccounts[0], forkBlockNumber + 1),
        mainSusyWeb.sof.getBalance(forkedAccounts[0], "latest"),
        forkedSusyWeb.sof.getBalance(forkedAccounts[0], "latest")
      ]))
    ].map(function(el) {
      return mainSusyWeb.utils.toBN(el);
    });

    // First ensure our balances for the block before the fork
    // We do this by simply ensuring the balance has decreased since exact values
    // are hard to assert in this case.
    assert(balanceBeforeFork.gt(balanceAfterFork));

    // Make sure it's not substantially larger. it should only be larger by a small
    // amount (<2%). This assertion was added since forked balances were previously
    // incorrectly being converted between decimal and hex
    assert(balanceBeforeFork.muln(0.95).lt(balanceAfterFork));

    // Since the forked provider had once extra transaction for this account,
    // it should have a lower balance, and the main provider shouldn't acknowledge
    // that transaction.
    assert(balanceLatestMain.gt(balanceLatestFallback));

    // Make sure it's not substantially larger. it should only be larger by a small
    // amount (<2%). This assertion was added since forked balances were previously
    // incorrectly being converted between decimal and hex
    assert(balanceLatestMain.muln(0.95).lt(balanceLatestFallback));
  });

  it("should return the correct code based on block number", async() => {
    // This one is simpler than the previous two. Either the code exists or doesn't.
    const [codeEarliest, codeAfterFork, codeLatest] = [
      ...(await Promise.all([
        mainSusyWeb.sof.getCode(contractAddress, "earliest"),
        mainSusyWeb.sof.getCode(contractAddress, forkBlockNumber + 1),
        mainSusyWeb.sof.getCode(contractAddress, "latest")
      ]))
    ];

    // There should be no code initially.
    assert.strictEqual(codeEarliest, "0x");

    // Arbitrary length check since we can't assert the exact value
    assert(codeAfterFork.length > 20);
    assert(codeLatest.length > 20);

    // These should be the same since code can't change.
    assert.strictEqual(codeAfterFork, codeLatest);
  });

  it("should return transactions for blocks requested before the fork", async() => {
    const receipt = await forkedSusyWeb.sof.getTransactionReceipt(initialDeployTransactionHash);
    const referenceBlock = await forkedSusyWeb.sof.getBlock(receipt.blockNumber, true);
    const forkedBlock = await mainSusyWeb.sof.getBlock(receipt.blockNumber, true);
    assert.strictEqual(forkedBlock.transactions.length, referenceBlock.transactions.length);
    assert.deepStrictEqual(forkedBlock.transactions, referenceBlock.transactions);
  });

  it("should return a transaction for transactions made before the fork", async() => {
    const referenceTransaction = await forkedSusyWeb.sof.getTransaction(initialDeployTransactionHash);
    const forkedTransaction = await mainSusyWeb.sof.getTransaction(initialDeployTransactionHash);
    assert.deepStrictEqual(referenceTransaction, forkedTransaction);
  });

  it("should return a transaction receipt for transactions made before the fork", async() => {
    const referenceReceipt = await forkedSusyWeb.sof.getTransactionReceipt(initialDeployTransactionHash);
    assert.deepStrictEqual(referenceReceipt.transactionHash, initialDeployTransactionHash);

    const forkedReceipt = await mainSusyWeb.sof.getTransactionReceipt(initialDeployTransactionHash);
    assert.deepStrictEqual(forkedReceipt.transactionHash, initialDeployTransactionHash);
    assert.deepStrictEqual(referenceReceipt, forkedReceipt);
  });

  it("should return the same network version as the chain it forked from", async() => {
    const forkedNetwork = await forkedSusyWeb.sof.net.getId();
    const mainNetwork = await mainSusyWeb.sof.net.getId();
    assert.strictEqual(mainNetwork, forkedNetwork);
  });

  describe("Can debug a transaction", function() {
    let send;
    before("generate send", function() {
      send = generateSend(mainSusyWeb.currentProvider);
    });

    // this test does NOT validate the state of the debugged transaction. It only checks that
    // the debug_traceTransaction is callable on a forked Chain. We don't yet have tests
    // for forked debug_traceTransaction, but when we do, they'll be in debug.js (or similar), not here.
    it("can debug the transaction", async function() {
      const receipt = await mainSusyWeb.sof.sendTransaction({ from: mainAccounts[0], to: mainAccounts[1], value: 1 });
      await assert.doesNotReject(send("debug_traceTransaction", receipt.transactionHash, []));
    });
  });

  describe("fork_block_number", function() {
    const initialValue = "123";
    let forkedExample;
    let forkBlockNumber;
    let susyweb;
    before("Set up the initial chain with the values we want to test", async function() {
      forkedExample = new forkedSusyWeb.sof.Contract(JSON.parse(contract.abi), contractAddress);
      await forkedExample.methods.setValue(initialValue).send({ from: forkedAccounts[0] });
      forkBlockNumber = await forkedSusyWeb.sof.getBlockNumber();
      await forkedExample.methods.setValue("999").send({ from: forkedAccounts[0] });
    });

    before("create provider", function() {
      const provider = Susybraid.provider({
        fork: forkedTargetUrl.replace("ws", "http"),
        fork_block_number: forkBlockNumber
      });
      susyweb = new SusyWeb(provider);
    });

    it("should create a provider who's initial block is immediately after the fork_block_number", async() => {
      const blockNumber = await susyweb.sof.getBlockNumber();
      // Because we (currently) mine a "genesis" block when forking, the current block immediately after
      // initialization is 1 higher than the fork_block_number. This may change in the future by:
      // https://github.com/susy-knotsuite/susybraid-core/issues/341
      assert(blockNumber - 1, forkBlockNumber, "Initial block number on forked chain is not as expected");
    });

    it("should return original chain data from before the fork", async() => {
      const example = new susyweb.sof.Contract(JSON.parse(contract.abi), contractAddress);
      const result = await example.methods.value().call({ from: mainAccounts[0] });

      assert(result, initialValue, "Value return on forked chain is not as expected");
    });
  });

  after("Shutdown server", (done) => {
    forkedSusyWeb._provider.connection.close();
    forkedServer.close(function(serverCloseErr) {
      forkedSusyWeb.setProvider();
      let mainProvider = mainSusyWeb._provider;
      mainSusyWeb.setProvider();
      mainProvider.close(function(providerCloseErr) {
        if (serverCloseErr) {
          return done(serverCloseErr);
        }
        if (providerCloseErr) {
          return done(providerCloseErr);
        }
        done();
      });
    });
  });
});
