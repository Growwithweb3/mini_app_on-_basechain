// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AchievementNFT
 * @dev NFT contract for Base the Shooter game achievements
 *      Each achievement unlock mints a unique NFT
 */
contract AchievementNFT is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    uint256 private _nextTokenId;
    string private _baseTokenURI;
    
    // Mapping from achievement ID to token ID (to prevent duplicate mints)
    mapping(string => mapping(address => bool)) private _achievementMinted;
    
    // Mapping from token ID to achievement ID
    mapping(uint256 => string) private _tokenAchievement;
    
    // Events
    event AchievementMinted(
        address indexed to,
        uint256 indexed tokenId,
        string indexed achievementId
    );

    constructor(
        string memory name,
        string memory symbol,
        string memory baseTokenURI_
    ) ERC721(name, symbol) Ownable(msg.sender) {
        _baseTokenURI = baseTokenURI_;
        _nextTokenId = 0;
    }

    /**
     * @dev Mint an achievement NFT (public minting)
     * @param to Address to mint the NFT to
     * @param achievementId Unique identifier for the achievement
     * @param metadataURI IPFS URI for the NFT metadata
     */
    function mintAchievement(
        address to,
        string memory achievementId,
        string memory metadataURI
    ) public nonReentrant {
        // Ensure user can only mint to their own address (prevent abuse)
        require(
            msg.sender == to,
            "AchievementNFT: Can only mint to your own address"
        );
        
        // Prevent duplicate mints of the same achievement
        require(
            !_achievementMinted[achievementId][to],
            "AchievementNFT: Achievement already minted for this address"
        );

        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, metadataURI);
        _tokenAchievement[tokenId] = achievementId;
        _achievementMinted[achievementId][to] = true;

        emit AchievementMinted(to, tokenId, achievementId);
    }

    /**
     * @dev Batch mint achievements (public minting)
     */
    function batchMintAchievements(
        address[] memory recipients,
        string[] memory achievementIds,
        string[] memory tokenURIs
    ) public nonReentrant {
        require(
            recipients.length == achievementIds.length &&
            recipients.length == tokenURIs.length,
            "AchievementNFT: Array length mismatch"
        );

        for (uint256 i = 0; i < recipients.length; i++) {
            // Ensure user can only mint to their own address
            require(
                msg.sender == recipients[i],
                "AchievementNFT: Can only mint to your own address"
            );
            
            if (!_achievementMinted[achievementIds[i]][recipients[i]]) {
                uint256 tokenId = _nextTokenId++;
                _safeMint(recipients[i], tokenId);
                _setTokenURI(tokenId, tokenURIs[i]);
                _tokenAchievement[tokenId] = achievementIds[i];
                _achievementMinted[achievementIds[i]][recipients[i]] = true;
                emit AchievementMinted(recipients[i], tokenId, achievementIds[i]);
            }
        }
    }

    /**
     * @dev Get achievement ID for a token
     */
    function getAchievementId(uint256 tokenId) public view returns (string memory) {
        _requireOwned(tokenId);
        return _tokenAchievement[tokenId];
    }

    /**
     * @dev Check if achievement is minted for an address
     */
    function isAchievementMinted(
        string memory achievementId,
        address user
    ) public view returns (bool) {
        return _achievementMinted[achievementId][user];
    }

    /**
     * @dev Override tokenURI to use ERC721URIStorage
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    /**
     * @dev Update base token URI
     */
    function setBaseURI(string memory newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
    }

    /**
     * @dev Get base token URI
     */
    function baseURI() external view returns (string memory) {
        return _baseTokenURI;
    }

    /**
     * @dev Override supportsInterface
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

