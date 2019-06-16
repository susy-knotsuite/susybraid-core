const Susybraid = require(process.env.TEST_BUILD
  ? "../../../build/susybraid.core." + process.env.TEST_BUILD + ".js"
  : "../../../index.js");
const SusyWeb = require("susyweb");
const generateSend = require("../utils/rpc");

/**
 * Initialize Susybraid provider with `options`
 * @param {Object} options - Susybraid provider options
 * @returns {Object} accounts, provider, send, susyweb Object
 */
const initializeTestProvider = async(options = {}, provider = null) => {
  provider = provider || Susybraid.provider(options);
  const send = generateSend(provider);
  const susyweb = new SusyWeb(provider);
  const accounts = await susyweb.sof.getAccounts();

  return {
    accounts,
    provider,
    send,
    susyweb
  };
};

module.exports = initializeTestProvider;
