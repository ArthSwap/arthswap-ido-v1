// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.9;

import {ArthswapIDO} from "../ArthswapIDO.sol";

/**
 * @notice Mock of ArthswapIDO contract
 */
contract MockArthswapIDO is ArthswapIDO {
    constructor(
        address usdc,
        address usdt,
        address diaOracle
    )
        ArthswapIDO(usdc, usdt, diaOracle) // solhint-disable-next-line
    {}

    function addAllocatedAccount(
        uint256 projectId,
        address userAddress,
        uint256 amounts,
        uint256 usdcAmounts,
        uint256 usdtAmounts,
        uint256 astarAmounts
    ) public {
        addUserAllocatedAmount(
            projectId,
            userAddress,
            amounts,
            usdcAmounts,
            usdtAmounts,
            astarAmounts
        );
    }
}
