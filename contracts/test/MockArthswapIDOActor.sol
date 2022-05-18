// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.9;

import "../ArthswapIDO.sol";
import "./MockEitherReceiver.sol";

contract MockArthswapIDOActor is EtherReceiverMock {
    ArthswapIDO public arthswapIdo;

    constructor(ArthswapIDO _arthswapIdo) {
        arthswapIdo = _arthswapIdo;
    }

    function issueBuyWithAstar(uint256 _projectId, uint256 _buyAmountMax)
        public
    {
        arthswapIdo.buyWithAstar{value: _balance}(_projectId, _buyAmountMax);
    }
}
