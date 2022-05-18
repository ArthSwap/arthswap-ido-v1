// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.9;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/IDIAOracleV2.sol";

contract ArthswapIDO is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IERC20 public immutable usdt;
    IDIAOracleV2 public immutable diaOracle;

    string private constant DIA_ASTR_PRICE_KEY = "ASTR/USD";

    struct Account {
        address userAddress;
        uint256 amounts;
        uint256 usdcAmounts;
        uint256 usdtAmounts;
        uint256 astarAmounts;
    }

    struct CommittedToken {
        address paidTokenAddress;
        uint256 amountPaid;
    }

    struct Project {
        string name;
        uint256 startTimestamp;
        uint256 endTimestamp;
        uint256 tokenDecimals;
        uint256 maxAllocateAmount;
        uint256 usdPricePerTokenE6;
        uint256 astarPriceDiscountMultiplierE4; // if 5% discount 9500
        address fundsAddress;
    }

    struct RaisedAmount {
        uint256 usdcAmount;
        uint256 usdtAmount;
        uint256 astarAmount;
    }

    Project[] public projects;
    /// @dev mapping of projectId to Account[]
    mapping(uint256 => Account[]) public allocatedAccounts;

    // prettier-ignore
    // mapping of projectId to (buyer's address to Account ID)
    mapping(uint256 => mapping(address => uint256)) private accountIds;
    /// @dev mapping of projectId to project token amount that already allocated
    mapping(uint256 => uint256) public allocatedAmount;
    /// @dev mapping of projectId to raised token amount
    mapping(uint256 => RaisedAmount) public raisedAmount;

    /// @dev Emitted when project added, can be used getting all project list
    event ProjectAdded(
        uint256 indexed projectId,
        string name,
        uint256 startTimestamp,
        uint256 endTimestamp,
        uint256 tokenDecimals,
        uint256 maxAllocateAmount,
        uint256 usdPricePerTokenE6,
        uint256 astarPriceDiscountMultiplierE4,
        address fundsAddress
    );

    /// @dev Emitted when user bought IDO token, can be used getting user committed token kinds and amount
    event TokenBought(
        uint256 indexed projectId,
        address indexed userAddress,
        address paidTokenAddress,
        uint256 amountBought
    );

    /// @dev Emitted when IDO token sold out, can be used getting timestamp of sold out
    event TokenSoldOut(uint256 indexed projectId, uint256 timestamp);

    /**
     * @param _usdc address of USDC
     * @param _usdt address of USDT
     * @param _diaOracle address of DIAOracleV2 contract
     */
    constructor(
        address _usdc,
        address _usdt,
        address _diaOracle
    ) {
        require(
            _usdc != address(0x0),
            "ArthswapIDO: USDC address must not be 0"
        );
        require(
            _usdt != address(0x0),
            "ArthswapIDO: USDT address must not be 0"
        );
        require(
            _diaOracle != address(0x0),
            "ArthswapIDO: DIAOracle address must not be 0"
        );
        usdc = IERC20(_usdc);
        usdt = IERC20(_usdt);
        diaOracle = IDIAOracleV2(_diaOracle);
    }

    // Modifier to check that the project is valid on user buy action
    modifier validProject(uint256 projectId, uint256 buyAmountMax) {
        require(
            projectId <= projects.length - 1,
            "ArthswapIDO: Project ID should be within index range of projects"
        );
        Project memory currentProject = projects[projectId];
        require(
            buyAmountMax > 0,
            "ArthswapIDO: IDO token amount should be greater than 0"
        );
        require(
            allocatedAmount[projectId] < currentProject.maxAllocateAmount,
            "ArthswapIDO: IDO token amount should be available"
        );
        require(
            block.timestamp > currentProject.startTimestamp,
            "ArthswapIDO: Project has not started yet"
        );
        require(
            block.timestamp < currentProject.endTimestamp,
            "ArthswapIDO: Project ended already"
        );
        _;
    }

    /**
     * @notice update states and events upon buying
     * @param _projectId project index of projects
     * @param _buyAmount amount of IDO project token to be bought
     * @param _payTokenAddress address of USDC, USDT or ASTR(0x0)
     * @param _payAmount amount to be paid in USDC, USDT or ASTR
     */
    function _buyToken(
        uint256 _projectId,
        uint256 _buyAmount,
        address _payTokenAddress,
        uint256 _payAmount
    ) internal {
        // emit event
        emit TokenBought(
            _projectId,
            msg.sender,
            address(_payTokenAddress),
            _buyAmount
        );
        uint256 leftOver = projects[_projectId].maxAllocateAmount -
            allocatedAmount[_projectId];
        if (_buyAmount == leftOver) {
            emit TokenSoldOut(_projectId, block.timestamp);
        }
        uint256 _usdcAmounts = 0;
        uint256 _usdtAmounts = 0;
        uint256 _astarAmounts = 0;
        // add allocatedAmount
        allocatedAmount[_projectId] += _buyAmount;
        // add raisedAmount
        if (address(_payTokenAddress) == address(0x0)) {
            raisedAmount[_projectId].astarAmount += _payAmount;
            _astarAmounts = _payAmount;
        } else if (address(_payTokenAddress) == address(usdc)) {
            raisedAmount[_projectId].usdcAmount += _payAmount;
            _usdcAmounts = _payAmount;
        } else {
            raisedAmount[_projectId].usdtAmount += _payAmount;
            _usdtAmounts = _payAmount;
        }

        // add user allocatedAccount
        addUserAllocatedAmount(
            _projectId,
            msg.sender,
            _buyAmount,
            _usdcAmounts,
            _usdtAmounts,
            _astarAmounts
        );
    }

    /**
     * @notice get amounts of tokens user commit
     * @param projectId project index of projects
     * @param userAddress user address
     * @return CommittedToken[] amounts for committed token
     */
    function getUsersCommittedTokenAmounts(
        uint256 projectId,
        address userAddress
    ) external view returns (CommittedToken[3] memory) {
        require(
            projectId < projects.length,
            "ArthswapIDO: project ID should be within index range"
        );

        if (accountIds[projectId][userAddress] == 0) {
            return [
                CommittedToken(address(usdc), 0),
                CommittedToken(address(usdt), 0),
                CommittedToken(address(0x0), 0)
            ];
        }

        Account memory _account = allocatedAccounts[projectId][
            accountIds[projectId][userAddress] - 1
        ];

        return [
            CommittedToken(address(usdc), _account.usdcAmounts),
            CommittedToken(address(usdt), _account.usdtAmounts),
            CommittedToken(address(0x0), _account.astarAmounts)
        ];
    }

    /**
     * @notice buy IDO token with USDC, USDT
     * @param projectId project index of projects
     * @param usdToken address of USDC or USDT
     * @param buyAmountMax amount of buying IDO token
     */
    function buyWithUsd(
        uint256 projectId,
        IERC20 usdToken,
        uint256 buyAmountMax
    ) external validProject(projectId, buyAmountMax) {
        require(
            address(usdToken) == address(usdc) ||
                address(usdToken) == address(usdt),
            "ArthswapIDO: USD token should be either USDC or USDT"
        );

        Project memory currentProject = projects[projectId];

        uint256 buyAmount = Math.min(
            currentProject.maxAllocateAmount - allocatedAmount[projectId],
            buyAmountMax
        );
        uint256 usdToPay = Math.ceilDiv(
            currentProject.usdPricePerTokenE6 * buyAmount,
            10**currentProject.tokenDecimals
        ); // Prevent usdToPay to become 0

        _buyToken(projectId, buyAmount, address(usdToken), usdToPay);

        usdToken.safeTransferFrom(
            msg.sender,
            address(currentProject.fundsAddress),
            usdToPay
        );
    }

    /**
     * @notice buy IDO token with Astar, set msg.value > payment
     * @param projectId project index of projects
     * @param buyAmountMax amount of buying IDO token
     */
    function buyWithAstar(uint256 projectId, uint256 buyAmountMax)
        external
        payable
        validProject(projectId, buyAmountMax)
    {
        Project memory currentProject = projects[projectId];
        uint256 buyAmount = Math.min(
            currentProject.maxAllocateAmount - allocatedAmount[projectId],
            buyAmountMax
        );
        uint256 astarPriceE8 = getAstarPriceE8();
        uint256 astarToPayE18 = Math.ceilDiv(
            currentProject.usdPricePerTokenE6 *
                buyAmount *
                currentProject.astarPriceDiscountMultiplierE4 *
                1e16,
            astarPriceE8 * (10**(currentProject.tokenDecimals))
        );

        require(
            msg.value >= astarToPayE18,
            "ArthswapIDO: Sending Astar amount is not enough for payment"
        );

        _buyToken(projectId, buyAmount, address(0x0), astarToPayE18);

        // transfer the change to user
        (bool success, ) = payable(msg.sender).call{
            value: msg.value - astarToPayE18
        }("");
        require(success, "ArthswapIDO: Transfer failed");

        // transfer funds to project
        (success, ) = payable(currentProject.fundsAddress).call{
            value: astarToPayE18
        }("");
        require(success, "ArthswapIDO: Transfer failed");
    }

    /**
     * @notice get astar price(1e8) if $0.1 => 1e7
     * @return astarPriceE8
     */
    function getAstarPriceE8() public view returns (uint256) {
        (uint128 astarPriceE8, ) = diaOracle.getValue(DIA_ASTR_PRICE_KEY);
        require(
            astarPriceE8 > 0,
            "ArthswapIDO: astarPrice must be greater than 0"
        );
        return uint256(astarPriceE8);
    }

    /**
     * @notice get all IDO participants address and tokenAmount
     * @return accounts array of Account
     */
    function getAllocatedAccounts(uint256 projectId)
        external
        view
        returns (Account[] memory)
    {
        require(
            projectId < projects.length,
            "ArthswapIDO: project ID should be within index range"
        );
        return allocatedAccounts[projectId];
    }

    /**
     * @notice get amount of IDO token user bought
     * @param projectId project index of projects
     * @param userAddress user address
     * @return allocatedAmount amount of IDO token user bought
     */
    function getUserAllocatedAmount(uint256 projectId, address userAddress)
        external
        view
        returns (uint256)
    {
        require(
            projectId < projects.length,
            "ArthswapIDO: project ID should be within index range"
        );
        return
            accountIds[projectId][userAddress] == 0
                ? 0
                : allocatedAccounts[projectId][
                    accountIds[projectId][userAddress] - 1
                ].amounts;
    }

    /**
     * @notice get all added IDO project
     * @return projects array of Project
     */
    function getProjects() external view returns (Project[] memory) {
        return projects;
    }

    function addUserAllocatedAmount(
        uint256 projectId,
        address userAddress,
        uint256 buyAmount,
        uint256 usdcAmounts,
        uint256 usdtAmounts,
        uint256 astarAmounts
    ) internal {
        if (accountIds[projectId][userAddress] == 0) {
            // 0 is used for not allocated signal, which is default value for uint256
            allocatedAccounts[projectId].push(
                Account(
                    userAddress,
                    buyAmount,
                    usdcAmounts,
                    usdtAmounts,
                    astarAmounts
                )
            );
            accountIds[projectId][userAddress] = allocatedAccounts[projectId]
                .length;
        } else {
            uint256 _accountId = accountIds[projectId][userAddress] - 1;
            allocatedAccounts[projectId][_accountId].amounts += buyAmount;
            allocatedAccounts[projectId][_accountId].usdcAmounts += usdcAmounts;
            allocatedAccounts[projectId][_accountId].usdtAmounts += usdtAmounts;
            allocatedAccounts[projectId][_accountId]
                .astarAmounts += astarAmounts;
        }
    }

    /**
     * @notice register IDO projects
     * @param name project name
     * @param startTimestamp IDO starting timestamp
     * @param endTimestamp IDO ending timestamp
     * @param tokenDecimals decimals of the IDO token
     * @param maxAllocateAmount max amount of IDO token for the allocation
     * @param usdPricePerTokenE6 USD price per IDO token
     * @param astarPriceDiscountMultiplierE4 discount rate for buying with Astar, if 5% discount => it will be 9500
     * @param fundsAddress project owned address which raised tokens(USDC, USDT, Astar) will transfer to
     */
    function addProject(
        string memory name,
        uint256 startTimestamp,
        uint256 endTimestamp,
        uint256 tokenDecimals,
        uint256 maxAllocateAmount,
        uint256 usdPricePerTokenE6,
        uint256 astarPriceDiscountMultiplierE4,
        address fundsAddress
    ) external onlyOwner {
        require(
            startTimestamp >= block.timestamp,
            "ArthswapIDO: Start time should be after the current time"
        );
        require(
            endTimestamp > startTimestamp,
            "ArthswapIDO: End time should come after the start time"
        );
        require(
            maxAllocateAmount > 0,
            "ArthswapIDO: Maximum of allocated amount should be greater than 0"
        );
        require(
            usdPricePerTokenE6 > 0,
            "ArthswapIDO: USD price per token should be greater than 0"
        );
        require(
            astarPriceDiscountMultiplierE4 > 0 &&
                astarPriceDiscountMultiplierE4 <= 10000,
            "ArthswapIDO: Discount rate for ArthSwap should be between 0% and 99.99%"
        );
        require(
            fundsAddress != address(0x0),
            "ArthswapIDO: Funds address must not be 0"
        );
        projects.push(
            Project(
                name,
                startTimestamp,
                endTimestamp,
                tokenDecimals,
                maxAllocateAmount,
                usdPricePerTokenE6,
                astarPriceDiscountMultiplierE4,
                fundsAddress
            )
        );
        emit ProjectAdded(
            projects.length - 1,
            name,
            startTimestamp,
            endTimestamp,
            tokenDecimals,
            maxAllocateAmount,
            usdPricePerTokenE6,
            astarPriceDiscountMultiplierE4,
            fundsAddress
        );
    }
}
