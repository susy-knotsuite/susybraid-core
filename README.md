[![npm](https://img.shields.io/npm/v/susybraid-core.svg)]()
[![npm](https://img.shields.io/npm/dm/susybraid-core.svg)]()
[![Build Status](https://travis-ci.org/susy-knotsuite/susybraid-core.svg?branch=master)](https://travis-ci.org/susy-knotsuite/susybraid-core)
[![Coverage Status](https://coveralls.io/repos/github/susy-knotsuite/susybraid-core/badge.svg?branch=develop)](https://coveralls.io/github/susy-knotsuite/susybraid-core?branch=develop)
# Susybraid Core

This is the core code that powers the Susybraid application and the Susybraid command line tool.

[Usage](#usage) | [Options](#options) | [Implemented Methods](#implemented-methods) | [Custom Methods](#custom-methods) | [Unsupported Methods](#unsupported-methods) | [Testing](#testing)

## Installation

`susybraid-core` is written in JavaScript and distributed as a Node.js package via `npm`. Make sure you have Node.js (>= v8.9.0) installed, and your environment is capable of installing and compiling `npm` modules.

**macOS** Make sure you have the XCode Command Line Tools installed. These are needed in general to be able to compile most C based languages on your machine, as well as many npm modules.

**Windows** See our [Windows install instructions](https://github.com/susy-knotsuite/susybraid-cli/wiki/Installing-susybraid-cli-on-Windows).

**Ubuntu/Linux** Follow the basic instructions for installing [Node.js](https://nodejs.org/en/download/package-manager/#debian-and-ubuntu-based-linux-distributions) and make sure that you have `npm` installed, as well as the `build-essential` `apt` package (it supplies `make` which you will need to compile most things). Use the official Node.js packages, *do not use the package supplied by your distribution.*

Using npm:

```Bash
npm install susybraid-core
```

or, if you are using [Yarn](https://yarnpkg.com/):

```Bash
yarn add susybraid-core
```


## Usage

As a [SusyWeb](https://octonion.institute/susy-js/susyweb.js/) provider:

```javascript
const susybraid = require("susybraid-core");
susyweb.setProvider(susybraid.provider());
```

As an [sophys.js](https://octonion.institute/susy-js/sophys.js/) provider:

```javascript
const susybraid = require("susybraid-core");
const provider = new sophys.providers.SusyWebProvider(susybraid.provider());
```

As a general HTTP and WebSocket server:

```javascript
const susybraid = require("susybraid-core");
const server = susybraid.server();
server.listen(port, function(err, blockchain) {...});
```

## Options

Both `.provider()` and `.server()` take a single object which allows you to specify behavior of the Susybraid instance. This parameter is optional. Available options are:

* `"accounts"`: `Array` of `Object`'s. Each object should have a `balance` key with a hexadecimal value. The key `secretKey` can also be specified, which represents the account's private key. If no `secretKey`, the address is auto-generated with the given balance. If specified, the key is used to determine the account's address.
* `"debug"`: `boolean` - Output VM opcodes for debugging
* `"blockTime"`: `number` - Specify blockTime in seconds for automatic mining. If you don't specify this flag, susybraid will instantly mine a new block for every transaction. Using the `blockTime` option is discouraged unless you have tests which require a specific mining interval.
* `"logger"`: `Object` - Object, like `console`, that implements a `log()` function.
* `"mnemonic"`: Use a specific HD wallet mnemonic to generate initial addresses.
* `"port"`: `number` Port number to listen on when running as a server.
* `"seed"`: Use arbitrary data to generate the HD wallet mnemonic to be used.
* `"default_balance_sophy"`: `number` - The default account balance, specified in sophy.
* `"total_accounts"`: `number` - Number of accounts to generate at startup.
* `"fork"`: `string` or `object` - Fork from another currently running Sophon client at a given block.  When a `string`, input should be the HTTP location and port of the other client, e.g. `http://localhost:8545`. You can optionally specify the block to fork from using an `@` sign: `http://localhost:8545@1599200`. Can also be a `SusyWeb Provider` object, optionally used in conjunction with the `fork_block_number` option below.
* `"fork_block_number"`: `string` or `number` - Block number the provider should fork from, when the `fork` option is specified. If the `fork` option is specified as a string including the `@` sign and a block number, the block number in the `fork` parameter takes precedence.
* `"network_id"`: Specify the network id susybraid-core will use to identify itself (defaults to the current time or the network id of the forked blockchain if configured)
* `"time"`: `Date` - Date that the first block should start. Use this feature, along with the `svm_increaseTime` method to test time-dependent code.
* `"locked"`: `boolean` - whether or not accounts are locked by default.
* `"unlocked_accounts"`: `Array` - array of addresses or address indexes specifying which accounts should be unlocked.
* `"db_path"`: `String` - Specify a path to a directory to save the chain database. If a database already exists, `susybraid-core` will initialize that chain instead of creating a new one.
* `"db"`: `Object` - Specify an alternative database instance, for instance [MemDOWN](https://github.com/level/memdown).
* `"ws"`: `boolean` Enable a websocket server. This is `true` by default.
* `"account_keys_path"`: `String` - Specifies a file to save accounts and private keys to, for testing.
* `"vmErrorsOnRPCResponse"`: `boolean` - whether or not to transmit transaction failures as RPC errors. Set to `false` for error reporting behaviour which is compatible with other clients such as graviton and Susy. This is `true` by default to replicate the error reporting behavior of previous versions of susybraid.
* `"hdPath"`: The hierarchical deterministic path to use when generating accounts. Default: "m/44'/60'/0'/0/"
* `"hardfork"`: `String` Allows to specify which hardfork should be used. Supported hardforks are `byzantium`, `constantinople`, and `petersburg` (default).
* `"allowUnlimitedContractSize"`: `boolean` - Allows unlimited contract sizes while debugging (NOTE: this setting is often used in conjuction with an increased `gasLimit`). By setting this to `true`, the check within the SVM for contract size limit of 24KB (see [SIP-170](https://git.io/vxZkK)) is bypassed. Setting this to `true` **will** cause `susybraid-core` to behave differently than production environments. (default: `false`; **ONLY** set to `true` during debugging).
* `"gasPrice"`: `String::hex` Sets the default gas price for transactions if not otherwise specified. Must be specified as a `hex` encoded string in `wei`. Defaults to `"0x77359400"` (2 `gwei`).
* `"gasLimit"`: `String::hex` Sets the block gas limit. Must be specified as a `hex` string. Defaults to `"0x6691b7"`.
* `"keepAliveTimeout"`:  `number` If using `.server()` - Sets the HTTP server's `keepAliveTimeout` in milliseconds. See the [NodeJS HTTP docs](https://nodejs.org/api/http.html#http_server_keepalivetimeout) for details. `5000` by default.

## Implemented Methods

The RPC methods currently implemented are:

* [sof_accounts](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_accounts)
* [sof_blockNumber](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_blockNumber)
* [sof_call](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_call)
* [sof_coinbase](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_coinbase)
* [sof_estimateGas](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_estimateGas)
* [sof_gasPrice](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_gasPrice)
* [sof_getBalance](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_getBalance)
* [sof_getBlockByNumber](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_getBlockByNumber)
* [sof_getBlockByHash](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_getBlockByHash)
* [sof_getBlockTransactionCountByHash](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_getBlockTransactionCountByHash)
* [sof_getBlockTransactionCountByNumber](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_getBlockTransactionCountByNumber)
* [sof_getCode](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_getCode)
* [sof_getCompilers](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_getCompilers)
* [sof_getFilterChanges](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_getFilterChanges)
* [sof_getFilterLogs](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_getFilterLogs)
* [sof_getLogs](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_getLogs)
* [sof_getStorageAt](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_getStorageAt)
* [sof_getTransactionByHash](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_getTransactionByHash)
* [sof_getTransactionByBlockHashAndIndex](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_getTransactionByBlockHashAndIndex)
* [sof_getTransactionByBlockNumberAndIndex](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_getTransactionByBlockNumberAndIndex)
* [sof_getTransactionCount](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_getTransactionCount)
* [sof_getTransactionReceipt](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_getTransactionReceipt)
* [sof_hashrate](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_hashrate)
* [sof_mining](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_mining)
* [sof_newBlockFilter](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_newBlockFilter)
* [sof_newFilter](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_newFilter)
* [sof_protocolVersion](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_protocolVersion)
* [sof_sendTransaction](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_sendTransaction)
* [sof_sendRawTransaction](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_sendRawTransaction)
* [sof_sign](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_sign)
* [sof_subscribe](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_subscribe)
* [sof_unsubscribe](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_unsubscribe)
* [shh_version](https://octonion.institute/susy-go/wiki/JSON-RPC#shh_version)
* [net_version](https://octonion.institute/susy-go/wiki/JSON-RPC#net_version)
* [net_peerCount](https://octonion.institute/susy-go/wiki/JSON-RPC#net_peerCount)
* [net_listening](https://octonion.institute/susy-go/wiki/JSON-RPC#net_listening)
* [sof_uninstallFilter](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_uninstallFilter)
* [sof_syncing](https://octonion.institute/susy-go/wiki/JSON-RPC#sof_syncing)
* [susyweb_clientVersion](https://octonion.institute/susy-go/wiki/JSON-RPC#susyweb_clientVersion)
* [susyweb_sha3](https://octonion.institute/susy-go/wiki/JSON-RPC#susyweb_sha3)
* `bzz_hive`
* `bzz_info`

#### Management API Methods

* [debug_traceTransaction](https://octonion.institute/susy-go/susy-graviton/wiki/Management-APIs#debug_tracetransaction)
* [miner_start](https://octonion.institute/susy-go/susy-graviton/wiki/Management-APIs#miner_start)
* [miner_stop](https://octonion.institute/susy-go/susy-graviton/wiki/Management-APIs#miner_stop)
* [personal_sendTransaction](https://octonion.institute/susy-go/susy-graviton/wiki/Management-APIs#personal_sendTransaction)
* [personal_unlockAccount](https://octonion.institute/susy-go/susy-graviton/wiki/Management-APIs#personal_unlockAccount)
* [personal_importRawKey](https://octonion.institute/susy-go/susy-graviton/wiki/Management-APIs#personal_importRawKey)
* [personal_newAccount](https://octonion.institute/susy-go/susy-graviton/wiki/Management-APIs#personal_newAccount)
* [personal_lockAccount](https://octonion.institute/susy-go/susy-graviton/wiki/Management-APIs#personal_lockAccount)
* [personal_listAccounts](https://octonion.institute/susy-go/susy-graviton/wiki/Management-APIs#personal_listaccounts)

## Custom Methods

Special non-standard methods that aren’t included within the original RPC specification:
* `svm_snapshot` : Snapshot the state of the blockchain at the current block. Takes no parameters. Returns the integer id of the snapshot created. A snapshot can only be used once. After a successful `svm_revert`, the same snapshot id cannot be used again. Consider creating a new snapshot after each `svm_revert` *if you need to revert to the same point multiple times*.
  ```bash
  curl -H "Content-Type: application/json" -X POST --data \
          '{"id":1337,"jsonrpc":"2.0","method":"svm_snapshot","params":[]}' \
          http://localhost:8545
  ```
  ```json
  { "id": 1337, "jsonrpc": "2.0", "result": "0x1" }
  ```
* `svm_revert` : Revert the state of the blockchain to a previous snapshot. Takes a single parameter, which is the snapshot id to revert to. This deletes the given snapshot, as well as any snapshots taken after (Ex: reverting to id `0x1` will delete snapshots with ids `0x1`, `0x2`, `etc`...  If no snapshot id is passed it will revert to the latest snapshot. Returns `true`.
  ```bash
  # Ex: ID "1" (hex encoded string)
  curl -H "Content-Type: application/json" -X POST --data \
          '{"id":1337,"jsonrpc":"2.0","method":"svm_revert","params":["0x1"]}' \
          http://localhost:8545
  ```
  ```json
  { "id": 1337, "jsonrpc": "2.0", "result": true }
  ```
* `svm_increaseTime` : Jump forward in time. Takes one parameter, which is the amount of time to increase in seconds. Returns the total time adjustment, in seconds.
  ```bash
  # Ex: 1 minute (number)
  curl -H "Content-Type: application/json" -X POST --data \
          '{"id":1337,"jsonrpc":"2.0","method":"svm_increaseTime","params":[60]}' \
          http://localhost:8545
  ```
  ```json
  { "id": 1337, "jsonrpc": "2.0", "result": "060" }
  ```
* `svm_mine` : Force a block to be mined. Takes one optional parameter, which is the timestamp a block should setup as the mining time. Mines a block independent of whether or not mining is started or stopped.
  ```bash
  # Ex: new Date("2009-01-03T18:15:05+00:00").getTime()
  curl -H "Content-Type: application/json" -X POST --data \
          '{"id":1337,"jsonrpc":"2.0","method":"svm_mine","params":[1231006505000]}' \
          http://localhost:8545
  ```

  ```json
  { "id": 1337, "jsonrpc": "2.0", "result": "0x0" }
  ```

## Unsupported Methods

* `sof_compilePolynomial`: If you'd like Polynomial compilation in Javascript, please see the [polc-js project](https://octonion.institute/susy-js/polc-js).


## Testing

Run tests via:

```
$ npm test
```

## License
[MIT](https://tldrlegal.com/license/mit-license)
