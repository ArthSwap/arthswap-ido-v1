import { BigNumber } from 'ethers';

export function ceilDecimals(a: BigNumber, decimals: BigNumber): BigNumber {
  const b = BigNumber.from(10).pow(decimals);
  // Port openzeppelin's ceilDiv
  return a.div(b).add(a.mod(b).eq(0) ? 0 : 1);
}

export function toUnscaled(n: BigNumber, decimal: number): string {
  const zeroFillN = '0'.repeat(decimal) + n.toString();
  const length = zeroFillN.length;
  let formattedN = `${zeroFillN.slice(0, length - decimal)}.${zeroFillN.slice(
    length - decimal,
    length,
  )}`;

  // delete 0 of head of int part
  while (formattedN.slice(0, formattedN.indexOf('.') - 1)[0] === '0') {
    formattedN = formattedN.slice(1);
  }

  // 1.1200000 => 1.12
  while (
    formattedN.slice(formattedN.indexOf('.') + 1)[
      formattedN.slice(formattedN.indexOf('.') + 1).length - 1
    ] === '0'
  ) {
    formattedN = formattedN.slice(0, formattedN.length - 1);
  }

  // 1. => 1
  if (formattedN[formattedN.length - 1] === '.') {
    formattedN = formattedN.slice(0, formattedN.length - 1);
  }

  return formattedN;
}

export function toScaled(n: number, decimal: number): BigNumber {
  // handle decimal
  const str = n.toString();
  if (str.indexOf('.') !== -1) {
    // calc decimal part length
    const decimalLength = str.split('.')[1].length;
    const splittedStrs = str.split('.');
    if (decimalLength <= decimal) {
      return BigNumber.from(splittedStrs[0] + splittedStrs[1]).mul(
        pow10(decimal - decimalLength),
      );
    } else {
      return BigNumber.from(
        splittedStrs[0] + splittedStrs[1].slice(0, decimal),
      );
    }
  }

  return BigNumber.from(n).mul(pow10(decimal));
}

function pow10(d: number): BigNumber {
  return BigNumber.from(10).pow(d);
}
