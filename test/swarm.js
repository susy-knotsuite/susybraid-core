const assert = require("assert");
const initializeTestProvider = require("./helpers/susyweb/initializeTestProvider");

describe("Swarm", function() {
  const context = initializeTestProvider();
  it.skip("should get swarm info (bzz_info)", async function() {
    const { susyweb } = context;
    const result = await susyweb.bzz.getInfo();
    assert.isArray(result, "Stub returns empty array");
  });

  it.skip("should get swarm hive (bzz_hive)", async function() {
    const { susyweb } = context;
    const result = await susyweb.bzz.getHive();
    assert.isArray(result, "Stub returns empty array");
  });
});
