const { expect } = require("chai");
const cryptoRandomString = require("crypto-random-string");
const BN = require("bn.js");
const { mineBlocks, getBlockNumber } = require("./helpers.js");

const DDCA_TOTAL_SUPPLY = new BN("10000000000000000000000000");
const D18 = new BN("1000000000000000000");
const D6 = new BN("1000000");
const USDT_TOTAL = new BN("1000000000000000000000000000000000000000000");

describe("Project audit by committee", function () {
  beforeEach(async function () {
    const StakingToken = await ethers.getContractFactory("StakingToken");
    this.DDCA = await StakingToken.deploy(
      "DDCA Token",
      "DDCA",
      18,
      DDCA_TOTAL_SUPPLY.toString(),
      DDCA_TOTAL_SUPPLY.toString()
    );
    this.usdt = await StakingToken.deploy(
      "USDT",
      "USDT",
      6,
      USDT_TOTAL.toString(),
      USDT_TOTAL.toString()
    );

    const [admin, platformManager, pm, other] = await ethers.getSigners();
    const MiningEco = await ethers.getContractFactory("MiningEco");
    const miningEco = await MiningEco.deploy();
    const miningEcoInitFragment = miningEco.interface.getFunction("initialize");
    const initializeCalldata = miningEco.interface.encodeFunctionData(
      miningEcoInitFragment,
      [
        this.DDCA.address,
        this.usdt.address,
        platformManager.address,
        platformManager.address,
      ]
    );

    const Proxy = await ethers.getContractFactory("MiningEcoProxy");
    const proxy = await Proxy.deploy(miningEco.address, admin.address, []);
    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    const projectFactory = await ProjectFactory.deploy(
      proxy.address,
      this.usdt.address
    );

    let tx = {
      to: proxy.address,
      data: ethers.utils.arrayify(initializeCalldata),
    };
    let sent = await platformManager.sendTransaction(tx);
    await sent.wait(1);

    this.miningEco = miningEco.attach(proxy.address);
    this.miningEco.connect(platformManager).set_usdt(this.usdt.address);
    this.miningEco
      .connect(platformManager)
      .set_template(0, projectFactory.address);

    this.balancePM = new BN(5000000).mul(D18);
    await this.DDCA.mint(this.balancePM.toString());
    await this.DDCA.transfer(pm.address, this.balancePM.toString());
    await this.usdt.mint(this.balancePM.toString());
    await this.usdt.transfer(pm.address, this.balancePM.toString());

    await this.usdt.mint(USDT_TOTAL.div(new BN(100)).toString());
    await this.usdt.transfer(
      other.address,
      USDT_TOTAL.div(new BN(100)).toString()
    );
    this.usdtPM = USDT_TOTAL.div(new BN(100));
    await this.usdt.mint(USDT_TOTAL.div(new BN(100)).toString());
    await this.usdt.transfer(
      pm.address,
      USDT_TOTAL.div(new BN(100)).toString()
    );
    this.miningEco = this.miningEco.connect(pm);
  });

  it("audit succeeded", async function () {
    const [
      admin,
      platformManager,
      pm,
      other,
      cmt1,
      cmt2,
      cmt3,
    ] = await ethers.getSigners();
    const blockNumber = await getBlockNumber();
    const projectId = "0x" + cryptoRandomString({ length: 64 });
    const ProjectTemplate = await ethers.getContractFactory("ProjectTemplate");
    const Committee = await ethers.getContractFactory("MiningCommittee");
    const auditCommittee = await Committee.deploy();
    await auditCommittee.update_member(cmt1.address, 1);
    await auditCommittee.update_member(cmt2.address, 1);
    await auditCommittee.update_member(cmt3.address, 1);
    await this.miningEco
      .connect(platformManager)
      .set_audit_committee(auditCommittee.address, true);
    await auditCommittee.update_supervised(this.miningEco.address, true);

    const initializeFrgmt = ProjectTemplate.interface.getFunction("initialize");
    const max = D6.mul(new BN(1000000));
    const min = max.mul(new BN(8)).div(new BN(10));
    const auditWindow = 50;
    const profitRate = 1000;
    const raiseStart = blockNumber + auditWindow + 10;
    const raiseEnd = blockNumber + auditWindow + 20;
    const phases = [
      [blockNumber + auditWindow + 50, blockNumber + auditWindow + 51, 80],
      [blockNumber + auditWindow + 60, blockNumber + auditWindow + 70, 20],
    ];
    const repayDeadline = blockNumber + auditWindow + 1000;
    const replanGrants = [pm.address];
    const calldata = ProjectTemplate.interface.encodeFunctionData(
      initializeFrgmt,
      [
        pm.address,
        raiseStart,
        raiseEnd,
        min.toString(),
        max.toString(),
        repayDeadline,
        profitRate,
        phases,
        replanGrants,
        1000,
      ]
    );
    await this.usdt
      .connect(pm)
      .approve(this.miningEco.address, this.balancePM.toString());
    sent = await this.miningEco.new_project(
      0,
      projectId,
      max.toString(),
      "test1",
      calldata
    );
    await sent.wait(1);
    let project = await this.miningEco.projects(projectId);
    let projectTemplate = ProjectTemplate.attach(project.addr);
    let pt = projectTemplate.connect(pm);
    expect(await projectTemplate.status()).to.equal(15);
    await mineBlocks(1);
    await auditCommittee.connect(cmt1).vote(1, true);
    expect(await pt.status()).to.equal(15);
    await auditCommittee.connect(cmt2).vote(1, false);
    await auditCommittee.connect(cmt3).vote(1, true);
    expect(await pt.status()).to.equal(17);
  });

  it("non-member vote", async function () {
    const [
      admin,
      platformManager,
      pm,
      other,
      cmt1,
      cmt2,
      cmt3,
    ] = await ethers.getSigners();
    const blockNumber = await getBlockNumber();
    const projectId = "0x" + cryptoRandomString({ length: 64 });
    const ProjectTemplate = await ethers.getContractFactory("ProjectTemplate");
    const Committee = await ethers.getContractFactory("MiningCommittee");
    const auditCommittee = await Committee.deploy();
    await auditCommittee.update_member(cmt1.address, 1);
    await auditCommittee.update_member(cmt2.address, 1);
    await auditCommittee.update_member(cmt3.address, 1);
    await this.miningEco
      .connect(platformManager)
      .set_audit_committee(auditCommittee.address, true);
    await auditCommittee.update_supervised(this.miningEco.address, true);

    const initializeFrgmt = ProjectTemplate.interface.getFunction("initialize");
    const max = D6.mul(new BN(1000000));
    const min = max.mul(new BN(8)).div(new BN(10));
    const auditWindow = 50;
    const profitRate = 1000;
    const raiseStart = blockNumber + auditWindow + 10;
    const raiseEnd = blockNumber + auditWindow + 20;
    const phases = [
      [blockNumber + auditWindow + 50, blockNumber + auditWindow + 51, 80],
      [blockNumber + auditWindow + 60, blockNumber + auditWindow + 70, 20],
    ];
    const repayDeadline = blockNumber + auditWindow + 1000;
    const replanGrants = [pm.address];
    const calldata = ProjectTemplate.interface.encodeFunctionData(
      initializeFrgmt,
      [
        pm.address,
        raiseStart,
        raiseEnd,
        min.toString(),
        max.toString(),
        repayDeadline,
        profitRate,
        phases,
        replanGrants,
        1000,
      ]
    );
    await this.usdt
      .connect(pm)
      .approve(this.miningEco.address, this.balancePM.toString());
    sent = await this.miningEco.new_project(
      0,
      projectId,
      max.toString(),
      "test1",
      calldata
    );
    await sent.wait(1);
    let project = await this.miningEco.projects(projectId);
    let projectTemplate = ProjectTemplate.attach(project.addr);
    let pt = projectTemplate.connect(pm);
    expect(await projectTemplate.status()).to.equal(15);
    await mineBlocks(1);
    await expect(
      auditCommittee.connect(other).vote(1, true)
    ).to.be.revertedWith("MiningCommittee: only committee member");
  });

  it("double vote", async function () {
    const [
      admin,
      platformManager,
      pm,
      other,
      cmt1,
      cmt2,
      cmt3,
    ] = await ethers.getSigners();
    const blockNumber = await getBlockNumber();
    const projectId = "0x" + cryptoRandomString({ length: 64 });
    const ProjectTemplate = await ethers.getContractFactory("ProjectTemplate");
    const Committee = await ethers.getContractFactory("MiningCommittee");
    const auditCommittee = await Committee.deploy();
    await auditCommittee.update_member(cmt1.address, 1);
    await auditCommittee.update_member(cmt2.address, 1);
    await auditCommittee.update_member(cmt3.address, 1);
    await this.miningEco
      .connect(platformManager)
      .set_audit_committee(auditCommittee.address, true);
    await auditCommittee.update_supervised(this.miningEco.address, true);

    const initializeFrgmt = ProjectTemplate.interface.getFunction("initialize");
    const max = D6.mul(new BN(1000000));
    const min = max.mul(new BN(8)).div(new BN(10));
    const auditWindow = 50;
    const profitRate = 1000;
    const raiseStart = blockNumber + auditWindow + 10;
    const raiseEnd = blockNumber + auditWindow + 20;
    const phases = [
      [blockNumber + auditWindow + 50, blockNumber + auditWindow + 51, 80],
      [blockNumber + auditWindow + 60, blockNumber + auditWindow + 70, 20],
    ];
    const repayDeadline = blockNumber + auditWindow + 1000;
    const replanGrants = [pm.address];
    const calldata = ProjectTemplate.interface.encodeFunctionData(
      initializeFrgmt,
      [
        pm.address,
        raiseStart,
        raiseEnd,
        min.toString(),
        max.toString(),
        repayDeadline,
        profitRate,
        phases,
        replanGrants,
        1000,
      ]
    );
    await this.usdt
      .connect(pm)
      .approve(this.miningEco.address, this.balancePM.toString());
    sent = await this.miningEco.new_project(
      0,
      projectId,
      max.toString(),
      "test1",
      calldata
    );
    await sent.wait(1);
    let project = await this.miningEco.projects(projectId);
    let projectTemplate = ProjectTemplate.attach(project.addr);
    let pt = projectTemplate.connect(pm);
    expect(await projectTemplate.status()).to.equal(15);
    await mineBlocks(1);
    await auditCommittee.connect(cmt1).vote(1, true);
    await expect(auditCommittee.connect(cmt1).vote(1, true)).to.be.revertedWith(
      "MiningCommittee: voter already voted"
    );
  });
});
