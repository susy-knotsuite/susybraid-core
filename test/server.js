const assert = require("assert");
const pify = require("pify");
// this should not be a reference the built/lib Susybraid as we intentially are checking
// that it is returning an instance of an object in the test below.
const Susybraid = require("../index.js");
const StateManager = require("../lib/statemanager.js");

describe("server", () => {
  it("should return instance of StateManager on start", async() => {
    const server = Susybraid.server();
    try {
      const stateManager = await pify(server.listen)(8945);
      assert(stateManager instanceof StateManager, "server.listen must return instance of StateManager");
    } finally {
      await pify(server.close)();
    }
  });
});
