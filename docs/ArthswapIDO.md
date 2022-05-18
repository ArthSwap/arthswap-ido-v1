## `ArthswapIDO`

### `validProject(uint256 projectId, uint256 buyAmountMax)`

#### parameters

### `constructor(address _usdc, address _usdt, address _diaOracle)` (public)

#### parameters

    - `_usdc`:
    address of USDC

    - `_usdt`:
    address of USDT

    - `_diaOracle`:
    address of DIAOracleV2 contract

### `_buyToken(uint256 _projectId, uint256 _buyAmount, address _payTokenAddress, uint256 _payAmount)` (internal)

update states and events upon buying

#### parameters

    - `_projectId`:
    project index of projects

    - `_buyAmount`:
    amount of IDO project token to be bought

    - `_payTokenAddress`:
    address of USDC, USDT or ASTR(0x0)

    - `_payAmount`:
    amount to be paid in USDC, USDT or ASTR

### `getUsersCommittedTokenAmounts(uint256 projectId, address userAddress) → struct ArthswapIDO.CommittedToken[3]` (external)

get amounts of tokens user commit

#### parameters

    - `projectId`:
    project index of projects

    - `userAddress`:
    user address

### `buyWithUsd(uint256 projectId, contract IERC20 usdToken, uint256 buyAmountMax)` (external)

buy IDO token with USDC, USDT

#### parameters

    - `projectId`:
    project index of projects

    - `usdToken`:
    address of USDC or USDT

    - `buyAmountMax`:
    amount of buying IDO token

### `buyWithAstar(uint256 projectId, uint256 buyAmountMax)` (external)

buy IDO token with Astar, set msg.value > payment

#### parameters

    - `projectId`:
    project index of projects

    - `buyAmountMax`:
    amount of buying IDO token

### `getAstarPriceE8() → uint256` (public)

get astar price(1e8) if $0.1 => 1e7

#### parameters

### `getAllocatedAccounts(uint256 projectId) → struct ArthswapIDO.Account[]` (external)

get all IDO participants address and tokenAmount

#### parameters

### `getUserAllocatedAmount(uint256 projectId, address userAddress) → uint256` (external)

get amount of IDO token user bought

#### parameters

    - `projectId`:
    project index of projects

    - `userAddress`:
    user address

### `getProjects() → struct ArthswapIDO.Project[]` (external)

get all added IDO project

#### parameters

### `addUserAllocatedAmount(uint256 projectId, address userAddress, uint256 buyAmount, uint256 usdcAmounts, uint256 usdtAmounts, uint256 astarAmounts)` (internal)

#### parameters

### `addProject(string name, uint256 startTimestamp, uint256 endTimestamp, uint256 tokenDecimals, uint256 maxAllocateAmount, uint256 usdPricePerTokenE6, uint256 astarPriceDiscountMultiplierE4, address fundsAddress)` (external)

register IDO projects

#### parameters

    - `name`:
    project name

    - `startTimestamp`:
    IDO starting timestamp

    - `endTimestamp`:
    IDO ending timestamp

    - `tokenDecimals`:
    decimals of the IDO token

    - `maxAllocateAmount`:
    max amount of IDO token for the allocation

    - `usdPricePerTokenE6`:
    USD price per IDO token

    - `astarPriceDiscountMultiplierE4`:
    discount rate for buying with Astar, if 5% discount => it will be 9500

    - `fundsAddress`:
    project owned address which raised tokens(USDC, USDT, Astar) will transfer to

### `ProjectAdded(uint256 projectId, string name, uint256 startTimestamp, uint256 endTimestamp, uint256 tokenDecimals, uint256 maxAllocateAmount, uint256 usdPricePerTokenE6, uint256 astarPriceDiscountMultiplierE4, address fundsAddress)`

Emitted when project added, can be used getting all project list

#### parameters

### `TokenBought(uint256 projectId, address userAddress, address paidTokenAddress, uint256 amountBought)`

Emitted when user bought IDO token, can be used getting user committed token kinds and amount

#### parameters

### `TokenSoldOut(uint256 projectId, uint256 timestamp)`

Emitted when IDO token sold out, can be used getting timestamp of sold out

#### parameters
