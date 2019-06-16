const assert = require("assert");
const BN = require("bn.js");
const sophys = require("sophys");
const intializeTestProvider = require("./helpers/susyweb/initializeTestProvider");

describe("sophys", async() => {
  let sophysProvider, wallet, gasPrice, value;
  const secretKey = "46".repeat(32);

  before("Setting up sophys wallet provider", async function() {
    this.timeout(10000);
    const susybraidOptions = {
      accounts: [
        {
          secretKey: `0x${secretKey}`,
          balance: `0x${new BN("1000000000000000000000").toString("hex")}`
        }
      ]
    };

    const { provider } = await intializeTestProvider(susybraidOptions);

    sophysProvider = new sophys.providers.SusyWebProvider(provider);
    const privateKey = Buffer.from(secretKey, "hex");
    wallet = new sophys.Wallet(privateKey);
    gasPrice = 20 * 10 ** 9; // 20000000000
    value = `0x${new BN(10).pow(new BN(18)).toString("hex")}`;
  });

  it("sophy.js transaction hash matches susybraid transaction hash for chainId 1", async() => {
    // This tx mostly matches SIP-155 example except for the nonce
    // https://octonion.institute/susytech/SIPs/blob/master/SIPS/sip-155.md
    const transaction = {
      nonce: 0,
      to: `0x${"35".repeat(20)}`,
      gasPrice,
      gasLimit: 21000,
      value: value,
      data: "",
      chainId: 1 // SIP 155 chainId - mainnet: 1, ropsten: 3
    };
    const signedTransaction = await wallet.sign(transaction);
    const sophysTxHash = sophys.utils.keccak256(signedTransaction);

    const { hash } = await sophysProvider.sendTransaction(signedTransaction);
    assert.deepStrictEqual(hash, sophysTxHash, "Transaction hash doesn't match sophyjs signed transaction hash");
  });

  it("sophy.js transaction hash matches susybraid transaction hash for auto chainId", async() => {
    // This tx mostly matches SIP-155 example except for the nonce and chainId
    // https://octonion.institute/susytech/SIPs/blob/master/SIPS/sip-155.md
    const transaction = {
      nonce: 1,
      to: `0x${"35".repeat(20)}`,
      gasPrice,
      gasLimit: 21000,
      value: value,
      data: ""
    };
    const signedTransaction = await wallet.sign(transaction);
    const sophysTxHash = sophys.utils.keccak256(signedTransaction);

    const { hash } = await sophysProvider.sendTransaction(signedTransaction);
    assert.deepStrictEqual(hash, sophysTxHash, "Transaction hash doesn't match sophyjs signed transaction hash");
  });
});
