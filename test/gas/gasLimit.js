const assert = require("assert");
const to = require("../../lib/utils/to.js");
const initializeTestProvider = require("../helpers/susyweb/initializeTestProvider");
const randomInteger = require("../helpers/utils/generateRandomInteger");
const SEED_RANGE = 1000000;

describe("Gas", function() {
  describe("options:gasLimit", function() {
    let context;
    before("Setting up susyweb", async function() {
      this.timeout(10000);
      const seed = randomInteger(SEED_RANGE);
      const susybraidProviderOptions = { seed };
      context = await initializeTestProvider(susybraidProviderOptions);
    });

    it("should respect the assigned gasLimit", async function() {
      const { provider, susyweb } = context;
      const assignedGasLimit = provider.engine.manager.state.blockchain.blockGasLimit;
      const { gasLimit } = await susyweb.sof.getBlock("latest");
      assert.deepStrictEqual(gasLimit, to.number(assignedGasLimit));
    });
  });
});
