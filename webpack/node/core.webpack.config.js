const { join } = require("path");
const applyBaseConfig = require("../base.webpack.config");

const outputDir = join(__dirname, "..", "..", "build");
const outputFilename = "susybraid.core.node.js";

module.exports = applyBaseConfig({
  entry: "./public-exports.js",
  target: "node",
  output: {
    path: outputDir,
    filename: outputFilename,
    library: "Susybraid",
    libraryTarget: "umd",
    umdNamedDefine: true
  }
});
