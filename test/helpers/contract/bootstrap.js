const { compileAndDeploy } = require("./compileAndDeploy");
const initializeTestProvider = require("../susyweb/initializeTestProvider");

/**
 * @param {Object} contractRef Object containing contract files and subdirectory path
 * @param {Object} options Provider options
 * @returns {Object} abi, accounts, bytecode, contract, instance, provider, receipt, sources, susyweb
 */
const bootstrap = async(contractRef = {}, options = {}) => {
  const { accounts, provider, send, susyweb } = await initializeTestProvider(options);

  const { contractFiles, contractSubdirectory } = contractRef;
  const [mainContractName, ...subContractNames] = contractFiles;
  const testAssets = await compileAndDeploy(mainContractName, subContractNames, contractSubdirectory, susyweb, accounts);

  return Object.assign(testAssets, { provider, send, susyweb });
};

module.exports = bootstrap;
