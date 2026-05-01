// SPDX-License-Identifier: MIT
pragma solidity >0.8.34; // 

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice ERC-7857 interface for AI Agent NFTs with encrypted metadata 
interface IERC7857 {
    /// @dev Transfer token with oracle-verified proof of metadata accessibility
    function transferWithProof(
        address from,
        address to,
        uint256 tokenId,
        bytes calldata proof
    ) external;

    /// @dev Clone token with inherited state and oracle-verified proof
    function clone(
        address to,
        uint256 tokenId,
        bytes calldata proof
    ) external returns (uint256);

    /// @dev Authorize executor with scoped permissions
    function authorizeUsage(
        uint256 tokenId,
        address executor,
        bytes calldata permissions
    ) external;

    /// @notice ERC-165 interface ID for ERC-7857: 0x7857abcd (placeholder - replace with official)
    /// @dev Official ID defined at https://eips.ethereum.org/EIPS/eip-7857 [[20]]
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/// @notice Oracle interface for TEE/ZKP proof verification
interface IOracle {
    function verifyProof(bytes calldata proof) external view returns (bool);
}

/// @title SwarmSwapAgent
/// @dev ERC-7857-compliant iNFT for multi-agent LP optimization swarms
contract SwarmSwapAgent is ERC721, ERC2981, Ownable, IERC7857 {
    
    /// @notice Swarm state stored off-chain on 0G Storage, referenced by URI
    struct AgentState {
        string configURI;      // 0G Storage path: /swarms/{id}/config.json
        string stateURI;       // 0G Storage path: /swarms/{id}/state_snapshot.json
        uint256 totalTrades;   // Execution counter for reputation
        uint256 lastRebalance; // Timestamp of last action
    }

    mapping(uint256 => AgentState) public agents;
    mapping(uint256 => mapping(address => bytes)) private _authorizations;
    
    address public oracle; // TEE/ZKP oracle for proof verification [[26]]
    uint256 private _nextTokenId;

    /// @notice ERC-7857 interface ID (update with official value from EIP-7857) [[20]]
    bytes4 private constant _INTERFACE_ID_ERC7857 = 0x7857abcd;

    event UsageAuthorized(uint256 indexed tokenId, address indexed executor);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

    /// @param _oracle Address of TEE/ZKP oracle contract for proof verification
    constructor(address _oracle) 
        ERC721("SwarmSwapAgent", "SWARM") 
        Ownable(msg.sender) // ✅ OZ 5.x syntax
    {
        require(_oracle != address(0), "Invalid oracle");
        oracle = _oracle;
    }

    // ─────────────────────────────────────────────────────────────────────
    // ERC-7857 Core Functions [[22]][[29]]
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc IERC7857
    /// @dev Transfers token only after oracle verifies metadata accessibility proof
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

    /// @inheritdoc IERC7857
    /// @dev Clones agent state to new token; royalties inherited via _cloneRoyalty
    function clone(
        address to,
        uint256 tokenId,
        bytes calldata proof
    ) external override returns (uint256) {
        require(IOracle(oracle).verifyProof(proof), "Invalid proof");
        require(_exists(tokenId), "Invalid tokenId");
        
        uint256 newTokenId = ++_nextTokenId;
        _mint(to, newTokenId);
        
        // Copy agent state references (URIs point to 0G Storage)
        agents[newTokenId] = agents[tokenId];
        
        // Inherit royalty settings per EIP-2981
        _cloneRoyalty(tokenId, newTokenId);
        
        return newTokenId;
    }

    /// @inheritdoc IERC7857
    /// @dev Grants executor scoped permissions (e.g., swap-only, read-only)
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

    // ─────────────────────────────────────────────────────────────────────
    // SwarmSwap-Specific Functions
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Mint new agent iNFT with 0G Storage URIs and royalty config
    /// @param configURI 0G Storage path to agent configuration JSON
    /// @param stateURI 0G Storage path to initial state snapshot JSON
    /// @param royaltyReceiver Address to receive royalty fees
    /// @param royaltyBPS Basis points (100 = 1%, max 10000 = 100%)
    function mintAgent(
        string memory configURI,
        string memory stateURI,
        address royaltyReceiver,
        uint96 royaltyBPS
    ) external returns (uint256) {
        uint256 tokenId = ++_nextTokenId;
        _mint(msg.sender, tokenId);
        
        // ✅ EIP-2981 royalty setup
        _setTokenRoyalty(tokenId, royaltyReceiver, royaltyBPS);
        
        agents[tokenId] = AgentState({
            configURI: configURI,
            stateURI: stateURI,
            totalTrades: 0,
            lastRebalance: block.timestamp
        });
        
        return tokenId;
    }

    /// @notice Update agent state URI and increment execution counter
    /// @dev Called by owner after successful Uniswap execution
    function updateState(uint256 tokenId, string memory newStateURI) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        agents[tokenId].stateURI = newStateURI;
        agents[tokenId].totalTrades += 1;
        agents[tokenId].lastRebalance = block.timestamp;
    }

    /// @notice Check if address has execution permissions for token
    function hasPermission(uint256 tokenId, address executor, bytes4 action) external view returns (bool) {
        bytes memory perms = _authorizations[tokenId][executor];
        if (perms.length == 0) return false;
        // Simple prefix check for hackathon; use bitmasks in production
        return perms.length >= 4 && bytes4(perms) == action;
    }

    // ─────────────────────────────────────────────────────────────────────
    // ERC-165 & Metadata
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc ERC721
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId); // ✅ OZ 5.x: throws if not owned
        return agents[tokenId].configURI;
    }

    /// @inheritdoc ERC721
    function supportsInterface(bytes4 interfaceId) 
        public 
        view 
        override(ERC721, ERC2981, IERC7857) 
        returns (bool) 
    {
        return 
            interfaceId == _INTERFACE_ID_ERC7857 || 
            super.supportsInterface(interfaceId);    // ERC721 + ERC2981
    }

    // ─────────────────────────────────────────────────────────────────────
    // Admin Functions (Owner-Only)
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Update oracle address (e.g., after TEE upgrade)
    function updateOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Invalid oracle");
        emit OracleUpdated(oracle, newOracle);
        oracle = newOracle;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal Helpers
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Copy royalty settings from source to destination token
    function _cloneRoyalty(uint256 sourceId, uint256 destId) internal {
        (address receiver, uint256 value) = royaltyInfo(sourceId, 1e18);
        if (receiver != address(0)) {
            _setTokenRoyalty(destId, receiver, uint96(value));
        }
    }

    /// @dev Check if token exists (helper for clone)
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
}