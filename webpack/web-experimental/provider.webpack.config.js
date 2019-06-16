const { join } = require("path");
const applyBaseConfig = require("./webbase.webpack.config");

const outputDir = join(__dirname, "..", "..", "build");
const outputFilename = "susybraid.provider.web-experimental.js";

module.exports = applyBaseConfig({
  entry: "./lib/provider.js",
  target: "web",
  output: {
    path: outputDir,
    filename: outputFilename,
    library: "SusybraidProvider",
    libraryTarget: "umd",
    umdNamedDefine: true
  }
});
