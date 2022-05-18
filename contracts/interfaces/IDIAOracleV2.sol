// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.9;

/**
 * @notice DIAOracleV2 interface, reference: https://docs.diadata.org/documentation/oracle-documentation/access-the-oracle
 */
interface IDIAOracleV2 {
    function getValue(string memory key)
        external
        view
        returns (uint128, uint128);
}
