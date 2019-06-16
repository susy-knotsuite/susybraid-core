const assert = require("assert");
const initializeTestProvider = require("../helpers/susyweb/initializeTestProvider");

describe("Gas", function() {
  describe("Custom Gas Limit", function() {
    it("The block should show the correct custom Gas Limit", async function() {
      const susybraidProviderOptions = { gasLimit: 5000000 };
      const { susyweb } = await initializeTestProvider(susybraidProviderOptions);
      const { gasLimit } = await susyweb.sof.getBlock(0);

      assert.deepStrictEqual(gasLimit, 5000000);
    });
  });
});
