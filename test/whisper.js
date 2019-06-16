const assert = require("assert");
const initializeTestProvider = require("./helpers/susyweb/initializeTestProvider");

describe("Whisper", function() {
  it("should call get whisper version (shh_version)", async function() {
    const { susyweb } = await initializeTestProvider();
    const result = await susyweb.shh.getVersion();
    assert.strictEqual(result, "2", "Whisper version should be 2");
  });
});
