# Deploying the AutoRoll keeper

The keeper is a single-instance, continuously running worker. Vercel functions
are not suitable because they do not keep a polling process alive.

## This Mac (showcase setup)

1. Put the dedicated, funded Shannon keeper key in `.env.keeper`. This file is
   ignored by Git and the installer changes its permissions to owner-read/write.
2. Install and start the per-user LaunchAgent:

   ```bash
   npm run keeper:mac:install
   npm run keeper:mac:status
   ```

The service starts at login, restarts after failures, writes logs under `.keeper/`,
and uses `caffeinate -i` to prevent idle sleep. A MacBook still sleeps when its lid
is closed: keep it plugged in, open, and online during the showcase.

The installer copies a minimal runtime to
`~/Library/Application Support/AutoRoll Keeper`. This is necessary because macOS
privacy controls deny LaunchAgents access to projects stored under `~/Documents`.
Re-run the installer after changing keeper source or `.env.keeper`.

To stop and remove it:

```bash
launchctl bootout gui/$(id -u)/com.autoroll.keeper
rm ~/Library/LaunchAgents/com.autoroll.keeper.plist
```

## Free, always-on VM (recommended)

Google Cloud's Free Tier includes one non-preemptible `e2-micro` VM for the
month in `us-west1`, `us-central1`, or `us-east1`, subject to its published free
limits. Create an Ubuntu VM using that shape and region. A billing account is
normally still required, so set a budget alert and do not select resources
outside the free allowance.

After installing Git and Docker Engine with the Compose plugin:

```bash
git clone --recursive https://github.com/successaje/autoroll.git
cd autoroll
cp .env.keeper.example .env.keeper
nano .env.keeper                 # enter the dedicated funded testnet key
docker compose -f compose.keeper.yml up -d --build
docker compose -f compose.keeper.yml ps
curl http://127.0.0.1:8080/health
```

The Compose service restarts after a crash or VM reboot, and Docker checks the
keeper every 15 seconds. The health port is bound to VM loopback only; inspect it
over SSH rather than opening a firewall rule.

Useful operations:

```bash
docker compose -f compose.keeper.yml logs -f --tail=100
docker compose -f compose.keeper.yml restart
docker compose -f compose.keeper.yml down
```

Oracle Always Free can run the same Compose file, including on an Ampere ARM VM.
However, Oracle documents that idle Always Free compute may be reclaimed. This
keeper is intentionally low-CPU, so Google Cloud or a machine you control is a
safer choice for Monday.

Free application hosts that scale to zero are not suitable. A sleeping instance
does not poll the chain and can miss a complete event-contract window.

## Railway

1. Create a new Railway project from this repository. `railway.json` selects
   `Dockerfile.keeper`, starts the live keeper, checks `/health`, and always
   restarts the process after a crash.
2. Keep the service at exactly **one instance**. Pokes are idempotent, but two
   signers using the same account can still race nonces and waste gas.
3. Add these service variables:

   ```text
   VAULT_ADDRESS=0xf0802c0c94bec42ac93bc7439724df04674a7a39
   RPC_URL=https://dream-rpc.somnia.network/
   KEEPER_RECOVERY_BLOCKS=10000
   PRIVATE_KEY=<the funded dedicated keeper key>
   ```

   `PRIVATE_KEY` must be entered in Railway's secret/variable UI. Never commit it,
   paste it into build arguments, or reuse a wallet that holds mainnet assets.
4. Generate a public domain for the service so Railway can call `/health`. The
   endpoint contains only public operational state: vault, signer address, latest
   block, latest transaction and error status.
5. After deployment, open `/health` and require `"state":"healthy"`. Then run
   `npm run showcase:check` locally and wait for an active position to show a fill
   or completed roll.

## Restart behavior

At startup the worker scans the preceding 10,000 blocks for missed
`MarketFinalized` events and harvests only markets the vault is actually exposed
to. It deliberately does not replay old `MarketCreated` events, because that would
attempt entry into expired windows. Pending positions simply enter the next newly
created eligible market.

## Monday checklist

- Keeper signer has enough STT for several 30M-gas pokes.
- Exactly one hosted keeper is active; stop the local live keeper after cutover.
- `/health` is healthy and its `lastSuccessfulTick` keeps advancing.
- At least one warmed position has a completed roll.
- Railway restart notifications are enabled.
