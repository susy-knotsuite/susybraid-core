const Susybraid = require(process.env.TEST_BUILD
  ? "../build/susybraid.core." + process.env.TEST_BUILD + ".js"
  : "../index.js");
const generateSend = require("./helpers/utils/rpc");
const promisify = require("pify");
const assert = require("assert");
const PORT = 8545;
const HOST = "127.0.0.1";
const HTTPADDRESS = `http://${HOST}:${PORT}`;

const testHttp = function(susyweb) {
  let susywebsend;
  let accounts;

  before("get personal accounts", async function() {
    accounts = await susyweb.sof.getAccounts();
  });

  before("setup provider send fn", function() {
    susywebsend = generateSend(susyweb.currentProvider);
  });

  describe("subscriptions", function() {
    it("should gracefully handle http subscription attempts", async function() {
      // Attempt to subscribe http connection to 'pendingTransactions'
      const { error } = await susywebsend("sof_subscribe", "pendingTransactions");
      assert(error, "http subscription should respond with an error");
      assert.strictEqual(error.code, -32000, "Error code should equal -32000");
      assert.strictEqual(error.message, "notifications not supported", "notifications should not be supported");

      // Issue a sendTransaction - susybraid should not attempt to issue a message to http subscriptions
      const { result } = await susywebsend("sof_sendTransaction", { from: accounts[0], value: "0x1" });
      // Get receipt -- ensure susybraid is still running/accepting calls
      let receipt = await susywebsend("sof_getTransactionReceipt", result);
      // Receipt indicates that susybraid has NOT crashed and continues to handle RPC requests
      assert(!receipt.error, "Should not respond with an error.");
      assert(receipt.result, "Should respond with a receipt.");
    });
  });
};

const testWebSocket = function(susyweb) {
  let susywebsend;

  before("setup provider send fn", function() {
    susywebsend = generateSend(susyweb.currentProvider);
  });

  describe("subscriptions", function() {
    it("should handle sof_subscribe/sof_unsubscribe", async function() {
      // Attempt to subscribe to 'newHeads'
      const receipt = await susywebsend("sof_subscribe", "newHeads");
      assert(receipt.result, "ID must be returned (sof_subscribe successful)");
      const result = await susywebsend("sof_unsubscribe", receipt.result);
      assert(result.result, "Result must be true (sof_unsubscribe successful)");
    });
  });
};

describe("WebSockets Server:", function() {
  const SusyWeb = require("susyweb");
  const susyweb = new SusyWeb();
  let server;

  before("Initialize Susybraid server", async function() {
    server = Susybraid.server({
      seed: "1337"
    });
    await promisify(server.listen)(PORT + 1);
    const provider = new SusyWeb.providers.WebsocketProvider("ws://localhost:" + (PORT + 1));
    susyweb.setProvider(provider);
  });

  testWebSocket(susyweb);

  after("Shutdown server", async function() {
    let provider = susyweb._provider;
    susyweb.setProvider();
    provider.connection.close();
    await promisify(server.close)();
  });
});

describe("HTTP Server should not handle subscriptions:", function() {
  const SusyWeb = require("susyweb");
  const susyweb = new SusyWeb();
  let server;

  before("Initialize Susybraid server", async function() {
    server = Susybraid.server({
      seed: "1337"
    });

    await promisify(server.listen)(PORT);
    susyweb.setProvider(new SusyWeb.providers.HttpProvider(HTTPADDRESS));
  });

  testHttp(susyweb);

  after("Shutdown server", async function() {
    await promisify(server.close)();
  });
});
