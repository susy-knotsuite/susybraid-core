const Susybraid = require(process.env.TEST_BUILD
  ? "../build/susybraid.core." + process.env.TEST_BUILD + ".js"
  : "../index.js");
const assert = require("assert");

describe("BuildType", function() {
  it("Tests that we are using the right version", () => {
    assert(process.env.TEST_BUILD ? Susybraid._webpacked === true : Susybraid._webpacked === false);
  });
});
