import { ethers, network } from 'hardhat';
import { BigNumber } from 'ethers';

export async function getBlockTime(): Promise<BigNumber> {
  const block = await ethers.provider.getBlock('latest');
  return ethers.BigNumber.from(block.timestamp);
}

export async function increaseTime(time: number): Promise<void> {
  await network.provider.send('evm_increaseTime', [time]);
  await network.provider.send('evm_mine');
}

export async function setNextBlockTime(time: number): Promise<void> {
  await network.provider.send('evm_setNextBlockTimestamp', [time]);
  await network.provider.send('evm_mine');
}

export async function setEthBalance(
  address: string,
  balance: BigNumber,
): Promise<void> {
  await network.provider.send('hardhat_setBalance', [
    address,
    balance.toHexString(),
  ]);
}
