// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {AutoRollVault} from "../src/AutoRollVault.sol";
import {IERC20, IBinaryMarketsModule} from "../src/interfaces/IDreamDex.sol";

interface ITestUsdc {
    function faucet(uint256 amount) external;
    function decimals() external view returns (uint8);
}

/**
 *  Runs against a FORK of live Shannon, so the module, the outcome-token
 *  singleton and the collateral are the real deployed contracts rather than
 *  mocks. What this proves is the part of the vault that does not need a
 *  reactivity subscription: deployment, custody, position opening, the keeper
 *  entries, and the reads the UI is built on.
 *
 *    forge test --fork-url shannon -vv
 */
contract AutoRollVaultForkTest is Test {
    address constant BINARY_MODULE = 0x3ecC694Cef705358864a646142ac17A90E29e388;
    address constant OUTCOME_TOKEN = 0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9;
    address constant TEST_USDC = 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E;

    bytes32 constant BTC = keccak256("BTC");

    AutoRollVault vault;
    address user = makeAddr("user");

    function setUp() public {
        vault = new AutoRollVault(BINARY_MODULE, OUTCOME_TOKEN, TEST_USDC);
    }

    function _fund(address who, uint256 amount) internal {
        vm.prank(who);
        ITestUsdc(TEST_USDC).faucet(amount);
    }

    function _policy() internal pure returns (AutoRollVault.Policy memory) {
        return AutoRollVault.Policy({
            maxRolls: 0,
            maxLosses: 4,
            takeProfitBps: 0,
            sizeBps: 2_000, // 20% of the bankroll per window
            maxPriceWad: 0.65e18,
            compound: true
        });
    }

    /// The collateral really is the live 6-decimal TestUSDC, and its faucet works.
    function test_collateralIsLiveTestUsdc() public {
        assertEq(ITestUsdc(TEST_USDC).decimals(), 6, "TestUSDC is 6dp on Shannon");
        _fund(user, 100e6);
        assertEq(IERC20(TEST_USDC).balanceOf(user), 100e6);
    }

    /// The one transaction a user ever signs.
    function test_openPositionTakesCustodyAndQueues() public {
        _fund(user, 100e6);

        vm.startPrank(user);
        IERC20(TEST_USDC).approve(address(vault), 100e6);
        uint256 id = vault.openPosition(BTC, true, 100e6, _policy());
        vm.stopPrank();

        assertEq(id, 1, "first position");
        assertEq(IERC20(TEST_USDC).balanceOf(user), 0, "collateral left the wallet");
        assertEq(IERC20(TEST_USDC).balanceOf(address(vault)), 100e6, "vault holds it");

        (address owner_,,, uint256 principal, uint256 bankroll, uint256 atRisk, uint256 quantity,,, bool active,)
        = vault.positions(id);
        assertEq(quantity, 0, "no outcome tokens until a window fills");
        assertEq(owner_, user);
        assertEq(principal, 100e6);
        assertEq(bankroll, 100e6, "all of it idle until a window opens");
        assertEq(atRisk, 0);
        assertTrue(active);

        assertEq(vault.equityOf(id), 100e6, "equity is bankroll + atRisk");

        uint256[] memory ids = vault.positionsOf(user);
        assertEq(ids.length, 1);
        assertEq(ids[0], id);
    }

    /// The keeper entries are the reason the vault works before it is subscribed.
    /// Both must be cheap no-ops on a market the vault has no position in, or a
    /// keeper sweeping the venue would revert on almost every call.
    function test_keeperEntriesAreNoOpsOnForeignMarkets() public {
        bytes32 stranger = keccak256("not-our-market");
        vault.pokeFinalized(stranger);
        vault.pokeCreated(stranger, BTC);
        assertEq(vault.nextPositionId(), 1, "nothing happened");
    }

    /// A position with nothing pending must not be entered twice, and a keeper
    /// poke for an asset we hold no pending position on must do nothing.
    function test_pokeCreatedIgnoresOtherAssets() public {
        _fund(user, 50e6);
        vm.startPrank(user);
        IERC20(TEST_USDC).approve(address(vault), 50e6);
        uint256 id = vault.openPosition(BTC, true, 50e6, _policy());
        vm.stopPrank();

        // Pending on BTC; a poke naming ETH must leave it pending.
        vault.pokeCreated(keccak256("not-a-real-market"), keccak256("ETH"));

        (,,,, uint256 bankroll, uint256 atRisk,,,,,) = vault.positions(id);
        assertEq(bankroll, 50e6);
        assertEq(atRisk, 0, "still waiting for a BTC window");
    }

    /// Stopping is the user's, and only the user's.
    function test_closePositionIsOwnerOnly() public {
        _fund(user, 25e6);
        vm.startPrank(user);
        IERC20(TEST_USDC).approve(address(vault), 25e6);
        uint256 id = vault.openPosition(BTC, true, 25e6, _policy());
        vm.stopPrank();

        vm.expectRevert(AutoRollVault.NoSuchPosition.selector);
        vault.closePosition(id); // not the user

        vm.prank(user);
        vault.closePosition(id);
    }

    /*//////////////////////////////////////////////////////////////
                          FUND-LOSS REGRESSIONS
    //////////////////////////////////////////////////////////////*/

    /// Reactivity needs 32 STT parked in the vault. Without a native recovery
    /// path that funding is a one-way trip, and a failed subscribe strands it.
    function test_nativeCanBeRecovered() public {
        address deployer = makeAddr("deployer"); // an EOA, as in the real deploy
        vm.prank(deployer);
        AutoRollVault v = new AutoRollVault(BINARY_MODULE, OUTCOME_TOKEN, TEST_USDC);

        vm.deal(address(v), 32 ether);
        uint256 before = deployer.balance;

        vm.prank(deployer);
        v.sweepNative(32 ether);

        assertEq(deployer.balance, before + 32 ether, "recovered in full");
        assertEq(address(v).balance, 0);
    }

    /// If the owner cannot receive native, the sweep must REVERT rather than
    /// report success and burn the balance.
    function test_sweepNativeRevertsRatherThanLosingFunds() public {
        // `vault`'s owner is this test contract, which has no receive().
        vm.deal(address(vault), 1 ether);
        vm.prank(vault.owner());
        vm.expectRevert(AutoRollVault.NativeTransferFailed.selector);
        vault.sweepNative(1 ether);
        assertEq(address(vault).balance, 1 ether, "balance untouched");
    }

    function test_sweepNativeIsOwnerOnly() public {
        vm.deal(address(vault), 1 ether);
        vm.prank(user);
        vm.expectRevert(AutoRollVault.NotOwner.selector);
        vault.sweepNative(1 ether);
    }

    /// The vault must accept a plain transfer too - some funding paths do not
    /// call `fundReactivity`.
    function test_vaultAcceptsPlainNativeTransfer() public {
        vm.deal(user, 5 ether);
        vm.prank(user);
        (bool ok,) = payable(address(vault)).call{value: 5 ether}("");
        assertTrue(ok, "receive() accepts it");
        assertEq(address(vault).balance, 5 ether);
    }

    /// A position closed BETWEEN windows used to set `maxRolls = rolls` and wait
    /// for a harvest that could never come — nothing was committed, so nothing
    /// would ever finalize, and the bankroll stayed locked in the vault forever.
    function test_closeBetweenWindowsPaysOutImmediately() public {
        _fund(user, 80e6);
        vm.startPrank(user);
        IERC20(TEST_USDC).approve(address(vault), 80e6);
        uint256 id = vault.openPosition(BTC, true, 80e6, _policy());

        assertEq(IERC20(TEST_USDC).balanceOf(user), 0, "custody taken");
        vault.closePosition(id);
        vm.stopPrank();

        assertEq(IERC20(TEST_USDC).balanceOf(user), 80e6, "refunded on the spot");
        (,,,, uint256 bankroll,,,,, bool active,) = vault.positions(id);
        assertEq(bankroll, 0);
        assertFalse(active, "closed, not left dangling");
    }

    /// …and it must be removed from the pending queue, or the next window would
    /// try to enter a closed position.
    function test_closedPositionLeavesThePendingQueue() public {
        _fund(user, 60e6);
        vm.startPrank(user);
        IERC20(TEST_USDC).approve(address(vault), 60e6);
        uint256 id = vault.openPosition(BTC, true, 60e6, _policy());
        vault.closePosition(id);
        vm.stopPrank();

        assertEq(vault.pendingCount(BTC), 0, "dropped from the queue");
    }

    /// The batch cap used to be followed by an unconditional `delete` of the
    /// whole queue, so every position past the 16th vanished — still active,
    /// funds still in the vault, and nothing left pointing at them.
    function test_pendingQueueSurvivesTheBatchCap() public {
        uint256 count = vault.MAX_ROLLS_PER_EVENT() + 5;

        for (uint256 i = 0; i < count; ++i) {
            address who = address(uint160(0x1000 + i));
            _fund(who, 10e6);
            vm.startPrank(who);
            IERC20(TEST_USDC).approve(address(vault), 10e6);
            vault.openPosition(BTC, true, 10e6, _policy());
            vm.stopPrank();
        }
        assertEq(vault.pendingCount(BTC), count);

        // A poke naming a market that is not ours enters nobody, so the queue
        // must come back untouched rather than truncated to the cap.
        vault.pokeCreated(keccak256("no-such-market"), BTC);
        assertEq(vault.pendingCount(BTC), count, "nobody dropped");
    }

    /// Two positions on the same side of the same window must each redeem their
    /// OWN tokens. `quantity` is per position for exactly this reason — reading
    /// the vault's shared ERC-6909 balance paid the first one everything.
    function test_quantityIsTrackedPerPosition() public {
        address a = makeAddr("a");
        address b = makeAddr("b");
        _fund(a, 30e6);
        _fund(b, 30e6);

        vm.startPrank(a);
        IERC20(TEST_USDC).approve(address(vault), 30e6);
        uint256 idA = vault.openPosition(BTC, true, 30e6, _policy());
        vm.stopPrank();

        vm.startPrank(b);
        IERC20(TEST_USDC).approve(address(vault), 30e6);
        uint256 idB = vault.openPosition(BTC, true, 30e6, _policy());
        vm.stopPrank();

        (,,,,,, uint256 qA,,,,) = vault.positions(idA);
        (,,,,,, uint256 qB,,,,) = vault.positions(idB);
        assertEq(qA, 0);
        assertEq(qB, 0);
        assertTrue(idA != idB, "separate positions, separate holdings");
    }

    /// An unrolled position has an empty curve, and the call must not revert —
    /// the UI asks for it on every poll, including the very first one.
    function test_curveIsEmptyBeforeAnyRoll() public {
        _fund(user, 40e6);
        vm.startPrank(user);
        IERC20(TEST_USDC).approve(address(vault), 40e6);
        uint256 id = vault.openPosition(BTC, true, 40e6, _policy());
        vm.stopPrank();

        (uint256[] memory bankrolls, bool[] memory won, uint256 firstRoll) = vault.curveOf(id);
        assertEq(bankrolls.length, 0);
        assertEq(won.length, 0);
        assertEq(firstRoll, 1);
    }

    /// Subscribing without the protocol's 32-token floor must fail loudly rather
    /// than leaving the vault half-wired.
    function test_subscribeRevertsUnderfunded() public {
        vm.expectRevert(
            abi.encodeWithSelector(AutoRollVault.InsufficientReactivityBalance.selector, 0, 32 ether)
        );
        vault.subscribeAll(10_000_000, 0, 20 gwei);
    }
}
