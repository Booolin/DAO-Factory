const { expect } = require("chai");
const cryptoRandomString = require("crypto-random-string");
const BN = require("bn.js");
const { mineBlocks, getBlockNumber } = require("./helpers.js");

const DDCA_TOTAL_SUPPLY = new BN("10000000000000000000000000");
const D18 = new BN("1000000000000000000");
const D6 = new BN("1000000");
const USDT_TOTAL = new BN("1000000000000000000000000000000000000000000");

describe("ProjectTemplate lifetime changes", function () {
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
    this.balancePMusdt = new BN(5000000).mul(D6);
    await this.usdt.mint(this.balancePMusdt.toString());
    await this.usdt.transfer(pm.address, this.balancePMusdt.toString());

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
    await mineBlocks(1);
  });

  it("miss audit window", async function () {
    const [admin, platformManager, pm, other] = await ethers.getSigners();
    const blockNumber = await getBlockNumber();
    const projectId = "0x" + cryptoRandomString({ length: 64 });
    const ProjectTemplate = await ethers.getContractFactory("ProjectTemplate");
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

    await this.DDCA
      .connect(pm)
      .approve(this.miningEco.address, this.balancePM.toString());
    await this.usdt
      .connect(pm)
      .approve(this.miningEco.address, this.balancePMusdt.toString());
    sent = await this.miningEco.new_project(
      0,
      projectId,
      max.toString(),
      "test1",
      calldata
    );
    await sent.wait(1);
    await mineBlocks(1);
    let project = await this.miningEco.projects(projectId);
    let projectTemplate = ProjectTemplate.attach(project.addr);
    let pt = projectTemplate.connect(pm);
    expect(await projectTemplate.status()).to.equal(15);
    await mineBlocks(100);
    await projectTemplate.heartbeat();
    await mineBlocks(1);
    expect(await projectTemplate.status()).to.equal(5);
  });

  it("audit deny", async function () {
    const [admin, platformManager, pm, other] = await ethers.getSigners();
    const blockNumber = await getBlockNumber();
    const projectId = "0x" + cryptoRandomString({ length: 64 });
    const ProjectTemplate = await ethers.getContractFactory("ProjectTemplate");
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
    await this.DDCA
      .connect(pm)
      .approve(this.miningEco.address, this.balancePM.toString());
    await this.usdt
      .connect(pm)
      .approve(this.miningEco.address, this.balancePMusdt.toString());
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
    await this.miningEco
      .connect(platformManager)
      .audit_project(projectId, false, 1000);
    expect(await projectTemplate.status()).to.equal(5);
  });

  it("audit pass", async function () {
    const [admin, platformManager, pm, other] = await ethers.getSigners();
    const blockNumber = await getBlockNumber();
    const projectId = "0x" + cryptoRandomString({ length: 64 });
    const ProjectTemplate = await ethers.getContractFactory("ProjectTemplate");
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
    await this.DDCA
      .connect(pm)
      .approve(this.miningEco.address, this.balancePM.toString());
    await this.usdt
      .connect(pm)
      .approve(this.miningEco.address, this.balancePMusdt.toString());
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
    await this.miningEco
      .connect(platformManager)
      .audit_project(projectId, true, 1000);
    expect(await projectTemplate.status()).to.equal(17);
  });

  it("repay amount & first phase auto release", async function () {
    const [admin, platformManager, pm, other] = await ethers.getSigners();
    const blockNumber = await getBlockNumber();
    const projectId = "0x" + cryptoRandomString({ length: 64 });
    const ProjectTemplate = await ethers.getContractFactory("ProjectTemplate");
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
    await this.DDCA
      .connect(pm)
      .approve(this.miningEco.address, this.balancePM.toString());
    await this.usdt
      .connect(pm)
      .approve(this.miningEco.address, this.balancePMusdt.toString());
    sent = await this.miningEco.new_project(
      0,
      projectId,
      max.toString(),
      "test1",
      calldata
    );
    await sent.wait(1);
    let project = await this.miningEco.projects(projectId);
    await this.miningEco
      .connect(platformManager)
      .audit_project(projectId, true, 1000);
    await mineBlocks(auditWindow + 10);
    let projectTemplate = ProjectTemplate.attach(project.addr);
    let pt = projectTemplate.connect(pm);
    const miningEcoOther = this.miningEco.connect(other);
    await this.usdt
      .connect(other)
      .approve(miningEcoOther.address, max.toString());
    await miningEcoOther.invest(projectId, max.toString());
    expect((await this.usdt.balanceOf(pt.address)).toString()).to.equal(
      max.toString()
    );
    expect(await projectTemplate.status()).to.equal(6);
    await mineBlocks(10);
    await pt.heartbeat();
    expect(await projectTemplate.status()).to.equal(6);

    const interest = new BN(repayDeadline - raiseEnd)
      .mul(new BN(1000))
      .mul(max)
      .div(new BN(10000))
      .div(new BN(365).mul(new BN(10)));

    expect((await pt.promised_repay()).toString()).to.equal(
      interest.add(max).toString()
    );

    await this.miningEco.pay_insurance(projectId);
    await mineBlocks(30);

    await pt.heartbeat();
    expect(await projectTemplate.status()).to.equal(7);
    expect((await this.usdt.balanceOf(pm.address)).toString()).to.equal(
      max
        .mul(new BN(8))
        .div(new BN(10))
        .add(this.balancePMusdt)
        .add(this.usdtPM)
        .sub(max.mul(new BN(5)).div(new BN(1000)))
        .toString()
    );
    await mineBlocks(10);
    await pt.heartbeat();
    expect(await projectTemplate.current_phase()).to.equal(1);
  });

  it("voting to release", async function () {
    const [admin, platformManager, pm, other] = await ethers.getSigners();
    const blockNumber = await getBlockNumber();
    const auditWindow = 50;
    const projectId = "0x" + cryptoRandomString({ length: 64 });
    const ProjectTemplate = await ethers.getContractFactory("ProjectTemplate");
    const initializeFrgmt = ProjectTemplate.interface.getFunction("initialize");
    const max = D6.mul(new BN(1000000));
    const min = max.mul(new BN(8)).div(new BN(10));
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
    await this.DDCA
      .connect(pm)
      .approve(this.miningEco.address, this.balancePM.toString());
    await this.usdt
      .connect(pm)
      .approve(this.miningEco.address, this.balancePMusdt.toString());
    sent = await this.miningEco.new_project(
      0,
      projectId,
      max.toString(),
      "test1",
      calldata
    );
    await sent.wait(1);
    await this.miningEco
      .connect(platformManager)
      .audit_project(projectId, true, 1000);
    await mineBlocks(auditWindow);
    let project = await this.miningEco.projects(projectId);
    let projectTemplate = ProjectTemplate.attach(project.addr);
    let pt = projectTemplate.connect(pm);
    expect(await projectTemplate.status()).to.equal(17);
    await mineBlocks(10);
    await pt.heartbeat();
    const miningEcoOther = this.miningEco.connect(other);
    await this.usdt
      .connect(other)
      .approve(miningEcoOther.address, max.toString());
    await miningEcoOther.invest(projectId, max.toString());

    expect((await this.usdt.balanceOf(pt.address)).toString()).to.equal(
      max.toString()
    );
    expect(await projectTemplate.status()).to.equal(6);

    await mineBlocks(20);
    await this.miningEco.pay_insurance(projectId);
    expect(await projectTemplate.status()).to.equal(18);
    await mineBlocks(30);

    await pt.heartbeat();
    expect(await projectTemplate.status()).to.equal(7); // Rolling
    expect((await this.usdt.balanceOf(pm.address)).toString()).to.equal(
      max
        .mul(new BN(8))
        .div(new BN(10))
        .add(this.balancePMusdt)
        .add(this.usdtPM)
        .sub(max.mul(new BN(5)).div(new BN(1000)))
        .toString()
    );
    expect(await projectTemplate.current_phase()).to.equal(1);
    await mineBlocks(10);
    await pt.heartbeat();
    expect(await projectTemplate.current_phase()).to.equal(2);
    expect(await projectTemplate.status()).to.equal(12); //
    await pt.heartbeat();
    expect(await projectTemplate.current_phase()).to.equal(2);
    expect(await projectTemplate.status()).to.equal(12); //
    expect((await this.usdt.balanceOf(pm.address)).toString()).to.equal(
      max
        .add(this.balancePMusdt)
        .add(this.usdtPM)
        .sub(max.mul(new BN(5)).div(new BN(1000)))
        .toString()
    );
  });

  it("voting denial", async function () {
    const [admin, platformManager, pm, other] = await ethers.getSigners();
    const blockNumber = await getBlockNumber();
    const auditWindow = 50;
    const miningEcoPM = this.miningEco.connect(pm);
    const projectId = "0x" + cryptoRandomString({ length: 64 });
    const ProjectTemplate = await ethers.getContractFactory("ProjectTemplate");
    const initializeFrgmt = ProjectTemplate.interface.getFunction("initialize");
    const max = D6.mul(new BN(1000000));
    const min = max.mul(new BN(8)).div(new BN(10));
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
    await this.DDCA
      .connect(pm)
      .approve(miningEcoPM.address, this.balancePM.toString());
    await this.usdt
      .connect(pm)
      .approve(miningEcoPM.address, this.balancePMusdt.toString());
    sent = await miningEcoPM.new_project(
      0,
      projectId,
      max.toString(),
      "test1",
      calldata
    );
    await sent.wait(1);
    await this.miningEco
      .connect(platformManager)
      .audit_project(projectId, true, 1000);
    await mineBlocks(auditWindow);
    let project = await miningEcoPM.projects(projectId);

    let projectTemplate = ProjectTemplate.attach(project.addr);
    let pt = projectTemplate.connect(pm);
    expect(await projectTemplate.status()).to.equal(17);
    await mineBlocks(10);
    const miningEcoOther = this.miningEco.connect(other);
    await this.usdt
      .connect(other)
      .approve(miningEcoOther.address, max.toString());
    await miningEcoOther.invest(projectId, max.toString());

    expect((await this.usdt.balanceOf(pt.address)).toString()).to.equal(
      max.toString()
    );
    expect(await projectTemplate.status()).to.equal(6);

    await mineBlocks(10);
    await this.miningEco.pay_insurance(projectId);
    await mineBlocks(30);

    await pt.heartbeat();
    expect(await projectTemplate.status()).to.equal(7); // Rolling
    expect((await this.usdt.balanceOf(pm.address)).toString()).to.equal(
      max
        .mul(new BN(8))
        .div(new BN(10))
        .add(this.balancePMusdt)
        .add(this.usdtPM)
        .sub(max.mul(new BN(5)).div(new BN(1000)))
        .toString()
    );
    await mineBlocks(8);
    await pt.heartbeat();
    expect(await projectTemplate.current_phase()).to.equal(1);

    await projectTemplate.connect(other).vote_against_phase(1);
    expect(await projectTemplate.current_phase()).to.equal(1);
    expect(await projectTemplate.status()).to.equal(8); //
  });

  it("replan", async function () {
    const [admin, platformManager, pm, other] = await ethers.getSigners();
    const blockNumber = await getBlockNumber();
    const miningEcoPM = this.miningEco.connect(pm);
    const projectId = "0x" + cryptoRandomString({ length: 64 });
    const ProjectTemplate = await ethers.getContractFactory("ProjectTemplate");
    const initializeFrgmt = ProjectTemplate.interface.getFunction("initialize");
    const max = D6.mul(new BN(1000000));
    const min = max.mul(new BN(8)).div(new BN(10));
    const profitRate = 1000;
    const auditWindow = 50;
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
    await this.DDCA
      .connect(pm)
      .approve(miningEcoPM.address, this.balancePM.toString());
    await this.usdt
      .connect(pm)
      .approve(miningEcoPM.address, this.balancePMusdt.toString());
    sent = await miningEcoPM.new_project(
      0,
      projectId,
      max.toString(),
      "test1",
      calldata
    );
    await sent.wait(1);
    await this.miningEco
      .connect(platformManager)
      .audit_project(projectId, true, 1000);
    await mineBlocks(auditWindow);
    let project = await miningEcoPM.projects(projectId);

    let projectTemplate = ProjectTemplate.attach(project.addr);
    let pt = projectTemplate.connect(pm);
    await mineBlocks(10);
    await pt.heartbeat();

    const miningEcoOther = this.miningEco.connect(other);
    await this.usdt
      .connect(other)
      .approve(miningEcoOther.address, max.toString());
    await miningEcoOther.invest(projectId, max.toString());

    await mineBlocks(10);
    await this.miningEco.pay_insurance(projectId);
    await mineBlocks(38);
    await pt.heartbeat();

    await projectTemplate.connect(other).vote_against_phase(1);

    const newPhases = [
      [blockNumber + auditWindow + 110, blockNumber + auditWindow + 120, 10],
      [blockNumber + auditWindow + 130, blockNumber + auditWindow + 140, 10],
    ];

    await pt.replan(newPhases);
    await mineBlocks(20);
    await pt.heartbeat();
    expect(await pt.status()).to.equal(9);
    await projectTemplate.connect(other).vote_for_replan();
    expect(await pt.status()).to.equal(7);
    await mineBlocks(70);
    await pt.heartbeat();
    expect(await pt.current_phase()).to.equal(3);
    expect(await pt.status()).to.equal(12);
  });

  it("after all phase done", async function () {
    const [admin, platformManager, pm, other] = await ethers.getSigners();
    const blockNumber = await getBlockNumber();
    const projectId = "0x" + cryptoRandomString({ length: 64 });
    const ProjectTemplate = await ethers.getContractFactory("ProjectTemplate");
    const initializeFrgmt = ProjectTemplate.interface.getFunction("initialize");
    const max = D6.mul(new BN(1000000));
    const min = max.mul(new BN(8)).div(new BN(10));
    const profitRate = 1000;
    const auditWindow = 50;
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
    await this.DDCA
      .connect(pm)
      .approve(this.miningEco.address, this.balancePM.toString());
    await this.usdt
      .connect(pm)
      .approve(this.miningEco.address, this.balancePMusdt.toString());
    sent = await this.miningEco.new_project(
      0,
      projectId,
      max.toString(),
      "test1",
      calldata
    );
    await sent.wait(1);
    await this.miningEco
      .connect(platformManager)
      .audit_project(projectId, true, 1000);
    await mineBlocks(auditWindow);
    let project = await this.miningEco.projects(projectId);
    let projectTemplate = ProjectTemplate.attach(project.addr);
    let pt = projectTemplate.connect(pm);
    await pt.heartbeat();
    const miningEcoOther = this.miningEco.connect(other);
    await this.usdt
      .connect(other)
      .approve(miningEcoOther.address, max.toString());
    await mineBlocks(10);
    await miningEcoOther.invest(projectId, max.toString());
    await mineBlocks(10);
    await this.miningEco.pay_insurance(projectId);
    await mineBlocks(50);
    await pt.heartbeat();
    expect(await projectTemplate.status()).to.equal(12);
    let _number = await getBlockNumber();
    await mineBlocks(repayDeadline - _number - 10);
    await this.usdt
      .connect(pm)
      .transfer(pt.address, max.div(new BN(10)).add(max).toString());
    await pt.heartbeat();
    expect(await projectTemplate.status()).to.equal(13);
  });

  it("repay & finish", async function () {
    const [admin, platformManager, pm, other] = await ethers.getSigners();
    const blockNumber = await getBlockNumber();
    const projectId = "0x" + cryptoRandomString({ length: 64 });
    const ProjectTemplate = await ethers.getContractFactory("ProjectTemplate");
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
    await this.DDCA
      .connect(pm)
      .approve(this.miningEco.address, this.balancePM.toString());
    await this.usdt
      .connect(pm)
      .approve(this.miningEco.address, this.balancePMusdt.toString());
    sent = await this.miningEco.new_project(
      0,
      projectId,
      max.toString(),
      "test1",
      calldata
    );
    await sent.wait(1);
    await this.miningEco
      .connect(platformManager)
      .audit_project(projectId, true, 1000);
    await mineBlocks(auditWindow + 10);
    let project = await this.miningEco.projects(projectId);
    let projectTemplate = ProjectTemplate.attach(project.addr);
    let pt = projectTemplate.connect(pm);
    await pt.heartbeat();
    const miningEcoOther = this.miningEco.connect(other);
    await this.usdt
      .connect(other)
      .approve(miningEcoOther.address, max.toString());
    await miningEcoOther.invest(projectId, max.toString());
    await mineBlocks(10);
    await this.miningEco.pay_insurance(projectId);
    await mineBlocks(50);
    await pt.heartbeat();
    let _number = await getBlockNumber();
    await mineBlocks(repayDeadline - _number - 10);
    const supposed_repay = max
      .div(new BN(10))
      .mul(new BN(repayDeadline - raiseEnd))
      .div(new BN(10 * 365))
      .add(max);
    await this.usdt.connect(pm).transfer(pt.address, supposed_repay.toString());
    await pt.heartbeat();
    const project_balance_before_repay = await this.usdt.balanceOf(pt.address);
    await miningEcoOther.repay(projectId);
    expect(
      project_balance_before_repay
        .sub(await this.usdt.balanceOf(pt.address))
        .toString()
    ).to.equal(supposed_repay.toString());
    expect(await pt.status()).to.equal(13);
    await pt.heartbeat();
    expect(await pt.status()).to.equal(14);
  });

  it("over investment", async function () {
    const [
      admin,
      platformManager,
      pm,
      other1,
      other2,
      other3,
    ] = await ethers.getSigners();

    await this.usdt.mint(USDT_TOTAL.div(new BN(100)).toString());
    await this.usdt.transfer(
      other1.address,
      USDT_TOTAL.div(new BN(100)).toString()
    );
    await this.usdt.mint(USDT_TOTAL.div(new BN(100)).toString());
    await this.usdt.transfer(
      other2.address,
      USDT_TOTAL.div(new BN(100)).toString()
    );
    await this.usdt.mint(USDT_TOTAL.div(new BN(100)).toString());
    await this.usdt.transfer(
      other3.address,
      USDT_TOTAL.div(new BN(100)).toString()
    );

    const blockNumber = await getBlockNumber();
    const auditWindow = 50;
    const miningEcoPM = this.miningEco.connect(pm);
    const projectId = "0x" + cryptoRandomString({ length: 64 });
    const ProjectTemplate = await ethers.getContractFactory("ProjectTemplate");
    const initializeFrgmt = ProjectTemplate.interface.getFunction("initialize");
    const max = D6.mul(new BN(1000000));
    const min = max.mul(new BN(8)).div(new BN(10));
    const profitRate = 1000;
    const raiseStart = blockNumber + auditWindow + 10;
    const raiseEnd = blockNumber + auditWindow + 30;
    const phases = [
      [blockNumber + auditWindow + 60, blockNumber + auditWindow + 61, 80],
      [blockNumber + auditWindow + 70, blockNumber + auditWindow + 80, 20],
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
    await this.DDCA
      .connect(pm)
      .approve(miningEcoPM.address, this.balancePM.toString());
    await this.usdt
      .connect(pm)
      .approve(miningEcoPM.address, this.balancePMusdt.toString());
    sent = await miningEcoPM.new_project(
      0,
      projectId,
      max.toString(),
      "test1",
      calldata
    );
    await sent.wait(1);

    await this.miningEco
      .connect(platformManager)
      .audit_project(projectId, true, 1000);
    await mineBlocks(auditWindow);

    let project = await miningEcoPM.projects(projectId);
    let projectTemplate = ProjectTemplate.attach(project.addr);
    let pt = projectTemplate.connect(pm);
    expect(await projectTemplate.status()).to.equal(17);
    await mineBlocks(10);
    await pt.heartbeat();
    expect(await projectTemplate.status()).to.equal(2);
    await this.usdt
      .connect(other1)
      .approve(this.miningEco.address, max.toString());
    await this.miningEco
      .connect(other1)
      .invest(projectId, max.div(new BN(5)).toString());
    await this.usdt
      .connect(other2)
      .approve(this.miningEco.address, max.toString());
    await this.miningEco
      .connect(other2)
      .invest(projectId, max.div(new BN(5)).toString());
    await this.usdt
      .connect(other3)
      .approve(this.miningEco.address, max.toString());
    await this.miningEco.connect(other3).invest(projectId, max.toString());
    expect((await this.usdt.balanceOf(other3.address)).toString()).to.equal(
      USDT_TOTAL.div(new BN(100))
        .sub(max.mul(new BN(3)).div(new BN(5)))
        .toString()
    );
    await this.usdt
      .connect(other3)
      .approve(this.miningEco.address, max.toString());
    await expect(
      this.miningEco
        .connect(other3)
        .invest(projectId, max.mul(new BN(3)).div(new BN(5)).toString())
    ).to.be.revertedWith("ProjectTemplate: reach max amount");

    expect((await pt.balanceOf(other3.address)).toString()).to.equal(
      max.mul(new BN(3)).div(new BN(5)).toString()
    );
  });
});
