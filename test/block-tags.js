const assert = require("assert");
const initializeTestProvider = require("./helpers/susyweb/initializeTestProvider");
const { readFileSync } = require("fs");
const { compile } = require("polc");

describe("Block Tags", function() {
  let context;
  const initialState = {};

  before("Setting up susyweb", async function() {
    this.timeout(10000);

    const options = {
      mnemonic: "candy maple velvet cake sugar cream honey rich smooth crumble sweet treat",
      time: new Date(0) // Testing features that rely on determinate conditions
    };

    context = await initializeTestProvider(options);
  });

  before("Get initial balance, nonce and block number", async function() {
    const { accounts, susyweb } = context;

    const results = [
      susyweb.sof.getBalance(accounts[0]),
      susyweb.sof.getTransactionCount(accounts[0]),
      susyweb.sof.getBlockNumber()
    ];

    const [balance, nonce, blockNumber] = await Promise.all(results);

    Object.assign(initialState, {
      balance,
      blockNumber,
      nonce
    });
  });

  before("Make a transaction that changes the balance, code and nonce", async function() {
    const { accounts, susyweb } = context;
    const source = readFileSync("./test/contracts/examples/Example.pol", { encoding: "utf8" });
    const result = compile(source, 1);
    const { contractAddress } = await susyweb.sof.sendTransaction({
      from: accounts[0],
      data: "0x" + result.contracts[":Example"].bytecode,
      gas: 3141592
    });

    initialState.contractAddress = contractAddress;
  });

  it("should return the initial nonce at the previous block number", async function() {
    const { accounts, susyweb } = context;
    const { blockNumber, nonce } = initialState;
    let testNonce = await susyweb.sof.getTransactionCount(accounts[0], blockNumber);
    assert.strictEqual(testNonce, nonce);

    // Check that the nonce incremented with the block number, just to be sure.
    testNonce = await susyweb.sof.getTransactionCount(accounts[0], blockNumber + 1);
    assert.strictEqual(testNonce, nonce + 1);
  });

  it("should return the initial balance at the previous block number", async function() {
    const { accounts, susyweb } = context;
    const { balance, blockNumber } = initialState;
    let testBalance = await susyweb.sof.getBalance(accounts[0], blockNumber);
    assert.strictEqual(testBalance, balance);

    // Check that the balance incremented with the block number, just to be sure.
    testBalance = await susyweb.sof.getBalance(accounts[0], blockNumber + 1);
    const initialBalanceInSophy = parseFloat(susyweb.utils.fromWei(balance, "sophy"));
    const balanceInSophy = parseFloat(susyweb.utils.fromWei(testBalance, "sophy"));
    assert(balanceInSophy < initialBalanceInSophy);
  });

  it("should return the no code at the previous block number", async function() {
    const { susyweb } = context;
    const { contractAddress, blockNumber } = initialState;

    let code = await susyweb.sof.getCode(contractAddress, blockNumber);
    assert.strictEqual(code, "0x");

    // Check that the code incremented with the block number, just to be sure.
    code = await susyweb.sof.getCode(contractAddress, blockNumber + 1);
    assert.notStrictEqual(code, "0x");
    assert(code.length > 20); // Just because we don't know the actual code we're supposed to get back
  });

  it("should produce correct tx and receipt root when the block contains 1 (or more) tx's", async function() {
    const { susyweb } = context;
    const { blockNumber } = initialState;

    const block = await susyweb.sof.getBlock(blockNumber + 1, false);
    assert.strictEqual(block.transactions.length, 1, "should have one tx in the block.");
    assert.notStrictEqual(block.transactionsRoot, block.receiptsRoot, "Trie roots should not be equal.");
    assert.strictEqual(
      block.transactionsRoot,
      "0xce8a25092b27c67e802dff9e3ec66aacf6232da66e2796243aaccdc0deaaa1db",
      "Should produce correct transactionsRoot"
    );
    assert.strictEqual(
      block.receiptsRoot,
      "0xa63df9d6e2147dbffa164b173ead7c10d14d95c6e83dbb879ddc45ad7e8dfc89",
      "Should produce correct receiptsRoot"
    );
  });
});
