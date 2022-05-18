// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.9;

contract EtherReceiverMock {
    bool private _acceptEther;
    uint256 internal _balance;

    function setAcceptEther(bool acceptEther) public {
        _acceptEther = acceptEther;
    }

    receive() external payable {
        if (!_acceptEther) {
            revert();
        }
        _balance += msg.value;
    }
}
