// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const { ethers } = hre;
const BN = require("bn.js");
const fs = require("fs");

const D18 = new BN("1000000000000000000");
const D8 = new BN("100000000");
const DDCA_TOTAL_SUPPLY = D18.mul(new BN("10000000000000000000000"));
const USDT_TOTAL = D8.mul(new BN("10000000000000000000"));

const overrides = {
  gasPrice: ethers.utils.parseUnits("1.0", "gwei"),
};

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const [owner, platformManager] = await ethers.getSigners();
  const StakingToken = await ethers.getContractFactory("StakingToken");
  const DDCA = await StakingToken.deploy(
    "DDCA Token",
    "DDCA",
    18,
    DDCA_TOTAL_SUPPLY.toString(),
    DDCA_TOTAL_SUPPLY.toString(),
    overrides
  );
  console.log("DDCA deployed to:", DDCA.address);
  const usdt = await StakingToken.deploy(
    "USDT",
    "USDT",
    8,
    USDT_TOTAL.toString(),
    USDT_TOTAL.toString(),
    overrides
  );
  console.log("USDT deployed to:", usdt.address);
  const PriceFeed = await ethers.getContractFactory("MiningEcoPriceFeed");
  const priceFeed = await PriceFeed.deploy([owner.address], overrides);
  await priceFeed.feed(DDCA.address, 4500000); // $0.045
  const MiningEco = await ethers.getContractFactory("MiningEco");
  const miningEco = await MiningEco.deploy(overrides);
  await miningEco.deployed();
  console.log("MiningEco deployed to:", miningEco.address);

  const Proxy = await ethers.getContractFactory("MiningEcoProxy");
  const proxy = await Proxy.deploy(
    miningEco.address,
    owner.address,
    [],
    overrides
  );
  console.log("MiningEcoProxy deployed to:", proxy.address);

  const ProjectFactory = await ethers.getContractFactory("BetaProjectFactory");
  const projectFactory = await ProjectFactory.deploy(
    proxy.address,
    usdt.address,
    overrides
  );
  console.log("Template deployed to:", projectFactory.address);

  const platform = MiningEco.attach(proxy.address).connect(platformManager);
  await platform.initialize(
    DDCA.address,
    usdt.address,
    owner.address,
    owner.address,
    overrides
  );
  console.log("platform initialized");
  await platform.set_template(0, projectFactory.address, overrides);
  await platform.set_price_feed(priceFeed.address, overrides);
  console.log(
    "MiningEco Price Feed is set to 0.045 USDT, at address ",
    priceFeed.address
  );

  const DDCA_balance = new BN(5000000).mul(D18);
  await DDCA.mint(DDCA_balance.toString(), overrides);
  // await DDCA.transfer(
  //   "0x4072Eb9f4985998d161b2424988e470e64c75f26",
  //   DDCA_balance.toString()
  // );
  const usdt_balance = USDT_TOTAL.div(new BN(100));
  await usdt.mint(usdt_balance.toString(), overrides);
  // await usdt.transfer(
  //   "0x4072Eb9f4985998d161b2424988e470e64c75f26",
  //   usdt_balance.toString()
  // );

  console.log(`initial balances have been given to ${owner.address}`);

  let addrs = {
    DDCA: DDCA.address,
    usdt: usdt.address,
    miningeco: proxy.address,
  };
  fs.writeFileSync("./scripts/address.json", JSON.stringify(addrs));

  console.log("addresses have been written down into ./scripts/address.json");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
