const assert = require("assert");
const bootstrap = require("../helpers/contract/bootstrap");
const { hex } = require("../../lib/utils/to");
const randomInteger = require("../helpers/utils/generateRandomInteger");
const SEED_RANGE = 1000000;

describe("Gas", function() {
  describe("options:gasPrice", function() {
    const contractRef = {
      contractFiles: ["Example"],
      contractSubdirectory: "examples"
    };

    describe("default gasPrice", async function() {
      this.timeout(10000);
      it("should respect the default gasPrice", async function() {
        const susybraidProviderOptions = {};
        const context = await bootstrap(contractRef, susybraidProviderOptions);
        const { accounts, instance, provider, susyweb } = context;

        const assignedGasPrice = provider.engine.manager.state.gasPriceVal;

        const { transactionHash } = await instance.methods.setValue("0x10").send({ from: accounts[0], gas: 3141592 });
        const { gasPrice } = await susyweb.sof.getTransaction(transactionHash);

        assert.deepStrictEqual(hex(gasPrice), hex(assignedGasPrice));
      });
    });

    describe("zero gasPrice", async function() {
      this.timeout(10000);
      it("should be possible to set a zero gas price", async function() {
        const seed = randomInteger(SEED_RANGE);
        const susybraidProviderOptions = {
          seed,
          gasPrice: 0
        };
        const context = await bootstrap(contractRef, susybraidProviderOptions);

        const { accounts, instance, provider, susyweb } = context;

        const assignedGasPrice = provider.engine.manager.state.gasPriceVal;
        assert.deepStrictEqual(hex(assignedGasPrice), "0x0");

        const { transactionHash } = await instance.methods.setValue("0x10").send({ from: accounts[0], gas: 3141592 });
        const { gasPrice } = await susyweb.sof.getTransaction(transactionHash);
        assert.deepStrictEqual(hex(gasPrice), hex(assignedGasPrice));
      });
    });
  });
});
