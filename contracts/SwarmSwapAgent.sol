// SPDX-License-Identifier: MIT
pragma solidity >0.8.34;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IERC7857 {
    function transferWithProof(
        address from,
        address to,
        uint256 tokenId,
        bytes calldata proof
    ) external;

    function clone(
        address to,
        uint256 tokenId,
        bytes calldata proof
    ) external returns (uint256);

    function authorizeUsage(
        uint256 tokenId,
        address executor,
        bytes calldata permissions
    ) external;

    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IOracle {
    function verifyProof(bytes calldata proof) external view returns (bool);
}

contract SwarmSwapAgent is ERC721, ERC2981, Ownable, IERC7857 {
    
    struct AgentState {
        string configURI;
        string stateURI;
        uint256 totalTrades;
        uint256 lastRebalance;
    }

    mapping(uint256 => AgentState) public agents;
    mapping(uint256 => mapping(address => bytes)) private _authorizations;
    
    address public oracle;
    uint256 private _nextTokenId;

    bytes4 private constant _INTERFACE_ID_ERC7857 = 0x7857abcd;

    event UsageAuthorized(uint256 indexed tokenId, address indexed executor);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event ExecutionAnchored(uint256 indexed tokenId, bytes32 indexed txHash, uint256 timestamp);

    constructor(address _oracle) 
        ERC721("SwarmSwapAgent", "SWARM") 
        Ownable(msg.sender)
    {
        require(_oracle != address(0), "Invalid oracle");
        oracle = _oracle;
    }

    function transferWithProof(
        address from,
        address to,
        uint256 tokenId,
        bytes calldata proof
    ) external override {
        require(IOracle(oracle).verifyProof(proof), "Invalid proof");
        require(ownerOf(tokenId) == from, "Not owner");
        _transfer(from, to, tokenId);
    }

    function clone(
        address to,
        uint256 tokenId,
        bytes calldata proof
    ) external override returns (uint256) {
        require(IOracle(oracle).verifyProof(proof), "Invalid proof");
        require(_exists(tokenId), "Invalid tokenId");
        
        uint256 newTokenId = ++_nextTokenId;
        _mint(to, newTokenId);
        agents[newTokenId] = agents[tokenId];
        _cloneRoyalty(tokenId, newTokenId);
        return newTokenId;
    }

    function authorizeUsage(
        uint256 tokenId,
        address executor,
        bytes calldata permissions
    ) external override {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(executor != address(0), "Invalid executor");
        _authorizations[tokenId][executor] = permissions;
        emit UsageAuthorized(tokenId, executor);
    }

    function mintAgent(
        string memory configURI,
        string memory stateURI,
        address royaltyReceiver,
        uint96 royaltyBPS
    ) external returns (uint256) {
        uint256 tokenId = ++_nextTokenId;
        _mint(msg.sender, tokenId);
        _setTokenRoyalty(tokenId, royaltyReceiver, royaltyBPS);
        agents[tokenId] = AgentState({
            configURI: configURI,
            stateURI: stateURI,
            totalTrades: 0,
            lastRebalance: block.timestamp
        });
        return tokenId;
    }

    function updateState(uint256 tokenId, string memory newStateURI, bytes32 executionTxHash) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        agents[tokenId].stateURI = newStateURI;
        agents[tokenId].totalTrades += 1;
        agents[tokenId].lastRebalance = block.timestamp;
        emit ExecutionAnchored(tokenId, executionTxHash, block.timestamp);
    }

    function hasPermission(uint256 tokenId, address executor, bytes4 action) external view returns (bool) {
        bytes memory perms = _authorizations[tokenId][executor];
        if (perms.length == 0) return false;
        return perms.length >= 4 && bytes4(perms) == action;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return agents[tokenId].configURI;
    }

    function supportsInterface(bytes4 interfaceId) 
        public 
        view 
        override(ERC721, ERC2981, IERC7857) 
        returns (bool) 
    {
        return 
            interfaceId == _INTERFACE_ID_ERC7857 || 
            super.supportsInterface(interfaceId);
    }

    function updateOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Invalid oracle");
        emit OracleUpdated(oracle, newOracle);
        oracle = newOracle;
    }

    function _cloneRoyalty(uint256 sourceId, uint256 destId) internal {
        (address receiver, uint256 value) = royaltyInfo(sourceId, 1e18);
        if (receiver != address(0)) {
            _setTokenRoyalty(destId, receiver, uint96(value));
        }
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
}