const assert = require("assert");
const initializeTestProvider = require("../helpers/susyweb/initializeTestProvider");

describe("Gas", function() {
  describe("Custom Gas Price", function() {
    it("should return gas price of 15 when specified as a decimal", async function() {
      const susybraidProviderOptions = {
        gasPrice: 15
      };
      const { susyweb } = await initializeTestProvider(susybraidProviderOptions);
      const result = await susyweb.sof.getGasPrice();
      assert.strictEqual(parseInt(result), 15);
    });

    it("should return gas price of 15 when specified as hex (string)", async function() {
      const susybraidProviderOptions = {
        gasPrice: "0xf"
      };
      const { susyweb } = await initializeTestProvider(susybraidProviderOptions);
      const result = await susyweb.sof.getGasPrice();
      assert.strictEqual(parseInt(result), 15);
    });

    it("should return gas price of 15 when specified as decimal (string)", async function() {
      const susybraidProviderOptions = {
        gasPrice: "15"
      };
      const { susyweb } = await initializeTestProvider(susybraidProviderOptions);
      const result = await susyweb.sof.getGasPrice();
      assert.strictEqual(parseInt(result), 15);
    });
  });
});
