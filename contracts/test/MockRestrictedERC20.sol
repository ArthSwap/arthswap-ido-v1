// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.9;

import "./MockERC20.sol";

/**
 * @notice Mock of ERC20 contract, with number of mintable times
 */
contract MockRestrictedERC20 is MockERC20 {
    uint8 internal _mintableTimes;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 __decimals,
        uint8 __mintableTimes
    ) MockERC20(_name, _symbol, __decimals) {
        _mintableTimes = __mintableTimes;
    }

    function mint(address account, uint256 amount) public override(MockERC20) {
        if (_mintableTimes > 0) {
            _mintableTimes -= 1;
            _mint(account, amount);
        } else {
            revert();
        }
    }
}
