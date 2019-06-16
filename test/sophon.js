const assert = require("assert");
const initializeTestProvider = require("./helpers/susyweb/initializeTestProvider");

describe("Sophon", function() {
  it("should get sophon version (sof_protocolVersion)", async function() {
    const { susyweb } = await initializeTestProvider();

    const result = await susyweb.sof.getProtocolVersion();
    assert.strictEqual(result, "63", "Network Version should be 63");
  });
});
