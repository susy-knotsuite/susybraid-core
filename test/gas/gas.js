const assert = require("assert");
const sleep = require("../helpers/utils/sleep");
const bootstrap = require("../helpers/contract/bootstrap");
const confirmGasPrice = require("./lib/confirmGasPrice");
const initializeTestProvider = require("../helpers/susyweb/initializeTestProvider");
const randomInteger = require("../helpers/utils/generateRandomInteger");
const testTransactionEstimate = require("./lib/transactionEstimate");
const toBytesHexString = require("../helpers/utils/toBytesHexString");
const { deploy } = require("../helpers/contract/compileAndDeploy");
const BN = require("bn.js");
const createSignedTx = require("../helpers/utils/create-signed-tx");
const SEED_RANGE = 1000000;
const RSCLEAR_REFUND = 15000;
const RSCLEAR_REFUND_FOR_RESETTING_DIRTY_SLOT_TO_ZERO = 19800;
const RSELFDESTRUCT_REFUND = 24000;
const HARDFORKS = ["petersburg", "constantinople", "byzantium"];

describe("Gas", function() {
  HARDFORKS.forEach((hardfork) => {
    describe(`Hardfork: ${hardfork.toUpperCase()}`, function() {
      let context;
      const seed = randomInteger(SEED_RANGE);

      before("Setting up susyweb and contract", async function() {
        this.timeout(10000);

        const contractRef = {
          contractFiles: ["EstimateGas"],
          contractSubdirectory: "gas"
        };

        const susybraidProviderOptions = {
          seed,
          hardfork
        };

        context = await bootstrap(contractRef, susybraidProviderOptions);
      });

      describe("SIP150 Gas Estimation: ", function() {
        const privateKey = Buffer.from("4646464646464646464646464646464646464646464646464646464646464646", "hex");
        let ContractFactory;
        let TestDepth;
        let Donation;
        let Fib;
        let SendContract;
        before("Setting up SIP150 contracts", async function() {
          this.timeout(10000);

          const subDirectory = { contractSubdirectory: "gas" };
          const factory = Object.assign({ contractFiles: ["ContractFactory"] }, subDirectory);
          const testDepth = Object.assign({ contractFiles: ["TestDepth"] }, subDirectory);
          const donation = Object.assign({ contractFiles: ["Donation"] }, subDirectory);
          const fib = Object.assign({ contractFiles: ["Fib"] }, subDirectory);
          const sendContract = Object.assign({ contractFiles: ["SendContract"] }, subDirectory);

          const susybraidProviderOptions = { seed, hardfork };

          ContractFactory = await bootstrap(factory, susybraidProviderOptions);
          TestDepth = await bootstrap(testDepth, susybraidProviderOptions);
          Donation = await bootstrap(donation, susybraidProviderOptions);
          Fib = await bootstrap(fib, susybraidProviderOptions);
          SendContract = await bootstrap(
            sendContract,
            Object.assign(
              {
                accounts: [
                  {
                    secretKey: "0x" + privateKey.toString("hex"),
                    balance: "0x" + new BN("1000000000000000000000").toString("hex")
                  }
                ]
              },
              susybraidProviderOptions
            )
          );
        });

        it("Should estimate gas perfectly with SIP150 - recursive CALL", async() => {
          const { accounts, instance, send } = Fib;
          const txParams = {
            from: accounts[0],
            to: instance._address,
            value: 10
          };
          const { result: estimateHex } = await send("sof_estimateGas", txParams);
          const estimate = parseInt(estimateHex);
          const tx = Object.assign({ gas: `0x${(estimate - 1).toString(16)}` }, txParams);
          await assert.rejects(
            () => send("sof_sendTransaction", tx),
            {
              message: "VM Exception while processing transaction: out of gas"
            },
            `SANITY CHECK: Gas estimate: ${estimate - 1} is too high.`
          );
          tx.gas = estimateHex;
          await assert.doesNotReject(
            () => send("sof_sendTransaction", tx),
            undefined,
            `SANITY CHECK. Still not enough gas? ${estimate} Our estimate is still too low`
          );
        });

        it("Should estimate gas perfectly with SIP150 - CREATE", async() => {
          const { accounts, instance, send } = ContractFactory;
          const txParams = {
            from: accounts[0],
            to: instance._address,
            data: instance.methods.createInstance().encodeABI()
          };
          const { result: estimateHex } = await send("sof_estimateGas", txParams);
          const estimate = new BN(estimateHex.substring(2), "hex");
          txParams.gasLimit = "0x" + estimate.subn(1).toString("hex");
          await assert.rejects(() => send("sof_sendTransaction", txParams), {
            message: "VM Exception while processing transaction: revert"
          });

          txParams.gasLimit = estimateHex;
          await assert.doesNotReject(
            () => send("sof_sendTransaction", txParams),
            undefined,
            `SANITY CHECK. Still not enough gas? ${estimate} Our estimate is still too low`
          );
        });

        it("Should estimate gas perfectly with SIP150 - DELEGATECALL", async() => {
          const { accounts, instance } = TestDepth;
          const depth = 2;
          const est = await instance.methods.depth(depth).estimateGas();
          await assert.rejects(
            () =>
              instance.methods.depth(depth).send({
                from: accounts[0],
                gas: est - 1
              }),
            {
              message: "VM Exception while processing transaction: revert"
            }
          );

          await assert.doesNotReject(
            () =>
              instance.methods.depth(depth).send({
                from: accounts[0],
                gas: est
              }),
            undefined,
            `SANITY CHECK. Still not enough gas? ${est} Our estimate is still too low`
          );
        });

        it("Should estimate gas perfectly with SIP150 - CALL INSIDE CREATE", async() => {
          const { accounts, instance } = Donation;
          // Pre-condition
          const address = accounts[0];
          const donateTx = { from: address, value: 50 };
          donateTx.gas = await instance.methods.donate().estimateGas(donateTx);
          await instance.methods.donate().send(donateTx);
          const tx = { from: address };
          const est = await instance.methods.moveFund(address, 5).estimateGas(tx);
          tx.gas = est - 1;
          await assert.rejects(() => instance.methods.moveFund(address, 5).send(tx), {
            message: "VM Exception while processing transaction: out of gas"
          });
          tx.gas = est;
          await assert.doesNotReject(
            () => instance.methods.moveFund(address, 5).send(tx),
            undefined,
            `SANITY CHECK. Still not enough gas? ${est} Our estimate is still too low`
          );
        }).timeout(1000000);

        // TODO: Make this actually test SVT
        it("Should estimate gas perfectly with SIP150 - Simple Value Transfer", async() => {
          const { accounts, instance, send, susyweb } = SendContract;
          const toBN = (hex) => new BN(hex.substring(2), "hex");
          const toBNStr = (hex, base = 10) => toBN(hex).toString(base);
          const sign = createSignedTx(privateKey);
          const gasPrice = "0x77359400";
          const amountToTransfer = "0xfffffff1ff000000";

          // Get initial Balance after contract deploy
          const { result: balance } = await send("sof_getBalance", accounts[0]);

          // Initial seeding of capital to contract, we check the balance after.
          const tx = {
            gasPrice,
            value: amountToTransfer, // ~18 sophy
            from: accounts[0],
            to: instance._address
          };
          ({ result: tx.gasLimit } = await send("sof_estimateGas", tx));
          const { result: hash } = await send("sof_sendTransaction", tx);
          const {
            result: { gasUsed: initialGasUsed }
          } = await send("sof_getTransactionReceipt", hash);

          // Assert that the contract has the correct balance ~18 sophy
          const getBalance = await instance.methods.getBalance().call({ from: accounts[0] });
          assert.strictEqual(toBNStr(amountToTransfer), getBalance, "balance is not ~18 sophy");

          // It's not neccessary to sign but currently it's the only test that demonstrates sending signed
          // transactions that call a contract method.
          // Calling `encodeABI()` on the desired contract method will return the
          // the necessary bytecode to call the contract method with the given parameters
          // NOTE: errors from encodeABI are likely do to incorrect types for the method arguments
          // Double check the contracts method signature and your arguments
          // Ex: transfer(Address[], uint))  =>  transfer(Array, hex string of int)
          const txParams = {
            gasPrice,
            nonce: "0x2",
            to: instance._address,
            value: "0x0",
            data: instance.methods.transfer(accounts, amountToTransfer).encodeABI()
          };
          ({ result: txParams.gasLimit } = await send("sof_estimateGas", sign(txParams).serialize()));
          const { gasUsed: signedGasUsed } = await susyweb.sof.sendSignedTransaction(sign(txParams).serialize());
          const { result: newBalance } = await send("sof_getBalance", accounts[0]);
          // Gasprice * ( sum of gas used )
          const gas = toBN(gasPrice).mul(toBN(initialGasUsed).addn(signedGasUsed));
          // Our current balance, plus the wei spent on gas === original gas
          const currentBalancePlusGas = toBN(newBalance)
            .add(gas)
            .toString();
          assert.strictEqual(toBNStr(balance), currentBalancePlusGas, "balance + gas used !== to start balance");

          // Assert that signed tx successfully drains contract to address
          const newContractBalance = await instance.methods.getBalance().call({ from: accounts[0] });
          assert.strictEqual(newContractBalance, "0", "balance is not 0");
        }).timeout(10000);
      });

      describe("Refunds", function() {
        it(
          "accounts for Rsclear Refund in gasEstimate when a dirty storage slot is reset and it's original " +
            " value is 0",
          async function() {
            const { accounts, instance, provider } = context;
            const from = accounts[0];
            const options = { from, gas: 5000000 };

            // prime storage by making sure it is set to 0
            await instance.methods.reset().send(options);

            // update storage and then reset it back to 0
            const method = instance.methods.triggerRsclearRefund();

            const gasEstimate = await method.estimateGas(options);

            const receipt = await method.send({ from, gas: gasEstimate });

            switch (provider.options.hardfork) {
              case "byzantium":
              case "petersburg":
                assert.strictEqual(receipt.gasUsed, gasEstimate - RSCLEAR_REFUND);
                break;
              case "constantinople":
                // since storage was initially primed to 0 and we call triggerRsclearRefund(), which then
                // resets storage back to 0, 19800 gas is added to the refund counter per Constantinople SIP 1283
                assert.strictEqual(receipt.gasUsed, gasEstimate - RSCLEAR_REFUND_FOR_RESETTING_DIRTY_SLOT_TO_ZERO);
                break;
              default:
                throw new Error("Invalid hardfork option: " + provider.options.hardfork);
            }
            assert.strictEqual(receipt.gasUsed, receipt.cumulativeGasUsed);
          }
        );

        it(
          "accounts for Rsclear Refund in gasEstimate when a dirty storage slot is reset and it's " +
            "original value is not 0",
          async function() {
            const { accounts, instance, provider } = context;
            const from = accounts[0];
            const rsclearRefundForResettingDirtySlotToNonZeroValue = 4800;
            const options = { from, gas: 5000000 };

            await instance.methods.reset().send(options); // prime storage by making sure y is set to 1

            // update storage and then reset it back to 1
            const method = instance.methods.triggerRsclearRefundForY();

            const gasEstimate = await method.estimateGas(options);

            const receipt = await method.send({ from, gas: gasEstimate });

            switch (provider.options.hardfork) {
              case "byzantium":
              case "petersburg":
                // since we are resetting to a non-zero value, there is no gas added to the refund counter here
                assert.strictEqual(receipt.gasUsed, gasEstimate);
                break;
              case "constantinople":
                // since storage was initially primed to 1 and we call triggerRsclearRefundForY(), which then
                // resets storage back to 1, 4800 gas is added to the refund counter per Constantinople SIP 1283
                assert.strictEqual(receipt.gasUsed, gasEstimate - rsclearRefundForResettingDirtySlotToNonZeroValue);
                break;
              default:
                throw new Error("Invalid hardfork option: " + provider.options.hardfork);
            }
            assert.strictEqual(receipt.gasUsed, receipt.cumulativeGasUsed);
          }
        );

        it(
          "accounts for Rsclear Refund in gasEstimate when a fresh storage slot's original " +
            "value is not 0 and new value is 0",
          async function() {
            const { accounts, instance, provider } = context;
            const from = accounts[0];
            const rsclearRefundForUpdatingFreshSlotToZero = 15000;
            const options = { from, gas: 5000000 };

            // prime storage by making sure storage is set to 1
            await instance.methods.initialSettingOfX().send(options);

            // update storage to be 0
            const method = instance.methods.reset();

            const gasEstimate = await method.estimateGas(options);

            const receipt = await method.send({ from, gas: gasEstimate });

            switch (provider.options.hardfork) {
              case "byzantium":
              case "petersburg":
                assert.strictEqual(receipt.gasUsed, gasEstimate - RSCLEAR_REFUND);
                break;
              case "constantinople":
                // since storage was initially primed to 1 and we call reset(), which then sets
                // storage to 0, 15000 gas is added to the refund counter per Constantinople SIP 1283
                assert.strictEqual(receipt.gasUsed, gasEstimate - rsclearRefundForUpdatingFreshSlotToZero);
                break;
              default:
                throw new Error("Invalid hardfork option: " + provider.options.hardfork);
            }
            assert.strictEqual(receipt.gasUsed, receipt.cumulativeGasUsed);
          }
        );

        it(
          "accounts for Rsclear Refund in gasEstimate when a dirty storage slot's original value " +
            "is not 0 and new value is 0",
          async function() {
            const { accounts, instance, provider } = context;
            const from = accounts[0];
            const rsclearRefundForUpdatingDirtySlotToZero = 15000;
            const options = { from, gas: 5000000 };

            // prime storage by making sure storage is set to 1
            await instance.methods.initialSettingOfX().send(options);

            // update storage and then reset it to 0
            const method = instance.methods.triggerRsclearRefund();

            const gasEstimate = await method.estimateGas(options);

            const receipt = await method.send({ from, gas: gasEstimate });

            switch (provider.options.hardfork) {
              case "byzantium":
              case "petersburg":
                assert.strictEqual(receipt.gasUsed, gasEstimate - RSCLEAR_REFUND);
                break;
              case "constantinople":
                // since storage was initially primed to 1 and we call triggerRsclearRefund(), which then
                // sets storage to 0, 15000 gas is added to the refund counter per Constantinople SIP 1283
                assert.strictEqual(receipt.gasUsed, gasEstimate - rsclearRefundForUpdatingDirtySlotToZero);
                break;
              default:
                throw new Error("Invalid hardfork option: " + provider.options.hardfork);
            }
            assert.strictEqual(receipt.gasUsed, receipt.cumulativeGasUsed);
          }
        );

        it(
          "accounts for Rsclear Refund in gasEstimate when a dirty storage slot's original value " +
            "is not 0 and current value is 0",
          async function() {
            const { accounts, instance, provider } = context;
            const from = accounts[0];
            const options = { from, gas: 5000000 };

            // prime storage by making sure storage is set to 1
            await instance.methods.initialSettingOfX().send(options);

            // updates current value to 0 and new value to be the remaining amount of gas
            const method = instance.methods.triggerRsclearRefundForX();

            const gasEstimate = await method.estimateGas(options);

            const receipt = await method.send({ from, gas: gasEstimate });

            switch (provider.options.hardfork) {
              case "byzantium":
              case "petersburg":
                assert.strictEqual(receipt.gasUsed, gasEstimate - RSCLEAR_REFUND);
                break;
              case "constantinople":
                // since storage was initially primed to 1 and we call triggerRsclearRefundForX(), which then
                // resets storage's current value to 0 and 15000 gas is added to the refund counter, and then
                // it replaces x with gasleft, which removes 150000 gas from the refund counter per Constantinople
                // SIP 1283 leaving us with a rsclear refund of 0
                assert.strictEqual(receipt.gasUsed, gasEstimate);
                break;
              default:
                throw new Error("Invalid hardfork option: " + provider.options.hardfork);
            }
            assert.strictEqual(receipt.gasUsed, receipt.cumulativeGasUsed);
          }
        );

        it("accounts for Rselfdestruct Refund in gasEstimate", async function() {
          const { abi, accounts, bytecode, susyweb } = context;
          const from = accounts[0];
          const options = { from, gas: 5000000 };

          const deploymentOptions = { gas: 3141592 };
          const { instance } = await deploy(abi, bytecode, susyweb, deploymentOptions);
          await instance.methods.reset().send(options); // prime storage by making sure it is set to 0

          const method = instance.methods.triggerRselfdestructRefund();

          const gasEstimate = await method.estimateGas(options);

          const receipt = await method.send({ from, gas: gasEstimate });

          assert.strictEqual(receipt.gasUsed, gasEstimate - RSELFDESTRUCT_REFUND);
          assert.strictEqual(receipt.gasUsed, receipt.cumulativeGasUsed);
        });

        it("accounts for Rsclear and Rselfdestruct Refunds in gasEstimate", async function() {
          const { abi, accounts, bytecode, provider, susyweb } = context;
          const from = accounts[0];

          const deploymentOptions = { gas: 3141592 };
          const { instance } = await deploy(abi, bytecode, susyweb, deploymentOptions);
          await instance.methods.reset().send({ from, gas: 5000000 }); // prime storage by making sure it is set to 0

          const method = instance.methods.triggerAllRefunds();

          const gasEstimate = await method.estimateGas({ from });

          const receipt = await method.send({ from, gas: gasEstimate });

          switch (provider.options.hardfork) {
            case "byzantium":
            case "petersburg":
              assert.strictEqual(receipt.gasUsed, gasEstimate - RSELFDESTRUCT_REFUND - RSCLEAR_REFUND);
              break;
            case "constantinople":
              // since storage was initially primed to 0 and we call triggerAllRefunds(), which then
              // resets storage back to 0, 19800 gas is added to the refund counter per Constantinople SIP 1283
              assert.strictEqual(
                receipt.gasUsed,
                gasEstimate - RSELFDESTRUCT_REFUND - RSCLEAR_REFUND_FOR_RESETTING_DIRTY_SLOT_TO_ZERO
              );
              break;
            default:
              throw new Error("Invalid hardfork option: " + provider.options.hardfork);
          }
          assert.strictEqual(receipt.gasUsed, receipt.cumulativeGasUsed);
        });

        // Unskip this test once byzantium passes
        it("account Rsclear/Rselfdestruct/Refunds in gasEstimate w/many transactions in a block", async function() {
          const { abi, bytecode, provider } = context;
          const options = {
            blockTime: 0.5, // seconds
            seed,
            hardfork
          };
          const { accounts, susyweb } = await initializeTestProvider(options);

          const transactions = [
            {
              value: "0x10000000",
              gasLimit: "0x33450",
              from: accounts[2],
              to: accounts[1],
              nonce: "0x0"
            },
            {
              value: "0x10000000",
              gasLimit: "0x33450",
              from: accounts[2],
              to: accounts[1],
              nonce: "0x1"
            },
            {
              value: "0x10000000",
              gasLimit: "0x33450",
              from: accounts[1], // <
              to: accounts[2], // <^ reversed tx order
              nonce: "0x0"
            }
          ];

          // Precondition
          const initialBlockNumber = await susyweb.sof.getBlockNumber();
          assert.deepStrictEqual(initialBlockNumber, 0, "Current Block Should be 0");

          const deploymentOptions = { gas: 3141592 };
          const { instance } = await deploy(abi, bytecode, susyweb, deploymentOptions);

          // prime storage by making sure it is set to 0
          await instance.methods.reset().send({ from: accounts[0], gas: 5000000 });
          const method = instance.methods.triggerAllRefunds();
          const gasEstimate = await method.estimateGas({ from: accounts[0] });

          const hashes = await Promise.all(
            transactions.map((transaction) => {
              const promiEvent = susyweb.sof.sendTransaction(transaction);

              return new Promise((resolve) => {
                promiEvent.once("transactionHash", async(hash) => {
                  // Ensure there's no receipt since the transaction hasn't yet been processed. Ensure IntervalMining
                  const receipt = await susyweb.sof.getTransactionReceipt(hash);
                  assert.strictEqual(receipt, null, "No receipt since the transaction hasn't yet been processed.");
                  resolve(hash);
                });
              });
            })
          );

          const currentBlockNumber = await susyweb.sof.getBlockNumber();
          assert.deepStrictEqual(currentBlockNumber, 2, "Current Block Should be 2");

          const { gasUsed } = await method.send({ from: accounts[0], gas: gasEstimate });

          let transactionCostMinusRefund = gasEstimate - RSELFDESTRUCT_REFUND - RSCLEAR_REFUND;
          switch (provider.options.hardfork) {
            case "byzantium":
            case "petersburg":
              assert.strictEqual(gasUsed, transactionCostMinusRefund);
              break;
            case "constantinople":
              // since storage was initially primed to 0 and we call triggerAllRefunds(), which then
              // resets storage back to 0, 19800 gas is added to the refund counter per Constantinople SIP 1283
              transactionCostMinusRefund =
                gasEstimate - RSELFDESTRUCT_REFUND - RSCLEAR_REFUND_FOR_RESETTING_DIRTY_SLOT_TO_ZERO;
              assert.strictEqual(gasUsed, transactionCostMinusRefund);
              break;
            default:
              throw new Error("Invalid hardfork option: " + provider.options.hardfork);
          }

          const receipt = await Promise.all(hashes.map((hash) => susyweb.sof.getTransactionReceipt(hash)));
          assert.deepStrictEqual(receipt[0].gasUsed, receipt[1].gasUsed, "Tx1 and Tx2 should cost the same gas.");
          assert.deepStrictEqual(
            receipt[1].gasUsed,
            receipt[2].gasUsed,
            "Tx2 and Tx3 should cost the same gas. -> Tx1 gas === Tx3 gas Transitive"
          );
          assert.deepStrictEqual(
            receipt[1].transactionIndex > receipt[2].transactionIndex,
            true,
            "(Tx3 has a lower nonce) -> (Tx3 index is < Tx2 index)"
          );
          const currentBlock = await susyweb.sof.getBlock(receipt[0].blockNumber);

          // ( Tx3 has a lower nonce -> Tx3 index is < Tx2 index ) -> cumulative gas Tx2 > Tx3 > Tx1
          const isAccumulating =
            receipt[1].cumulativeGasUsed > receipt[2].cumulativeGasUsed &&
            receipt[2].cumulativeGasUsed > receipt[0].cumulativeGasUsed;

          assert.deepStrictEqual(
            isAccumulating,
            true,
            "Cumulative gas should be accumulating for any transactions in the same block."
          );

          assert.deepStrictEqual(
            receipt[0].gasUsed,
            receipt[0].cumulativeGasUsed,
            "Gas and cumulative gas should be equal for the FIRST Tx."
          );

          assert.notDeepStrictEqual(
            receipt[1].gasUsed,
            receipt[1].cumulativeGasUsed,
            "Gas and cumulative gas should NOT be equal for the Second Tx."
          );

          assert.notDeepStrictEqual(
            receipt[2].gasUsed,
            receipt[2].cumulativeGasUsed,
            "Gas and cumulative gas should NOT be equal for the Third Tx."
          );

          const totalGas = receipt[0].gasUsed + receipt[1].gasUsed + receipt[2].gasUsed;
          assert.deepStrictEqual(
            totalGas + transactionCostMinusRefund,
            receipt[1].cumulativeGasUsed,
            "Total Gas should equal the final tx.cumulativeGas"
          );

          assert.deepStrictEqual(
            totalGas + transactionCostMinusRefund,
            currentBlock.gasUsed,
            "Total Gas should be equal to the currentBlock.gasUsed"
          );
        });

        it("clears mapping storage slots", async function() {
          const { accounts, instance } = context;
          const from = accounts[0];
          const options = { from };

          await instance.methods.reset().send({ from, gas: 5000000 });

          const uintsa = await instance.methods.uints(1).call();
          assert.strictEqual(uintsa, "0", "initial value is not correct");

          const receipta = await instance.methods.store(1).send(options);
          assert.strictEqual(receipta.status, true, "storing value did not work");

          const uintsb = await instance.methods.uints(1).call();
          assert.strictEqual(uintsb, "1", "set value is incorrect");

          const receiptb = await instance.methods.clear().send(options);
          assert.strictEqual(receiptb.status, true, "clearing value did not work");

          const uintsc = await instance.methods.uints(1).call();
          assert.strictEqual(uintsc, "0", "cleared value is not correct");
        });
      });

      describe("Estimation", function() {
        it("matches estimate for deployment", async function() {
          const { accounts, bytecode, contract, receipt } = context;
          const gasEstimate = await contract.deploy({ data: bytecode }).estimateGas({
            from: accounts[1]
          });

          assert.deepStrictEqual(receipt.gasUsed, gasEstimate);
          assert.deepStrictEqual(receipt.cumulativeGasUsed, gasEstimate);
        });

        it("matches usage for complex function call (add)", async function() {
          const { accounts, instance } = context;
          await testTransactionEstimate(
            instance.methods.add,
            [toBytesHexString("Tim"), toBytesHexString("A great guy"), 10],
            { from: accounts[0], gas: 3141592 },
            instance
          );
        }).timeout(10000);

        it("matches usage for complex function call (transfer)", async function() {
          const { accounts, instance } = context;
          await testTransactionEstimate(
            instance.methods.transfer,
            ["0x0123456789012345678901234567890123456789", 5, toBytesHexString("Tim")],
            { from: accounts[0], gas: 3141592 },
            instance
          );
        }).timeout(10000);

        it("matches usage for simple account to account transfer", async function() {
          const { accounts, susyweb } = context;
          const transferAmount = susyweb.utils.toBN(susyweb.utils.toWei("5", "finney"));
          const transactionData = {
            from: accounts[0],
            to: accounts[1],
            value: transferAmount
          };

          const susywebTransactions = [
            await susyweb.sof.estimateGas(transactionData),
            await susyweb.sof.sendTransaction(transactionData)
          ];
          const [gasEstimate, receipt] = await Promise.all(susywebTransactions);

          assert.strictEqual(receipt.gasUsed, gasEstimate);
        });
      });

      describe("Expenditure", function() {
        it("should calculate gas expenses correctly in consideration of the default gasPrice", async function() {
          const { accounts, susyweb } = context;
          const transferAmount = "500";
          const gasPrice = await susyweb.sof.getGasPrice();
          await confirmGasPrice(gasPrice, false, susyweb, accounts, transferAmount);
        });

        it("should calculate gas expenses correctly in consideration of the requested gasPrice", async function() {
          const transferAmount = "500";
          const gasPrice = "0x10000";
          const { accounts, susyweb } = context;
          await confirmGasPrice(gasPrice, true, susyweb, accounts, transferAmount);
        });

        it("should calculate gas expenses correctly with a user-defined default gasPrice", async function() {
          const transferAmount = "500";
          const gasPrice = "0x2000";
          const options = { seed, gasPrice };
          const { accounts, susyweb } = await initializeTestProvider(options);
          await confirmGasPrice(gasPrice, false, susyweb, accounts, transferAmount);
        });

        it("should calculate cumalativeGas and gasUsed correctly for many transactions in a block", async function() {
          const options = {
            blockTime: 0.5, // seconds
            seed
          };
          const { accounts, susyweb } = await initializeTestProvider(options);

          const transactions = [
            {
              value: "0x10000000",
              gasLimit: "0x33450",
              from: accounts[0],
              to: accounts[1],
              nonce: "0x0"
            },
            {
              value: "0x10000000",
              gasLimit: "0x33450",
              from: accounts[0],
              to: accounts[1],
              nonce: "0x1"
            },
            {
              value: "0x10000000",
              gasLimit: "0x33450",
              from: accounts[1], // <
              to: accounts[0], // <^ reversed tx order
              nonce: "0x0"
            }
          ];

          // Precondition
          const initialBlockNumber = await susyweb.sof.getBlockNumber();
          assert.deepStrictEqual(initialBlockNumber, 0, "Current Block Should be 0");

          const hashes = await Promise.all(
            transactions.map((transaction) => {
              const promiEvent = susyweb.sof.sendTransaction(transaction);

              return new Promise((resolve) => {
                promiEvent.once("transactionHash", async(hash) => {
                  // Ensure there's no receipt since the transaction hasn't yet been processed. Ensure IntervalMining
                  const receipt = await susyweb.sof.getTransactionReceipt(hash);
                  assert.strictEqual(receipt, null, "No receipt since the transaction hasn't yet been processed.");

                  resolve(hash);
                });
              });
            })
          );

          // Wait .75 seconds (1.5x the mining interval) then get the receipt. It should be processed.
          await sleep(750);

          const currentBlockNumber = await susyweb.sof.getBlockNumber();
          assert.deepStrictEqual(currentBlockNumber, 1, "Current Block Should be 1");

          const currentBlock = await susyweb.sof.getBlock(currentBlockNumber);

          const receipt = await Promise.all(hashes.map((hash) => susyweb.sof.getTransactionReceipt(hash)));

          assert.deepStrictEqual(receipt[0].gasUsed, receipt[1].gasUsed, "Tx1 and Tx2 should cost the same gas.");
          assert.deepStrictEqual(
            receipt[1].gasUsed,
            receipt[2].gasUsed,
            "Tx2 and Tx3 should cost the same gas. -> Tx1 gas === Tx3 gas Transitive"
          );
          assert.deepStrictEqual(
            receipt[1].transactionIndex > receipt[2].transactionIndex,
            true,
            "(Tx3 has a lower nonce) -> (Tx3 index is < Tx2 index)"
          );

          // ( Tx3 has a lower nonce -> Tx3 index is < Tx2 index ) -> cumulative gas Tx2 > Tx3 > Tx1
          const isAccumulating =
            receipt[1].cumulativeGasUsed > receipt[2].cumulativeGasUsed &&
            receipt[2].cumulativeGasUsed > receipt[0].cumulativeGasUsed;
          assert.deepStrictEqual(
            isAccumulating,
            true,
            "Cumulative gas should be accumulating for any transactions in the same block."
          );
          assert.deepStrictEqual(
            receipt[0].gasUsed,
            receipt[0].cumulativeGasUsed,
            "Gas and cumulative gas should be equal for the FIRST Tx."
          );
          assert.notDeepStrictEqual(
            receipt[1].gasUsed,
            receipt[1].cumulativeGasUsed,
            "Gas and cumulative gas should NOT be equal for the Second Tx."
          );
          assert.notDeepStrictEqual(
            receipt[2].gasUsed,
            receipt[2].cumulativeGasUsed,
            "Gas and cumulative gas should NOT be equal for the Third Tx."
          );

          const totalGas = receipt[0].gasUsed + receipt[1].gasUsed + receipt[2].gasUsed;
          assert.deepStrictEqual(
            totalGas,
            receipt[1].cumulativeGasUsed,
            "Total Gas should be equal the final tx.cumulativeGas"
          );
          assert.deepStrictEqual(
            totalGas,
            currentBlock.gasUsed,
            "Total Gas should be equal to the currentBlock.gasUsed"
          );
        });
      });
    });
  });
});
