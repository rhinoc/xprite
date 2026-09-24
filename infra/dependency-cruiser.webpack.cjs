const { resolve } = require("node:path");

module.exports = {
  resolve: {
    alias: {
      "@xprite/ui$": resolve(__dirname, "../packages/ui/src/index.ts"),
    },
  },
};
