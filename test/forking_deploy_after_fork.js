var SusyWeb = require("susyweb");
var SusyWebWsProvider = require("susyweb-providers-ws");
var assert = require("assert");
var Susybraid = require(process.env.TEST_BUILD
  ? "../build/susybraid.core." + process.env.TEST_BUILD + ".js"
  : "../index.js");
var fs = require("fs");
var polc = require("polc");

var logger = {
  log: function(msg) {
    /* console.log(msg) */
  }
};

/**
 * NOTE: Naming in these tests is a bit confusing. Here, the "main chain"
 * is the main chain the tests interact with; and the "forked chain" is the
 * chain that _was forked_. This is in contrast to general naming, where the
 * main chain represents the main chain to be forked (like the Sophon live
 * network) and the fork chaing being "the fork".
 */

describe("Contract Deployed on Main Chain After Fork", function() {
  var contract;
  var contractAddress;
  var forkedServer;
  var mainAccounts;

  var forkedSusyWeb = new SusyWeb();
  var mainSusyWeb = new SusyWeb();

  var forkedTargetUrl = "ws://localhost:21345";

  before("set up test data", function() {
    this.timeout(10000);
    var source = fs.readFileSync("./test/contracts/examples/Example.pol", { encoding: "utf8" });
    var result = polc.compile(source, 1);

    // Note: Certain properties of the following contract data are hardcoded to
    // maintain repeatable tests. If you significantly change the polynomial code,
    // make sure to update the resulting contract data with the correct values.
    contract = {
      polynomial: source,
      abi: result.contracts[":Example"].interface,
      binary: "0x" + result.contracts[":Example"].bytecode,
      position_of_value: "0x0000000000000000000000000000000000000000000000000000000000000000",
      expected_default_value: 5,
      call_data: {
        gas: "0x2fefd8",
        gasPrice: "0x1", // This is important, as passing it has exposed errors in the past.
        to: null, // set by test
        data: "0x3fa4f245"
      },
      transaction_data: {
        from: null, // set by test
        gas: "0x2fefd8",
        to: null, // set by test
        data: "0x552410770000000000000000000000000000000000000000000000000000000000000019" // sets value to 25 (base 10)
      }
    };
  });

  before("Initialize Fallback Susybraid server", function(done) {
    this.timeout(10000);
    forkedServer = Susybraid.server({
      // Do not change seed. Determinism matters for these tests.
      seed: "let's make this deterministic",
      ws: true,
      logger: logger
    });

    forkedServer.listen(21345, function(err) {
      if (err) {
        return done(err);
      }
      done();
    });
  });

  before("set forkedSusyWeb provider", function() {
    forkedSusyWeb.setProvider(new SusyWebWsProvider(forkedTargetUrl));
  });

  before("Set main susyweb provider, forking from forked chain at this point", function() {
    mainSusyWeb.setProvider(
      Susybraid.provider({
        fork: forkedTargetUrl.replace("ws", "http"),
        logger,
        verbose: true,

        // Do not change seed. Determinism matters for these tests.
        seed: "a different seed"
      })
    );
  });

  before("Gather main accounts", async function() {
    this.timeout(5000);
    mainAccounts = await mainSusyWeb.sof.getAccounts();
  });

  before("Deploy initial contract", async function() {
    const receipt = await mainSusyWeb.sof.sendTransaction({
      from: mainAccounts[0],
      data: contract.binary,
      gas: 3141592,
      value: mainSusyWeb.utils.toWei("1", "sophy")
    });

    contractAddress = receipt.contractAddress;

    // Ensure there's *something* there.
    const code = await mainSusyWeb.sof.getCode(contractAddress);
    assert.notStrictEqual(code, null);
    assert.notStrictEqual(code, "0x");
    assert.notStrictEqual(code, "0x0");
  });

  it("should send 1 sophy to the created contract, checked on the forked chain", async function() {
    const balance = await mainSusyWeb.sof.getBalance(contractAddress);

    assert.strictEqual(balance, mainSusyWeb.utils.toWei("1", "sophy"));
  });

  after("Shutdown server", function(done) {
    forkedSusyWeb._provider.connection.close();
    forkedServer.close(function(serverCloseErr) {
      forkedSusyWeb.setProvider();
      let mainProvider = mainSusyWeb._provider;
      mainSusyWeb.setProvider();
      mainProvider.close(function(providerCloseErr) {
        if (serverCloseErr) {
          return done(serverCloseErr);
        }
        if (providerCloseErr) {
          return done(providerCloseErr);
        }
        done();
      });
    });
  });
});
