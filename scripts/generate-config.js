const fs = require("fs");
const path = require("path");
const Mustache = require("mustache");

const network = process.env.NETWORK || "calibration";
const networksPath = path.join(__dirname, "../config/networks.json");
const templatePath = path.join(__dirname, "../templates/subgraph.template.yaml");
const outputPath = path.join(__dirname, "../subgraph.yaml");

const networks = JSON.parse(fs.readFileSync(networksPath, "utf8"));
const template = fs.readFileSync(templatePath, "utf8");

if (!networks[network]) {
  console.error(`Network "${network}" not found in networks.json`);
  process.exit(1);
}

const config = {
  network: networks[network].network,
  contractAddress: networks[network].address,
  startBlock: networks[network].startBlock,
};

const output = Mustache.render(template, config);
fs.writeFileSync(outputPath, output);

console.log(`Generated subgraph.yaml for network: ${network}`);
