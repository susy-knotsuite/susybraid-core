const polc = require("polc");
const { join } = require("path");
const { readFileSync } = require("fs");

/**
 * Compile the specified contract(s)
 * @param {String} mainContractName  Name of the main contract (without .pol extension)
 * @param {Array|String} contractFileNames List of imported contracts
 * @param {String} contractPath  Path to contracts directory
 * @returns {Object} context: abi, bytecode, sources
 */
function compile(mainContractName, contractFileNames = [], contractSubdirectory) {
  const contractPath = join(__dirname, "..", "..", "contracts", `${contractSubdirectory}/`);
  const selectedContracts = [mainContractName].concat(contractFileNames);

  const contractSources = selectedContracts.map((contractName) => {
    const _contractName = `${contractName.replace(/\.pol$/i, "")}.pol`;
    return { [_contractName]: readFileSync(join(contractPath, _contractName), "utf8") };
  });

  const sources = Object.assign({}, ...contractSources);

  // Second parameter configures polc to optimize compiled code
  const { contracts } = polc.compile({ sources }, 1);

  const _mainContractName = mainContractName.replace(/\.pol$/i, "");
  const compiledMainContract = contracts[`${_mainContractName}.pol:${_mainContractName}`];
  const bytecode = `0x${compiledMainContract.bytecode}`;
  const abi = JSON.parse(compiledMainContract.interface);

  return {
    abi,
    bytecode,
    sources
  };
}

/**
 * Deploy a compiled contract
 * @param {String} abi  contract ABI
 * @param {String} bytecode  contract bytecode
 * @param {Object} susyweb SusyWeb interface
 * @param {Object} options Provider options
 * @param {Array} existingAccounts Existing accounts
 * @returns {Object} context: abi, accounts, bytecode, contract, instance, receipt
 */
async function deploy(abi, bytecode, susyweb, options = {}, existingAccounts = []) {
  let accounts, block, receipt;

  if (existingAccounts.length) {
    block = await susyweb.sof.getBlock("latest");
  } else {
    const initialAssets = [susyweb.sof.getAccounts(), susyweb.sof.getBlock("latest")];
    [accounts, block] = await Promise.all(initialAssets);
  }

  const gas = options.gas || block.gasLimit;
  const contract = new susyweb.sof.Contract(abi);
  const instance = await contract
    .deploy({ data: bytecode })
    .send({ from: accounts[0], gas })
    .on("receipt", (rcpt) => {
      receipt = rcpt;
    });

  return {
    abi,
    accounts,
    bytecode,
    contract,
    instance,
    receipt
  };
}

/**
 * Compile and deploy the specified contract(s)
 * @param {String} mainContractName  Name of the main contract (without .pol extension)
 * @param {Array|String} contractFileNames List of imported contracts
 * @param {String} contractPath  Path to contracts directory
 * @param {Object} susyweb SusyWeb interface
 * @param {Object} options Provider options
 * @param {Array} accounts Predetermined accounts
 * @returns {Object} context: abi, accounts, bytecode, contract, instance, receipt, sources
 */
async function compileAndDeploy(
  mainContractName,
  contractFileNames = [],
  contractPath,
  susyweb,
  options = {},
  accounts = []
) {
  const { abi, bytecode, sources } = compile(mainContractName, contractFileNames, contractPath);
  const context = await deploy(abi, bytecode, susyweb, options, accounts);
  return Object.assign(context, { sources });
}

module.exports = {
  compile,
  compileAndDeploy,
  deploy
};
