# Mobile recording

The Mac runs the keeper; the phone signs through MetaMask’s browser. Safari / an installed PWA can view the shell and hand off to MetaMask, but wallet authorization does not carry between browsers.

1. Set `VITE_VAULT_ADDRESS` in `app/.env.local` to your deployed Shannon vault. Use the same address for the keeper. Leave `VITE_RPC_URL` unset to use the default public Shannon RPC. Never put a private key in any `VITE_*` variable.
2. From the repository root run `npm --prefix app run build`, then `npm run mobile:serve`. This serves only `app/dist` on Mac loopback; no off-chain API or repository files are exposed.
3. Point your trusted HTTPS tunnel at `http://127.0.0.1:5184` (for example, if installed: `cloudflared tunnel --url http://127.0.0.1:5184`). Keep that process running and open the resulting HTTPS URL on the phone. A phone cannot use the Mac’s localhost. Plain LAN HTTP is insufficient for service workers / installation. A stable HTTPS origin avoids having to reauthorize and reinstall after a tunnel URL changes.
4. In another Mac terminal, load the keeper’s funded testnet signing key into `PRIVATE_KEY` using your normal local secret setup. Run `npm run keeper -- --vault <same-vault-address>` for dry-run inspection. When ready to send keeper transactions, run `npm run keeper -- --vault <same-vault-address> --live`. Keep the Mac awake, for example by prefixing the live command with `caffeinate -i`. The phone wallet’s key stays on the phone. Do not run multiple keepers for the same vault.
5. On the phone tap **Open in MetaMask**, connect, and switch/add Shannon. Fund the phone account with test STT for gas, get test tUSDC, then use Trade to approve and open a position. These are real wallet prompts; dismissing one must leave the UI usable. The keeper independently settles and attempts subsequent eligible entries.
6. Record Position → Trade → Activity, browser Back and in-app Back. Follow the existing DEMO.md timing advice: warm up for 20–30 minutes, allow 60s/300s windows, and show skipped fills honestly. Optionally open `/?watch=<phone-wallet-address>&page=position` on the Mac for a read-only view.
7. Test installation on the HTTPS URL: use the browser install menu on Android or Safari’s Add to Home Screen on iOS. Load once online, then turn on airplane mode and relaunch: the shell should show the offline message and no transaction controls. Restore connectivity and verify live state returns. First-ever offline visits cannot load an uncached app. Installed browser contexts may need their own first online load.

## Release and device checks

`npm --prefix app run build` includes TypeScript checking and generates a versioned cache of built assets. Service workers are production-only; close old app tabs / standalone windows and reopen to activate an updated shell. No RPC responses, API requests, balances or transactions are cached or queued. Offline detection follows the browser’s connection signal; RPC outages still surface through the existing error handling.

Before recording, verify on an actual iPhone and Android: installation, standalone safe areas in portrait/landscape, MetaMask handoff preserving watch/page, connect/network switch, approval/open/close, Back/Forward after reload and a direct Activity link, offline relaunch, and a new build after closing old tabs. MetaMask handoff uses its official dapp deep-link format: https://metamask.github.io/metamask-deeplinks/. OS/app settings can affect universal-link opening; paste the HTTPS URL into MetaMask’s browser if needed.

No keeper, tunnel, or wallet transaction is started by the build or mobile server.
