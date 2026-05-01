// SPDX-License-Identifier: MIT
pragma solidity >0.8.34;

contract MockOracle {
    function verifyProof(bytes calldata) external pure returns (bool) {
        return true;
    }
}
