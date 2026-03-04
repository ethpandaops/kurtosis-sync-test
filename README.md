# Ethereum Client Sync Test

Automated sync testing for Ethereum EL/CL client pairs using [Kurtosis](https://docs.kurtosis.com/) and [Assertoor](https://github.com/ethpandaops/assertoor). Spins up a client pair, connects it to an existing network via checkpoint sync, and verifies it reaches a synced state.

## Dependencies

- [Kurtosis](https://docs.kurtosis.com/install)
- [Docker](https://docs.docker.com/get-docker/)
- `curl`, `jq`, `yq`, `envsubst` (from `gettext`)

## Usage

```sh
# Test all CL clients with geth
./synctest.sh

# Test a specific client pair
./synctest.sh -c lighthouse -e nethermind

# Custom images and devnet
./synctest.sh -c teku -i consensys/teku:develop -d my-devnet -D my-repo

# Genesis sync with longer timeout
./synctest.sh -c lighthouse --genesis-sync -t 3600

# Stop-restart resync test (sync, stop clients, wait, restart, verify resync)
./synctest.sh -c lighthouse --stop-restart --start-delay 60

# Using make
make synctest ARGS="-c lighthouse -e geth"
make synctest-stop-restart ARGS="-c lighthouse" START_DELAY=60
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-c <client>` | CL client (lighthouse, teku, prysm, nimbus, lodestar, grandine) | all |
| `-i <image>` | Custom CL Docker image | per-client default |
| `-e <client>` | EL client (geth, nethermind, reth, besu, erigon) | `geth` |
| `-E <image>` | Custom EL Docker image | per-client default |
| `-d <devnet>` | Network/devnet name | `hoodi` |
| `-D <repo>` | Devnet repo | `ethpandaops` |
| `-t <seconds>` | Timeout | `1800` |
| `--genesis-sync` | Use genesis sync instead of checkpoint sync | |
| `--supernode` | Enable supernode | |
| `--always-collect-logs` | Collect logs even on success | |
| `--stop-restart` | After sync, stop clients, wait, restart, verify resync | |
| `--start-delay <seconds>` | Seconds to keep clients stopped before restart | `300` |

Logs for failed tests are saved to `logs/<enclave-name>/`.

## GitHub Action

```yaml
# Basic
- uses: ethpandaops/kurtosis-sync-test@main
  with:
    el_client: geth
    cl_client: lighthouse

# With custom images
- uses: ethpandaops/kurtosis-sync-test@main
  with:
    network: hoodi
    el_client: nethermind
    cl_client: teku
    timeout: 3600
    client_images: '{"nethermind":"nethermind/nethermind:latest"}'
```

### Action Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `network` | Network name | `hoodi` |
| `el_client` | Execution layer client | `geth` |
| `cl_client` | Consensus layer client | `lighthouse` |
| `timeout` | Timeout in seconds | `7200` |
| `client_images` | Custom images as JSON (e.g., `{"geth":"..."}`) | `{}` |
| `supernode_enabled` | Enable supernode | `false` |
| `generate_html_report` | Generate HTML report | `true` |
| `kurtosis_version` | Kurtosis CLI version | `latest` |
| `enclave_name` | Custom enclave name | auto-generated |

### Action Outputs

| Output | Description |
|--------|-------------|
| `test_result` | `success` or `failure` |
| `test_summary` | Summary of test execution |
| `html_report_path` | Path to generated HTML report |
| `enclave_name` | Kurtosis enclave name used |

## License

MIT — see [LICENSE](LICENSE).
