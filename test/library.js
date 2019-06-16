const SusyWeb = require("susyweb");
const Susybraid = require(process.env.TEST_BUILD
  ? "../build/susybraid.core." + process.env.TEST_BUILD + ".js"
  : "../index.js");
const fs = require("fs");
const path = require("path");
const polc = require("polc");
const linker = require("polc/linker");
const assert = require("assert");

// Thanks polc. At least this works!
// This removes polc's overzealous uncaughtException event handler.
process.removeAllListeners("uncaughtException");

describe("Libraries", function() {
  let libraryData;
  let libraryAbi;
  let libraryAddress;
  let contractAbi;
  let contractInstance;
  let contractBytecode;

  const provider = Susybraid.provider();
  const susyweb = new SusyWeb(provider);
  let accounts = [];

  before("get accounts", async() => {
    accounts = await susyweb.sof.getAccounts();
  });

  before("compile sources - library & contract", async() => {
    this.timeout(10000);
    const librarySource = fs.readFileSync(path.join(__dirname, "Library.pol"), "utf8");
    const contractSource = fs.readFileSync(path.join(__dirname, "CallLibrary.pol"), "utf8");
    const input = {
      "Library.pol": librarySource,
      "CallLibrary.pol": contractSource
    };
    const result = polc.compile({ sources: input }, 1);

    libraryData = "0x" + result.contracts["Library.pol:Library"].bytecode;
    libraryAbi = JSON.parse(result.contracts["Library.pol:Library"].interface);

    contractBytecode = result.contracts["CallLibrary.pol:CallLibrary"].bytecode;
    contractAbi = JSON.parse(result.contracts["CallLibrary.pol:CallLibrary"].interface);
  });

  before("deploy library", async() => {
    const Library = new susyweb.sof.Contract(libraryAbi);
    const promiEvent = Library.deploy({ data: libraryData }).send({
      from: accounts[0],
      gas: 3141592
    });

    promiEvent.on("receipt", function(receipt) {
      libraryAddress = receipt.contractAddress;
    });

    await promiEvent;
  });

  before("deploy contract", async() => {
    contractBytecode = linker.linkBytecode(contractBytecode, { "Library.pol:Library": libraryAddress });
    const contractData = "0x" + contractBytecode;

    const CallLibraryContract = new susyweb.sof.Contract(contractAbi);
    const promiEvent = CallLibraryContract.deploy({ data: contractData }).send({
      from: accounts[0],
      gas: 3141592
    });

    contractInstance = await promiEvent;
  });

  after("cleanup", function() {
    susyweb.setProvider(null);
    provider.close(() => {});
  });

  describe("msg.sender for external library function calls", async() => {
    it("should return true - msg.sender is the externally owned account", async() => {
      const result = await contractInstance.methods.callExternalLibraryFunction().call();
      assert.strictEqual(true, result);
    });
  });
});
