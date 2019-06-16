const Susybraid = require(process.env.TEST_BUILD
  ? "../build/susybraid.core." + process.env.TEST_BUILD + ".js"
  : "../index.js");
const { readFileSync } = require("fs");
const temp = require("temp").track();
const { compile } = require("polc");
const memdown = require("memdown");
const { join } = require("path");
const assert = require("assert");
const SusyWeb = require("susyweb");
const generateSend = require("./helpers/utils/rpc");

const source = readFileSync("./test/contracts/examples/Example.pol", { encoding: "utf8" });
const result = compile(source, 1);

// Note: Certain properties of the following contract data are hardcoded to
// maintain repeatable tests. If you significantly change the polynomial code,
// make sure to update the resulting contract data with the correct values.
const contract = {
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

const runTests = function(providerInit) {
  describe("Persistence ", function() {
    const susyweb = new SusyWeb();
    let accounts;
    let tx;
    let provider;

    before("init provider", function() {
      providerInit(function(p) {
        provider = p;
        susyweb.setProvider(p);
      });
    });

    before("Gather accounts", async function() {
      accounts = await susyweb.sof.getAccounts();
    });

    before("send transaction", async function() {
      tx = await susyweb.sof.sendTransaction({
        from: accounts[0],
        gas: "0x2fefd8",
        data: contract.binary
      });
    });

    it("should have block height 1", async function() {
      let res = await susyweb.sof.getBlockNumber();
      assert(res === 1);
      // Close the first provider now that we've gotten where we need to be.
      // Note: we specifically close the provider so we can read from the same db.
      provider.close(() => null); // pass dummy fn to satisfy callback expectation
    }).timeout(5000);

    it("should reopen the provider", function() {
      providerInit(function(p) {
        provider = p;
        susyweb.setProvider(provider);
      });
    }).slow(200);

    it("should still be on block height 1", async function() {
      const result = await susyweb.sof.getBlockNumber();
      assert(result === 1);
    }).timeout(5000);

    it("should still have block data for first block", async function() {
      await susyweb.sof.getBlock(1);
    });

    it("should have a receipt for the previous transaction", async function() {
      const receipt = await susyweb.sof.getTransactionReceipt(tx.transactionHash);
      assert.notStrictEqual(receipt, null, "Receipt shouldn't be null!");
      assert.strictEqual(receipt.transactionHash, tx.transactionHash);
    });

    it("should maintain the balance of the original accounts", async function() {
      const balance = await susyweb.sof.getBalance(accounts[0]);
      assert(balance > 98);
    });
  });
};

const runRegressionTests = function(regressionProviderInit, memdbProviderInit) {
  describe("Verify previous db compatibility", function() {
    const susyweb = new SusyWeb();
    const memdbSusyWeb = new SusyWeb();
    const str = JSON.stringify;
    const memdbBlocks = [];
    const blocks = [];
    let blockHeight = 2;
    let accounts;
    let memdbSend;

    before("init provider", function() {
      regressionProviderInit(function(p) {
        susyweb.setProvider(p);
      });
      memdbProviderInit(function(p) {
        memdbSusyWeb.setProvider(p);
        memdbSend = generateSend(p);
      });
    });

    before("Gather accounts", async function() {
      accounts = await susyweb.sof.getAccounts();
    });

    it("should have identical accounts (same mnemonic)", async function() {
      const memAccounts = await memdbSusyWeb.sof.getAccounts();
      assert.strictEqual(str(accounts), str(memAccounts), "accounts should be equal on both chains");
    });

    it(`should be on block height ${blockHeight} (db store)`, async function() {
      const result = await susyweb.sof.getBlockNumber();
      assert(result === blockHeight);
    });

    it("should be on block height 0 (mem store)", async function() {
      const result = await memdbSusyWeb.sof.getBlockNumber();
      assert(result === 0);
    });

    it("should issue/accept two tx's (mem store)", async function() {
      // Don't change the details of this tx - it's needed to deterministically match a manually created
      // DB with prior versions of susybraid-core
      let { timestamp } = await memdbSusyWeb.sof.getBlock(0);
      assert(timestamp);
      const txOptions = {
        from: accounts[0],
        to: accounts[1],
        value: 1
      };
      const receipt = await memdbSend("sof_sendTransaction", txOptions);
      await memdbSend("svm_mine", ++timestamp);
      const receipt2 = await memdbSend("sof_sendTransaction", txOptions);
      await memdbSend("svm_mine", ++timestamp);
      assert(receipt.result, "Should return a tx hash");
      assert(receipt2.result, "Should return a tx hash");
    });

    it("should be on block height 2 (mem store)", async function() {
      const result = await memdbSusyWeb.sof.getBlockNumber();
      assert(result === 2);
    });

    it.skip("should produce identical blocks (persistence db - memdb)", async function() {
      blocks.push(await susyweb.sof.getBlock(0, true));
      blocks.push(await susyweb.sof.getBlock(1, true));
      blocks.push(await susyweb.sof.getBlock(2, true));
      memdbBlocks.push(await memdbSusyWeb.sof.getBlock(0, true));
      memdbBlocks.push(await memdbSusyWeb.sof.getBlock(1, true));
      memdbBlocks.push(await memdbSusyWeb.sof.getBlock(2, true));
      for (let i = 0; i < blocks.length; i++) {
        assert.strictEqual(str(blocks[i]), str(memdbBlocks[i]));
      }
    });

    it.skip("should produce identical transactions (persistence db - memdb)", async function() {
      // Start at block 1 to skip genesis block
      for (let i = 1; i < blocks.length; i++) {
        const block = await memdbSusyWeb.sof.getBlock(i, false);
        for (let j = 0; j < block.transactions.length; j++) {
          const tx = await susyweb.sof.getTransaction(block.transactions[j]);
          const memDbTx = await memdbSusyWeb.sof.getTransaction(block.transactions[j]);
          assert(tx && memDbTx);
          assert.strictEqual(str(tx), str(memDbTx));
        }
      }
    });
  });
};

var mnemonic = "debris electric learn dove warrior grow pistol carry either curve radio hidden";

const providerInitGen = function(opts) {
  return function(cb) {
    const provider = Susybraid.provider(opts);
    cb(provider);
  };
};

describe("Default DB", function() {
  const dbPath = temp.mkdirSync("testrpc-db-");

  // initialize a persistent provider
  const providerInit = providerInitGen({
    db_path: dbPath,
    mnemonic
  });

  runTests(providerInit);
});

describe("Custom DB", function() {
  const db = memdown();

  // initialize a custom persistence provider
  const providerInit = providerInitGen({
    db,
    mnemonic
  });

  runTests(providerInit);
});

describe("Regression test DB", function() {
  // Don't change these options, we need these to match the saved chain in ./test/testdb
  const db = memdown();
  const dbPath = join(__dirname, "/testdb");
  const mnemonic = "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";
  const time = new Date("2009-01-03T18:15:05+00:00");
  const networkId = "1337";
  const blockTime = 1000; // An abundantly sufficient block time used with svm_mine for deterministic results

  // initialize a custom persistence provider
  const options = { mnemonic, network_id: networkId, time, blockTime };
  const dbOptions = Object.assign({}, options, { db_path: dbPath });
  const memdbOptions = Object.assign({}, options, { db });

  const dbProviderInit = providerInitGen(dbOptions);
  const memdbProviderInit = providerInitGen(memdbOptions);

  runRegressionTests(dbProviderInit, memdbProviderInit);
});
