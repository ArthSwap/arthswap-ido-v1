// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.9;

/**
 * @notice ArthSwapToken interface
 */

interface IArthSwapToken {
    function mint(address to, uint256 amount) external returns (bool);
}
