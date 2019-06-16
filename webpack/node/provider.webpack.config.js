const { join } = require("path");
const applyBaseConfig = require("../base.webpack.config");

const outputDir = join(__dirname, "..", "..", "build");
const outputFilename = "susybraid.provider.node.js";

module.exports = applyBaseConfig({
  entry: "./lib/provider.js",
  target: "node",
  output: {
    path: outputDir,
    filename: outputFilename,
    library: "SusybraidProvider",
    libraryTarget: "umd",
    umdNamedDefine: true
  }
});
