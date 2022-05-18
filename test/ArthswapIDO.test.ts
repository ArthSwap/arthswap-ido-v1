import { expect } from 'chai';
import { ethers, waffle } from 'hardhat';
import { BigNumber, Contract, ContractFactory } from 'ethers';
import { ZERO_ADDRESS, DIA_ASTR_PRICE_KEY } from './constants';
import { getBlockTime, increaseTime, setEthBalance } from './helper';
import { ceilDecimals, toScaled } from './utils';

describe('ArthswapIDO', function () {
  let usdc: Contract;
  let usdt: Contract;
  let diaOracle: Contract;
  let arthswapIdo: Contract;
  let arthswapIdoFactory: ContractFactory;

  const [owner, alice, bob, projectWallet] = waffle.provider.getWallets();

  interface Project {
    name: string;
    startTimestamp: BigNumber;
    endTimestamp: BigNumber;
    tokenDecimals: BigNumber;
    maxAllocateAmount: BigNumber;
    usdPricePerTokenE6: BigNumber;
    astarPriceDiscountMultiplierE4: BigNumber;
    fundsAddress: string;
  }
  const projectSample = (blockTimestamp: BigNumber): Project => {
    return {
      name: 'Sample project',
      startTimestamp: blockTimestamp.add(1000),
      endTimestamp: blockTimestamp.add(5000),
      tokenDecimals: BigNumber.from(6),
      maxAllocateAmount: BigNumber.from(1000),
      usdPricePerTokenE6: BigNumber.from(1000),
      astarPriceDiscountMultiplierE4: BigNumber.from(9500),
      fundsAddress: projectWallet.address,
    };
  };
  async function setOraclePrice(astarPriceE8: BigNumber): Promise<void> {
    await diaOracle.setValue(
      DIA_ASTR_PRICE_KEY,
      astarPriceE8,
      await getBlockTime(),
    );
  }

  beforeEach(async () => {
    const USDC = await ethers.getContractFactory('MockERC20');
    usdc = await USDC.deploy('USDC', 'USDC', 6);
    await usdc.deployed();

    const USDT = await ethers.getContractFactory('MockERC20');
    usdt = await USDT.deploy('USDT', 'USDT', 6);
    await usdt.deployed();

    const mintUsdc = await usdc.mint(alice.address, '10000000000');
    await mintUsdc.wait();

    const mintUsdt = await usdt.mint(alice.address, '10000000000');
    await mintUsdt.wait();

    const diaOracleV2 = await ethers.getContractFactory('DIAOracleV2');
    diaOracle = await diaOracleV2.deploy();
    await diaOracle.deployed();

    arthswapIdoFactory = await ethers.getContractFactory('ArthswapIDO');
    arthswapIdo = await arthswapIdoFactory.deploy(
      usdc.address,
      usdt.address,
      diaOracle.address,
    );
    await arthswapIdo.deployed();
  });

  describe('constructor', () => {
    it('revert if USDC address is 0x0', async () => {
      await expect(
        arthswapIdoFactory.deploy(
          ZERO_ADDRESS,
          usdt.address,
          diaOracle.address,
        ),
      ).to.be.revertedWith('ArthswapIDO: USDC address must not be 0');
    });

    it('revert if USDT address is 0x0', async () => {
      await expect(
        arthswapIdoFactory.deploy(
          usdc.address,
          ZERO_ADDRESS,
          diaOracle.address,
        ),
      ).to.be.revertedWith('ArthswapIDO: USDT address must not be 0');
    });

    it('revert if DIAOracle address is 0x0', async () => {
      await expect(
        arthswapIdoFactory.deploy(usdc.address, usdt.address, ZERO_ADDRESS),
      ).to.be.revertedWith('ArthswapIDO: DIAOracle address must not be 0');
    });
  });

  describe('addProject', () => {
    it('successfully adds project', async () => {
      const projectSampled: Project = projectSample(await getBlockTime());
      const tx = await arthswapIdo.addProject(
        ...Object.values(projectSampled),
        { from: owner.address },
      );
      expect(tx).to.emit(arthswapIdo, 'ProjectAdded');
      const afterProjects = await arthswapIdo.getProjects();
      expect(afterProjects.length).to.equal(1);
      for (const prop in projectSampled) {
        expect(afterProjects[0][prop]).to.equal(
          projectSampled[prop as keyof Project],
        );
      }
    });
    it('reverts if called from other than the owner', async () => {
      const projectSampled: Project = projectSample(await getBlockTime());
      await expect(
        arthswapIdo
          .connect(alice)
          .addProject(...Object.values(projectSampled), {
            from: alice.address,
          }),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
    it('reverts if start time has passed already', async () => {
      const projectSampled: Project = projectSample(await getBlockTime());
      await increaseTime(1001);
      await expect(
        arthswapIdo.addProject(...Object.values(projectSampled)),
      ).to.be.revertedWith(
        'ArthswapIDO: Start time should be after the current time',
      );
    });
    it('reverts if ending time precedes starting time', async () => {
      const projectSampled: Project = projectSample(await getBlockTime());
      projectSampled.endTimestamp = projectSampled.startTimestamp.sub(1);
      await expect(
        arthswapIdo.addProject(...Object.values(projectSampled)),
      ).to.be.revertedWith(
        'ArthswapIDO: End time should come after the start time',
      );
      projectSampled.endTimestamp = projectSampled.startTimestamp;
      await expect(
        arthswapIdo.addProject(...Object.values(projectSampled)),
      ).to.be.revertedWith(
        'ArthswapIDO: End time should come after the start time',
      );
    });
    it('reverts if the maximum of allocated amount is 0', async () => {
      const projectSampled: Project = projectSample(await getBlockTime());
      projectSampled.maxAllocateAmount = BigNumber.from(0);
      await expect(
        arthswapIdo.addProject(...Object.values(projectSampled)),
      ).to.be.revertedWith(
        'ArthswapIDO: Maximum of allocated amount should be greater than 0',
      );
    });
    it('reverts if the USD price per token is 0', async () => {
      const projectSampled: Project = projectSample(await getBlockTime());
      projectSampled.usdPricePerTokenE6 = BigNumber.from(0);
      await expect(
        arthswapIdo.addProject(...Object.values(projectSampled)),
      ).to.be.revertedWith(
        'ArthswapIDO: USD price per token should be greater than 0',
      );
    });
    it('reverts if the discount rate for ArthSwap is 100%', async () => {
      const projectSampled: Project = projectSample(await getBlockTime());
      projectSampled.astarPriceDiscountMultiplierE4 = BigNumber.from(0);
      await expect(
        arthswapIdo.addProject(...Object.values(projectSampled)),
      ).to.be.revertedWith(
        'ArthswapIDO: Discount rate for ArthSwap should be between 0% and 99.99%',
      );
    });
    it('reverts if the discount rate for ArthSwap is less than 0%', async () => {
      const projectSampled: Project = projectSample(await getBlockTime());
      projectSampled.astarPriceDiscountMultiplierE4 = BigNumber.from(10001);
      await expect(
        arthswapIdo.addProject(...Object.values(projectSampled)),
      ).to.be.revertedWith(
        'ArthswapIDO: Discount rate for ArthSwap should be between 0% and 99.99%',
      );
    });
    it('reverts if project fundsAddress is zero address', async () => {
      const projectSampled: Project = projectSample(await getBlockTime());
      projectSampled.fundsAddress = ZERO_ADDRESS;
      await expect(
        arthswapIdo.addProject(...Object.values(projectSampled)),
      ).to.be.revertedWith('ArthswapIDO: Funds address must not be 0');
    });
  });

  describe('buyWithUsd', () => {
    let defaultProject: Project;
    beforeEach(async () => {
      defaultProject = projectSample(await getBlockTime());
      defaultProject.usdPricePerTokenE6 = BigNumber.from(2000000);
      await arthswapIdo.addProject(...Object.values(defaultProject), {
        from: owner.address,
      });
      await increaseTime(1001);
      // Mint more
      await (await usdc.mint(alice.address, '10000000000')).wait();
      await (await usdt.mint(alice.address, '10000000000')).wait();
    });
    // TODO: abstract tests for USDC, USDT using loop or something.
    // Ref: https://github.com/Uniswap/v2-core/blob/4dd59067c76dea4a0e8e4bfdda41877a6b16dedc/test/UniswapV2Pair.spec.ts#L70-L91
    it('successfully buyWithUsd all amount at once with USDC', async () => {
      await usdc
        .connect(alice)
        .approve(arthswapIdo.address, BigNumber.from(2000), {
          from: alice.address,
        });
      const buyAmount = BigNumber.from(1000);
      const usdToPay = ceilDecimals(
        defaultProject.usdPricePerTokenE6.mul(buyAmount),
        defaultProject.tokenDecimals,
      );
      let tx;

      // Transfer test
      await expect(() => {
        tx = arthswapIdo
          .connect(alice)
          .buyWithUsd(BigNumber.from(0), usdc.address, buyAmount, {
            from: alice.address,
          });
        return tx;
      }).to.changeTokenBalances(
        usdc,
        [alice, projectWallet],
        [-usdToPay, usdToPay],
      );
      // Check allocatedAmount
      expect(await arthswapIdo.allocatedAmount(0)).to.equal(1000);
      // Check raisedAmount
      expect((await arthswapIdo.raisedAmount(0)).usdcAmount).to.equal(usdToPay);
      // Check allocatedAccount
      expect((await arthswapIdo.getAllocatedAccounts(0)).length).to.equal(1);
      const allocatedAccount = await (
        await arthswapIdo.getAllocatedAccounts(0)
      )[0];
      expect(allocatedAccount.userAddress).to.equal(alice.address);
      expect(allocatedAccount.amounts).to.equal(buyAmount);
      // Check event emitted
      await expect(tx)
        .to.emit(arthswapIdo, 'TokenBought')
        .withArgs(0, alice.address, usdc.address, buyAmount);

      // check commited token's recorded correctly
      const committedTokens = await arthswapIdo.getUsersCommittedTokenAmounts(
        BigNumber.from(0),
        alice.address,
      );

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == usdc.address,
        ).amountPaid,
      ).to.equal(usdToPay);

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == usdt.address,
        ).amountPaid,
      ).to.equal(0);

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == ZERO_ADDRESS,
        ).amountPaid,
      ).to.equal(0);
    });
    it('successfully buyWithUsd some amounts in succession with USDC', async () => {
      await usdc
        .connect(alice)
        .approve(arthswapIdo.address, BigNumber.from(2000), {
          from: alice.address,
        });
      const buyAmountFirst = BigNumber.from(100);
      const buyAmountSecond = BigNumber.from(200);
      const usdToPay1 = ceilDecimals(
        defaultProject.usdPricePerTokenE6.mul(buyAmountFirst),
        defaultProject.tokenDecimals,
      );
      const usdToPay2 = ceilDecimals(
        defaultProject.usdPricePerTokenE6.mul(buyAmountSecond),
        defaultProject.tokenDecimals,
      );
      let tx;

      await arthswapIdo
        .connect(alice)
        .buyWithUsd(BigNumber.from(0), usdc.address, buyAmountFirst, {
          from: alice.address,
        });
      await expect(() => {
        tx = arthswapIdo
          .connect(alice)
          .buyWithUsd(BigNumber.from(0), usdc.address, buyAmountSecond, {
            from: alice.address,
          });
        return tx;
      }).to.changeTokenBalances(
        usdc,
        [alice, projectWallet],
        [-usdToPay2, usdToPay2],
      );
      await expect(tx)
        .to.emit(arthswapIdo, 'TokenBought')
        .withArgs(0, alice.address, usdc.address, buyAmountSecond);
      expect((await arthswapIdo.getAllocatedAccounts(0)).length).to.equal(1);
      const allocatedAccount = await (
        await arthswapIdo.getAllocatedAccounts(0)
      )[0];
      expect(allocatedAccount.amounts).to.equal(
        buyAmountFirst.add(buyAmountSecond),
      );

      // check commited token's recorded correctly
      const committedTokens = await arthswapIdo.getUsersCommittedTokenAmounts(
        BigNumber.from(0),
        alice.address,
      );

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == usdc.address,
        ).amountPaid,
      ).to.equal(usdToPay1.add(usdToPay2));

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == usdt.address,
        ).amountPaid,
      ).to.equal(0);

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == ZERO_ADDRESS,
        ).amountPaid,
      ).to.equal(0);
    });
    it('successfully buyWithUsd all amount at once with USDT', async () => {
      await usdt
        .connect(alice)
        .approve(arthswapIdo.address, BigNumber.from(2000), {
          from: alice.address,
        });
      const buyAmount = BigNumber.from(1000);
      const usdToPay = ceilDecimals(
        defaultProject.usdPricePerTokenE6.mul(buyAmount),
        defaultProject.tokenDecimals,
      );
      let tx;

      // Transfer test
      await expect(() => {
        tx = arthswapIdo
          .connect(alice)
          .buyWithUsd(BigNumber.from(0), usdt.address, buyAmount, {
            from: alice.address,
          });
        return tx;
      }).to.changeTokenBalances(
        usdt,
        [alice, projectWallet],
        [-usdToPay, usdToPay],
      );
      // Check allocatedAmount
      expect(await arthswapIdo.allocatedAmount(0)).to.equal(1000);
      // Check raisedAmount
      expect((await arthswapIdo.raisedAmount(0)).usdtAmount).to.equal(usdToPay);
      // Check allocatedAccount
      expect((await arthswapIdo.getAllocatedAccounts(0)).length).to.equal(1);
      const allocatedAccount = await (
        await arthswapIdo.getAllocatedAccounts(0)
      )[0];
      expect(allocatedAccount.userAddress).to.equal(alice.address);
      expect(allocatedAccount.amounts).to.equal(buyAmount);
      // Check event emitted
      await expect(tx)
        .to.emit(arthswapIdo, 'TokenBought')
        .withArgs(0, alice.address, usdt.address, buyAmount);

      // check commited token's recorded correctly
      const committedTokens = await arthswapIdo.getUsersCommittedTokenAmounts(
        BigNumber.from(0),
        alice.address,
      );

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == usdc.address,
        ).amountPaid,
      ).to.equal(0);

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == usdt.address,
        ).amountPaid,
      ).to.equal(usdToPay);

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == ZERO_ADDRESS,
        ).amountPaid,
      ).to.equal(0);
    });
    it('successfully buyWithUsd some amounts in succession with USDT', async () => {
      await usdt
        .connect(alice)
        .approve(arthswapIdo.address, BigNumber.from(2000), {
          from: alice.address,
        });
      const buyAmountFirst = BigNumber.from(100);
      const buyAmountSecond = BigNumber.from(200);

      const usdToPay1 = ceilDecimals(
        defaultProject.usdPricePerTokenE6.mul(buyAmountFirst),
        defaultProject.tokenDecimals,
      );
      const usdToPay2 = ceilDecimals(
        defaultProject.usdPricePerTokenE6.mul(buyAmountSecond),
        defaultProject.tokenDecimals,
      );
      let tx;

      await arthswapIdo
        .connect(alice)
        .buyWithUsd(BigNumber.from(0), usdt.address, buyAmountFirst, {
          from: alice.address,
        });
      await expect(() => {
        tx = arthswapIdo
          .connect(alice)
          .buyWithUsd(BigNumber.from(0), usdt.address, buyAmountSecond, {
            from: alice.address,
          });
        return tx;
      }).to.changeTokenBalances(
        usdt,
        [alice, projectWallet],
        [-usdToPay2, usdToPay2],
      );
      await expect(tx)
        .to.emit(arthswapIdo, 'TokenBought')
        .withArgs(0, alice.address, usdt.address, buyAmountSecond);
      expect((await arthswapIdo.getAllocatedAccounts(0)).length).to.equal(1);
      const allocatedAccount = await (
        await arthswapIdo.getAllocatedAccounts(0)
      )[0];
      expect(allocatedAccount.amounts).to.equal(
        buyAmountFirst.add(buyAmountSecond),
      );

      // check commited token's recorded correctly
      const committedTokens = await arthswapIdo.getUsersCommittedTokenAmounts(
        BigNumber.from(0),
        alice.address,
      );

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == usdc.address,
        ).amountPaid,
      ).to.equal(0);

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == usdt.address,
        ).amountPaid,
      ).to.equal(usdToPay1.add(usdToPay2));

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == ZERO_ADDRESS,
        ).amountPaid,
      ).to.equal(0);
    });
    it('projectId should not be out of index', async () => {
      await expect(
        arthswapIdo.buyWithUsd(
          BigNumber.from(1),
          usdc.address,
          BigNumber.from(10),
        ),
      ).to.be.revertedWith(
        'ArthswapIDO: Project ID should be within index range of projects',
      );
    });
    it('reverts if USD token is neither USDC nor USDT', async () => {
      await expect(
        arthswapIdo.buyWithUsd(
          BigNumber.from(0),
          alice.address,
          BigNumber.from(10),
        ),
      ).to.be.revertedWith(
        'ArthswapIDO: USD token should be either USDC or USDT',
      );
    });
    it('reverts if buy amount is 0', async () => {
      await expect(
        arthswapIdo.buyWithUsd(
          BigNumber.from(0),
          usdc.address,
          BigNumber.from(0),
        ),
      ).to.be.revertedWith(
        'ArthswapIDO: IDO token amount should be greater than 0',
      );
    });
    it('reverts if IDO token gets sold out', async () => {
      await usdc
        .connect(alice)
        .approve(arthswapIdo.address, BigNumber.from(2000), {
          from: alice.address,
        });
      await arthswapIdo
        .connect(alice)
        .buyWithUsd(BigNumber.from(0), usdc.address, BigNumber.from(1000), {
          from: alice.address,
        });
      await expect(
        arthswapIdo
          .connect(alice)
          .buyWithUsd(BigNumber.from(0), usdc.address, BigNumber.from(1), {
            from: alice.address,
          }),
      ).to.be.revertedWith('ArthswapIDO: IDO token amount should be available');
    });
    it('reverts if the project has not started', async () => {
      const projectSampled: Project = projectSample(await getBlockTime());
      await arthswapIdo.addProject(...Object.values(projectSampled), {
        from: owner.address,
      });
      await expect(
        arthswapIdo.buyWithUsd(
          BigNumber.from(1),
          usdc.address,
          BigNumber.from(10),
        ),
      ).to.be.revertedWith('ArthswapIDO: Project has not started yet');
    });
    it('reverts if the project has ended', async () => {
      const projectSampled: Project = projectSample(await getBlockTime());
      await arthswapIdo.addProject(...Object.values(projectSampled), {
        from: owner.address,
      });
      await increaseTime(5001);
      await expect(
        arthswapIdo.buyWithUsd(
          BigNumber.from(1),
          usdc.address,
          BigNumber.from(10),
        ),
      ).to.be.revertedWith('ArthswapIDO: Project ended already');
    });
    it('buys the left over even if there is available less than buyAmountMax', async () => {
      let tx;
      await usdc
        .connect(alice)
        .approve(arthswapIdo.address, BigNumber.from(2000), {
          from: alice.address,
        });
      await usdt
        .connect(alice)
        .approve(arthswapIdo.address, BigNumber.from(400), {
          from: alice.address,
        });
      await arthswapIdo
        .connect(alice)
        .buyWithUsd(BigNumber.from(0), usdc.address, BigNumber.from(900), {
          from: alice.address,
        });
      const usdToPay = ceilDecimals(
        defaultProject.usdPricePerTokenE6.mul(100),
        defaultProject.tokenDecimals,
      );
      await expect(() => {
        tx = arthswapIdo
          .connect(alice)
          .buyWithUsd(BigNumber.from(0), usdt.address, BigNumber.from(200), {
            from: alice.address,
          });
        return tx;
      }).to.changeTokenBalances(
        usdt,
        [alice, projectWallet],
        [-usdToPay, usdToPay],
      );
      await expect(tx).to.emit(arthswapIdo, 'TokenSoldOut');
      const allocatedAccount = await (
        await arthswapIdo.getAllocatedAccounts(0)
      )[0];
      expect(allocatedAccount.amounts).to.equal(1000);

      // check commited token's recorded correctly
      const committedTokens = await arthswapIdo.getUsersCommittedTokenAmounts(
        BigNumber.from(0),
        alice.address,
      );

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == usdc.address,
        ).amountPaid,
      ).to.equal(BigNumber.from(1800));

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == usdt.address,
        ).amountPaid,
      ).to.equal(usdToPay);

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == ZERO_ADDRESS,
        ).amountPaid,
      ).to.equal(0);
    });
    it('allows one account to participate in more than one projects', async () => {
      // Add new project
      const projectSampled: Project = projectSample(await getBlockTime());
      await arthswapIdo.addProject(...Object.values(projectSampled), {
        from: owner.address,
      });

      // Elapse time for the second project to be started
      await increaseTime(1001);

      // Approve transfer USDT token from alice to IDO address
      await usdt
        .connect(alice)
        .approve(arthswapIdo.address, BigNumber.from(2000), {
          from: alice.address,
        });

      // Amount to buy first project's token
      const buyAmountFirst = BigNumber.from(100);
      // Amount to buy second project's token
      const buyAmountSecond = BigNumber.from(200);

      // USD token prices for buying
      const usdToPay1 = ceilDecimals(
        defaultProject.usdPricePerTokenE6.mul(buyAmountFirst),
        defaultProject.tokenDecimals,
      );

      // USD token prices for buying
      const usdToPay2 = ceilDecimals(
        projectSampled.usdPricePerTokenE6.mul(buyAmountSecond),
        projectSampled.tokenDecimals,
      );

      // Buy project tokens with USD tokens
      await arthswapIdo
        .connect(alice)
        .buyWithUsd(BigNumber.from(0), usdt.address, buyAmountFirst, {
          from: alice.address,
        });
      await expect(() => {
        return arthswapIdo
          .connect(alice)
          .buyWithUsd(BigNumber.from(1), usdt.address, buyAmountSecond, {
            from: alice.address,
          });
      }).to.changeTokenBalances(
        usdt,
        [alice, projectWallet],
        [-usdToPay2, usdToPay2],
      );

      expect((await arthswapIdo.getAllocatedAccounts(0)).length).to.equal(1);
      expect((await arthswapIdo.getAllocatedAccounts(1)).length).to.equal(1);

      const allocatedAccountFirst = await (
        await arthswapIdo.getAllocatedAccounts(0)
      )[0];
      const allocatedAccountSecond = await (
        await arthswapIdo.getAllocatedAccounts(1)
      )[0];
      expect(allocatedAccountFirst.amounts).to.equal(buyAmountFirst);
      expect(allocatedAccountSecond.amounts).to.equal(buyAmountSecond);

      // check commited token's recorded correctly
      const committedTokensFirst =
        await arthswapIdo.getUsersCommittedTokenAmounts(
          BigNumber.from(0),
          alice.address,
        );
      const committedTokensSecond =
        await arthswapIdo.getUsersCommittedTokenAmounts(
          BigNumber.from(1),
          alice.address,
        );
      expect(
        committedTokensFirst.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == usdt.address,
        ).amountPaid,
      ).to.equal(usdToPay1);

      expect(
        committedTokensSecond.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == usdt.address,
        ).amountPaid,
      ).to.equal(usdToPay2);
    });
  });

  describe('buyWithAstar', () => {
    let defaultProject: Project;
    beforeEach(async () => {
      defaultProject = projectSample(await getBlockTime());
      defaultProject.tokenDecimals = BigNumber.from(18);
      defaultProject.usdPricePerTokenE6 = toScaled(2, 5); // 0.2 USD per token
      defaultProject.maxAllocateAmount = toScaled(50, 18); // 50 tokens
      await arthswapIdo.addProject(...Object.values(defaultProject), {
        from: owner.address,
      });
      await increaseTime(1001);
      // 0.1 USD per 1 Astar
      await setOraclePrice(toScaled(1, 7));
      // mint more Astar
      await setEthBalance(alice.address, toScaled(2000, 18));
    });
    it('successfully buyWithAstar all amount at once', async () => {
      const buyAmount = defaultProject.maxAllocateAmount;
      // 0.2 USD * 50 tokens * 0.95 = 9.5 USD => 95 Astar
      const astarToPay = toScaled(95, 18);
      let tx;

      // Transfer test
      await expect(() => {
        tx = arthswapIdo
          .connect(alice)
          .buyWithAstar(BigNumber.from(0), buyAmount, {
            value: toScaled(100, 18),
            from: alice.address,
          });
        return tx;
      }).to.changeEtherBalances(
        [alice, projectWallet],
        [astarToPay.mul(-1), astarToPay],
      );
      // Check allocatedAmount
      expect(await arthswapIdo.allocatedAmount(0)).to.equal(buyAmount);
      // Check raisedAmount
      expect((await arthswapIdo.raisedAmount(0)).astarAmount).to.equal(
        astarToPay,
      );
      // Check allocatedAccount
      expect((await arthswapIdo.getAllocatedAccounts(0)).length).to.equal(1);
      const allocatedAccount = await (
        await arthswapIdo.getAllocatedAccounts(0)
      )[0];
      expect(allocatedAccount.userAddress).to.equal(alice.address);
      expect(allocatedAccount.amounts).to.equal(buyAmount);
      // Check event emitted
      await expect(tx)
        .to.emit(arthswapIdo, 'TokenBought')
        .withArgs(0, alice.address, ZERO_ADDRESS, buyAmount);

      // check commited token's recorded correctly
      const committedTokens = await arthswapIdo.getUsersCommittedTokenAmounts(
        BigNumber.from(0),
        alice.address,
      );
      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == usdt.address,
        ).amountPaid,
      ).to.equal(0);

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == usdc.address,
        ).amountPaid,
      ).to.equal(0);

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == ZERO_ADDRESS,
        ).amountPaid,
      ).to.equal(astarToPay);
    });
    it('successfully buyWithAstar some amounts in succession', async () => {
      const buyAmountFirst = toScaled(10, 18);
      const buyAmountSecond = toScaled(20, 18);
      // 0.2 USD * 10 tokens * 0.95 = 1.9 USD => 19 Astar
      const astarToPay = toScaled(19, 18);
      // 0.2 USD * 20 tokens * 0.95 = 3.8 USD => 38 Astar
      const astarToPay2 = toScaled(38, 18);
      let tx;

      await arthswapIdo
        .connect(alice)
        .buyWithAstar(BigNumber.from(0), buyAmountFirst, {
          from: alice.address,
          value: astarToPay,
        });
      await expect(() => {
        tx = arthswapIdo
          .connect(alice)
          .buyWithAstar(BigNumber.from(0), buyAmountSecond, {
            from: alice.address,
            value: astarToPay2,
          });
        return tx;
      }).to.changeEtherBalances(
        [alice, projectWallet],
        [astarToPay2.mul(-1), astarToPay2],
      );
      await expect(tx)
        .to.emit(arthswapIdo, 'TokenBought')
        .withArgs(0, alice.address, ZERO_ADDRESS, buyAmountSecond);
      expect((await arthswapIdo.getAllocatedAccounts(0)).length).to.equal(1);
      const allocatedAccount = await (
        await arthswapIdo.getAllocatedAccounts(0)
      )[0];
      expect(allocatedAccount.amounts).to.equal(
        buyAmountFirst.add(buyAmountSecond),
      );

      // check commited token's recorded correctly
      const committedTokens = await arthswapIdo.getUsersCommittedTokenAmounts(
        BigNumber.from(0),
        alice.address,
      );
      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == usdt.address,
        ).amountPaid,
      ).to.equal(0);

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == usdc.address,
        ).amountPaid,
      ).to.equal(0);

      expect(
        committedTokens.find(
          (token: { paidTokenAddress: string }) =>
            token.paidTokenAddress == ZERO_ADDRESS,
        ).amountPaid,
      ).to.equal(astarToPay.add(astarToPay2));
    });
    it('projectId should not be out of index', async () => {
      await expect(
        arthswapIdo.buyWithAstar(BigNumber.from(1), BigNumber.from(10)),
      ).to.be.revertedWith(
        'ArthswapIDO: Project ID should be within index range of projects',
      );
    });
    it('reverts if buy amount is 0', async () => {
      await expect(
        arthswapIdo.buyWithAstar(BigNumber.from(0), BigNumber.from(0)),
      ).to.be.revertedWith(
        'ArthswapIDO: IDO token amount should be greater than 0',
      );
    });
    it('reverts if the value is not enough', async () => {
      await expect(
        arthswapIdo
          .connect(alice)
          .buyWithAstar(BigNumber.from(0), toScaled(10, 18), {
            from: alice.address,
            value: toScaled(10, 18),
          }),
      ).to.be.revertedWith(
        'ArthswapIDO: Sending Astar amount is not enough for payment',
      );
    });
    it('reverts if IDO token gets sold out', async () => {
      await arthswapIdo
        .connect(alice)
        .buyWithAstar(BigNumber.from(0), toScaled(50, 18), {
          from: alice.address,
          value: toScaled(100, 18),
        });
      await expect(
        arthswapIdo
          .connect(alice)
          .buyWithAstar(BigNumber.from(0), BigNumber.from(1), {
            from: alice.address,
            value: toScaled(1, 18),
          }),
      ).to.be.revertedWith('ArthswapIDO: IDO token amount should be available');
    });
    it('reverts if the project has not started', async () => {
      const projectSampled: Project = projectSample(await getBlockTime());
      await arthswapIdo.addProject(...Object.values(projectSampled), {
        from: owner.address,
      });
      await expect(
        arthswapIdo
          .connect(alice)
          .buyWithAstar(BigNumber.from(1), toScaled(1, 18), {
            from: alice.address,
            value: toScaled(10, 18),
          }),
      ).to.be.revertedWith('ArthswapIDO: Project has not started yet');
    });
    it('reverts if the project has ended', async () => {
      const projectSampled: Project = projectSample(await getBlockTime());
      await arthswapIdo.addProject(...Object.values(projectSampled), {
        from: owner.address,
      });
      increaseTime(5001);
      await expect(
        arthswapIdo
          .connect(alice)
          .buyWithAstar(BigNumber.from(1), toScaled(1, 18), {
            from: alice.address,
            value: toScaled(10, 18),
          }),
      ).to.be.revertedWith('ArthswapIDO: Project ended already');
    });
    context('Simulating transmission error', () => {
      let actor: Contract;
      beforeEach(async () => {
        // Create mock actor
        actor = await ethers
          .getContractFactory('MockArthswapIDOActor')
          .then((factory) => factory.deploy(arthswapIdo.address));
        await actor.deployed();
        await actor.setAcceptEther(true);
        // Send enough currency to actor
        await alice.sendTransaction({
          to: actor.address,
          value: toScaled(100, 18),
        });
      });

      it('reverts if payment from sender has transmission error', async () => {
        await actor.setAcceptEther(false);
        await expect(actor.issueBuyWithAstar(0, 1)).to.be.revertedWith(
          'ArthswapIDO: Transfer failed',
        );
      });

      it('reverts if payment receiving has transmission error', async () => {
        defaultProject.fundsAddress = actor.address;
        defaultProject.startTimestamp = (await getBlockTime()).add(1000);
        defaultProject.endTimestamp = (await getBlockTime()).add(5000);
        await actor.setAcceptEther(false);
        await arthswapIdo.addProject(...Object.values(defaultProject), {
          from: owner.address,
        });
        await increaseTime(1001);
        await expect(
          arthswapIdo
            .connect(alice)
            .buyWithAstar(BigNumber.from(1), toScaled(5, 18), {
              from: alice.address,
              value: toScaled(100, 18),
            }),
        ).to.be.revertedWith('ArthswapIDO: Transfer failed');
      });
    });
    it('buys the left over even if there is available less than buyAmountMax', async () => {
      let tx;
      await arthswapIdo
        .connect(alice)
        .buyWithAstar(BigNumber.from(0), toScaled(40, 18), {
          from: alice.address,
          value: toScaled(100, 18),
        });
      await expect(() => {
        tx = arthswapIdo
          .connect(alice)
          // 0.2 * 10 * 0.95 = 1.9 USD => 19 Astar
          .buyWithAstar(BigNumber.from(0), toScaled(20, 18), {
            from: alice.address,
            value: toScaled(100, 18),
          });
        return tx;
      }).to.changeEtherBalances(
        [alice, projectWallet],
        [toScaled(19, 18).mul(-1), toScaled(19, 18)],
      );
      await expect(tx).to.emit(arthswapIdo, 'TokenSoldOut');
      const allocatedAccount = await (
        await arthswapIdo.getAllocatedAccounts(0)
      )[0];
      expect(allocatedAccount.amounts).to.equal(toScaled(50, 18));
    });
  });

  describe('getAstarPriceE8', () => {
    it('successfully getAstarPriceE8', async () => {
      await diaOracle.setValue(
        DIA_ASTR_PRICE_KEY,
        BigNumber.from(1000),
        await getBlockTime(),
      );
      const astarPriceE8 = await arthswapIdo.getAstarPriceE8();
      expect(astarPriceE8).to.equal(BigNumber.from(1000));
    });

    it('successfully latest getAstarPriceE8', async () => {
      await diaOracle.setValue(
        DIA_ASTR_PRICE_KEY,
        BigNumber.from(1000),
        await getBlockTime(),
      );
      await diaOracle.setValue(
        DIA_ASTR_PRICE_KEY,
        BigNumber.from(1100),
        await getBlockTime(),
      );
      const astarPriceE8 = await arthswapIdo.getAstarPriceE8();
      expect(astarPriceE8).to.equal(BigNumber.from(1100));
    });
    it('revert if the Astar price is 0', async () => {
      await expect(arthswapIdo.getAstarPriceE8()).to.be.revertedWith(
        'ArthswapIDO: astarPrice must be greater than 0',
      );
    });
  });

  describe("functions to retrieve allocated users' information", () => {
    let defaultProject: Project;
    let mockArthswapIdo: Contract;
    beforeEach(async () => {
      const mockArthswapIdoFactory = await ethers.getContractFactory(
        'MockArthswapIDO',
      );
      mockArthswapIdo = await mockArthswapIdoFactory.deploy(
        usdc.address,
        usdt.address,
        diaOracle.address,
      );
      await mockArthswapIdo.deployed();
      defaultProject = projectSample(await getBlockTime());
      await mockArthswapIdo.addProject(...Object.values(defaultProject), {
        from: owner.address,
      });
    });
    describe('getAllocatedAccounts', () => {
      it('successfully retrieve allocated accounts to one project', async () => {
        await mockArthswapIdo.addAllocatedAccount(
          0,
          alice.address,
          20,
          7,
          13,
          0,
        );
        let allocatedAccounts = await mockArthswapIdo.getAllocatedAccounts(0);
        expect(allocatedAccounts.length).to.equal(1);
        expect(allocatedAccounts[0].userAddress).to.equal(alice.address);
        expect(allocatedAccounts[0].amounts).to.equal(20);
        expect(allocatedAccounts[0].usdcAmounts).to.equal(7);
        expect(allocatedAccounts[0].usdtAmounts).to.equal(13);
        expect(allocatedAccounts[0].astarAmounts).to.equal(0);
        await mockArthswapIdo.addAllocatedAccount(
          0,
          bob.address,
          30,
          20,
          10,
          0,
        );
        allocatedAccounts = await mockArthswapIdo.getAllocatedAccounts(0);
        expect(allocatedAccounts.length).to.equal(2);
        expect(allocatedAccounts[1].userAddress).to.equal(bob.address);
        expect(allocatedAccounts[1].amounts).to.equal(30);
        expect(allocatedAccounts[1].usdcAmounts).to.equal(20);
        expect(allocatedAccounts[1].usdtAmounts).to.equal(10);
        expect(allocatedAccounts[1].astarAmounts).to.equal(0);
      });
      it('successfully retrieve allocated accounts to several projects', async () => {
        await mockArthswapIdo.addAllocatedAccount(
          0,
          alice.address,
          20,
          15,
          5,
          0,
        );
        await mockArthswapIdo.addProject(
          ...Object.values(projectSample(await getBlockTime())),
          { from: owner.address },
        );
        await mockArthswapIdo.addAllocatedAccount(
          1,
          bob.address,
          30,
          5,
          10,
          15,
        );
        let allocatedAccounts = await mockArthswapIdo.getAllocatedAccounts(0);
        expect(allocatedAccounts.length).to.equal(1);
        expect(allocatedAccounts[0].userAddress).to.equal(alice.address);
        expect(allocatedAccounts[0].amounts).to.equal(20);
        expect(allocatedAccounts[0].usdcAmounts).to.equal(15);
        expect(allocatedAccounts[0].usdtAmounts).to.equal(5);
        expect(allocatedAccounts[0].astarAmounts).to.equal(0);
        allocatedAccounts = await mockArthswapIdo.getAllocatedAccounts(1);
        expect(allocatedAccounts.length).to.equal(1);
        expect(allocatedAccounts[0].userAddress).to.equal(bob.address);
        expect(allocatedAccounts[0].amounts).to.equal(30);
        expect(allocatedAccounts[0].usdcAmounts).to.equal(5);
        expect(allocatedAccounts[0].usdtAmounts).to.equal(10);
        expect(allocatedAccounts[0].astarAmounts).to.equal(15);
      });
      it('reverts if the project ID is out of range', async () => {
        await expect(
          mockArthswapIdo.getAllocatedAccounts(1),
        ).to.be.revertedWith(
          'ArthswapIDO: project ID should be within index range',
        );
      });
    });
    describe('getUserAllocatedAmount', () => {
      it('successfully retrieve several user account amount allocated to one project', async () => {
        await mockArthswapIdo.addAllocatedAccount(
          0,
          alice.address,
          20,
          15,
          5,
          0,
        );
        expect(
          await mockArthswapIdo.getUserAllocatedAmount(0, alice.address),
        ).to.equal(20);
        await mockArthswapIdo.addAllocatedAccount(
          0,
          bob.address,
          30,
          5,
          10,
          15,
        );
        expect(
          await mockArthswapIdo.getUserAllocatedAmount(0, bob.address),
        ).to.equal(30);
      });
      it('successfully retrieve user account amount allocated to several projects', async () => {
        await mockArthswapIdo.addProject(
          ...Object.values(projectSample(await getBlockTime())),
          { from: owner.address },
        );
        await mockArthswapIdo.addAllocatedAccount(
          0,
          alice.address,
          20,
          15,
          5,
          0,
        );
        await mockArthswapIdo.addAllocatedAccount(
          1,
          alice.address,
          30,
          5,
          10,
          15,
        );
        expect(
          await mockArthswapIdo.getUserAllocatedAmount(0, alice.address),
        ).to.equal(20);
        expect(
          await mockArthswapIdo.getUserAllocatedAmount(1, alice.address),
        ).to.equal(30);
      });
      it('successfully retrieve user account amount allocated to several projects', async () => {
        await mockArthswapIdo.addProject(
          ...Object.values(projectSample(await getBlockTime())),
          { from: owner.address },
        );
        await mockArthswapIdo.addAllocatedAccount(
          0,
          alice.address,
          20,
          15,
          5,
          0,
        );
        await mockArthswapIdo.addAllocatedAccount(
          1,
          bob.address,
          30,
          5,
          10,
          15,
        );
        expect(
          await mockArthswapIdo.getUserAllocatedAmount(0, alice.address),
        ).to.equal(20);
        expect(
          await mockArthswapIdo.getUserAllocatedAmount(1, bob.address),
        ).to.equal(30);
      });
      it("returns 0 for retrieval of unallocated user's", async () => {
        await mockArthswapIdo.addAllocatedAccount(
          0,
          alice.address,
          20,
          15,
          5,
          0,
        );
        expect(
          await mockArthswapIdo.getUserAllocatedAmount(0, bob.address),
        ).to.equal(0);
      });
      it('reverts if the project ID is out of range', async () => {
        await expect(
          mockArthswapIdo.getUserAllocatedAmount(1, alice.address),
        ).to.be.revertedWith(
          'ArthswapIDO: project ID should be within index range',
        );
      });
    });
    describe('getUsersCommittedTokenAmounts', () => {
      it('reverts if the project ID is out of range', async () => {
        await expect(
          mockArthswapIdo.getUsersCommittedTokenAmounts(1, alice.address),
        ).to.be.revertedWith(
          'ArthswapIDO: project ID should be within index range',
        );
      });

      it('returns committedToken with 0 amount if the user has not committed tokens', async () => {
        await mockArthswapIdo.addProject(
          ...Object.values(projectSample(await getBlockTime())),
          { from: owner.address },
        );

        const committedTokens =
          await mockArthswapIdo.getUsersCommittedTokenAmounts(0, bob.address);

        expect(
          committedTokens.find(
            (token: { paidTokenAddress: string }) =>
              token.paidTokenAddress == usdc.address,
          ).amountPaid,
        ).to.equal(0);
        expect(
          committedTokens.find(
            (token: { paidTokenAddress: string }) =>
              token.paidTokenAddress == usdt.address,
          ).amountPaid,
        ).to.equal(0);
        expect(
          committedTokens.find(
            (token: { paidTokenAddress: string }) =>
              token.paidTokenAddress == ZERO_ADDRESS,
          ).amountPaid,
        ).to.equal(0);
      });

      it("successfully retrieve user's committed token amount allocated to one project", async () => {
        await mockArthswapIdo.addProject(
          ...Object.values(projectSample(await getBlockTime())),
          { from: owner.address },
        );

        await mockArthswapIdo.addAllocatedAccount(
          0,
          bob.address,
          30,
          5,
          10,
          15,
        );
        const committedTokens =
          await mockArthswapIdo.getUsersCommittedTokenAmounts(0, bob.address);
        expect(
          committedTokens.find(
            (token: { paidTokenAddress: string }) =>
              token.paidTokenAddress == usdc.address,
          ).amountPaid,
        ).to.equal(5);
        expect(
          committedTokens.find(
            (token: { paidTokenAddress: string }) =>
              token.paidTokenAddress == usdt.address,
          ).amountPaid,
        ).to.equal(10);
        expect(
          committedTokens.find(
            (token: { paidTokenAddress: string }) =>
              token.paidTokenAddress == ZERO_ADDRESS,
          ).amountPaid,
        ).to.equal(15);
      });

      it("successfully retrieve user's committed token allocated to several projects", async () => {
        await mockArthswapIdo.addProject(
          ...Object.values(projectSample(await getBlockTime())),
          { from: owner.address },
        );
        await mockArthswapIdo.addAllocatedAccount(
          0,
          alice.address,
          20,
          15,
          5,
          0,
        );
        await mockArthswapIdo.addAllocatedAccount(
          1,
          alice.address,
          30,
          5,
          10,
          15,
        );

        let committedTokens =
          await mockArthswapIdo.getUsersCommittedTokenAmounts(0, alice.address);
        expect(
          committedTokens.find(
            (token: { paidTokenAddress: string }) =>
              token.paidTokenAddress == usdc.address,
          ).amountPaid,
        ).to.equal(15);
        expect(
          committedTokens.find(
            (token: { paidTokenAddress: string }) =>
              token.paidTokenAddress == usdt.address,
          ).amountPaid,
        ).to.equal(5);
        expect(
          committedTokens.find(
            (token: { paidTokenAddress: string }) =>
              token.paidTokenAddress == ZERO_ADDRESS,
          ).amountPaid,
        ).to.equal(0);

        committedTokens = await mockArthswapIdo.getUsersCommittedTokenAmounts(
          1,
          alice.address,
        );
        expect(
          committedTokens.find(
            (token: { paidTokenAddress: string }) =>
              token.paidTokenAddress == usdc.address,
          ).amountPaid,
        ).to.equal(5);
        expect(
          committedTokens.find(
            (token: { paidTokenAddress: string }) =>
              token.paidTokenAddress == usdt.address,
          ).amountPaid,
        ).to.equal(10);
        expect(
          committedTokens.find(
            (token: { paidTokenAddress: string }) =>
              token.paidTokenAddress == ZERO_ADDRESS,
          ).amountPaid,
        ).to.equal(15);
      });
    });
  });
});
