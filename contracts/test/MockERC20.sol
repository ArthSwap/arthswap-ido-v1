// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.9;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @notice Mock of ERC20 contract
 */
contract MockERC20 is ERC20 {
    uint8 internal _decimals;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 __decimals
    ) ERC20(_name, _symbol) {
        _decimals = __decimals;
    }

    function decimals() public view override(ERC20) returns (uint8) {
        return _decimals;
    }

    function mint(address account, uint256 amount) public virtual {
        _mint(account, amount);
    }
}
