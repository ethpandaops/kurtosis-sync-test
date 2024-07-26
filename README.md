# Ethereum Client Sync Test Script

This repository contains a test script that automates the testing of Ethereum clients' ability to synchronize with an existing Ethereum network.

## Dependencies

Before using the script, ensure you have the following dependencies installed:

- [Kurtosis](https://docs.kurtosis.com/install)
- `curl`
- `jq`
- `yq`

## Usage

To start the synchronization test, use the following command:

```sh
make run
```

To stop and clean up the testnet, use:

```sh
make clean
```

Running `make` alone will execute the synchronization test and clean up afterwards.

### Prepare `kurtosis-config.yaml`

Before running the test, ensure that the `kurtosis-config.yaml` file is prepared to include the client pairs that should be tested. 
All participants with `validator_count: 0` are stopped after initialization and tested for their synchronization capabilities later on.

## Parameters

Instead of using `make run`, you can manually invoke the `synctest.sh` script with optional parameters for dev/debugging purposes:

```sh
./synctest.sh <enclave-name> <kurtosis-config>
```

- `<enclave-name>`: Name of the enclave (defaults to `synctest-XXX`, where `XXX` is a random string)
- `<kurtosis-config>`: Path to the Kurtosis configuration file (defaults to `./kurtosis-config.yaml`)

## Script Description

The script performs the following steps:

1. Spins up a Kurtosis testnet using the provided Kurtosis configuration.
2. Immediately after creation, all client pairs without validator keys are shut down.\
   These clients are initialized but not following the chain.
3. Waits for a specified time to allow the testnet to proceed and build blocks.\
   Several transaction and blob spammers are included to add load to the chain.
4. After 30 minutes or when manually proceeding, the previously shut-down clients are turned on again, starting their synchronization with the chain.
5. An assertion test is launched that polls the now synchronizing clients for their synchronization status.
6. When all clients are synchronized, the test succeeds and the script stops execution.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

For more detailed information, refer to the script comments and the [Kurtosis ethereum-package documentation](https://github.com/ethpandaops/ethereum-package).

Feel free to open issues or submit pull requests if you find any bugs or have improvements.

Happy testing!