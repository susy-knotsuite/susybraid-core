const { join } = require("path");
const applyBaseConfig = require("../base.webpack.config");

const outputDir = join(__dirname, "..", "..", "build");
const outputFilename = "susybraid.server.node.js";

module.exports = applyBaseConfig({
  entry: "./lib/server.js",
  target: "node",
  output: {
    path: outputDir,
    filename: outputFilename,
    library: "SusybraidServer",
    libraryTarget: "umd",
    umdNamedDefine: true
  }
});
