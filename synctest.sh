#!/bin/bash
__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
YELLOW='\033[1;33m'
GRAY='\033[0;37m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "## Sync Test"
# Default wait time
WAIT_TIME=1800

# Parse command line arguments
while getopts ":t:" opt; do
  case ${opt} in
    t )
      WAIT_TIME=$OPTARG
      ;;
    \? )
      echo "Invalid option: $OPTARG" 1>&2
      exit 1
      ;;
    : )
      echo "Invalid option: $OPTARG requires an argument" 1>&2
      exit 1
      ;;
  esac
done
shift $((OPTIND -1))

enclave="$1"
if [ -z "$enclave" ]; then
    enclave="synctest-$(($RANDOM % 1000))"
fi

config="$2"
if [ -z "$config" ]; then
    config="${__dir}/kurtosis-config.yaml"
fi

if [ -z "$(which kurtosis)" ]; then
    echo "Error: kurtosis executable not found. Please install kurtosis-cli first: https://docs.kurtosis.com/install"
    exit 1
fi
if [ -z "$(which jq)" ]; then
    echo "Error: jq not found."
    exit 1
fi
if [ -z "$(which yq)" ]; then
    echo "Error: yq not found."
    exit 1
fi
if [ -z "$(which curl)" ]; then
    echo "Error: curl not found."
    exit 1
fi

echo "Enclave: $enclave"
echo "Config:  $config"
echo ""

# 1: Start kurtosis with all pairs
if kurtosis enclave inspect "$enclave" 2> /dev/null 1> /dev/null; then
    echo "kurtosis enclave '$enclave' is already up."
else
    echo "start kurtosis enclave '$enclave'..."

    kurtosis run github.com/ethpandaops/ethereum-package --enclave "$enclave" --args-file "$config" --image-download always --non-blocking-tasks
fi

# extract assertoor api from running enclave
echo "load assertoor url from enclave services..."
assertoor_url=$(kurtosis enclave inspect $enclave | grep "assertoor" | grep "http://" | sed -E 's/.*(http:\/\/[^\/ ]*).*/\1/')

if [ -z "$assertoor_url" ]; then
    echo "could not find assertoor api url in enclave services."
    exit 1
fi
echo "assertoor api: $assertoor_url"

# extract assertoor config
echo "load assertoor config & get non validating client pairs..."
assertoor_config=$(kurtosis files inspect "$enclave" assertoor-config assertoor-config.yaml | tail -n +2)

non_validating_pairs=$(
    echo "$assertoor_config" | 
    yq ". as \$root | .globalVars.clientPairNames | filter( . as \$item | \$root.globalVars.validatorPairNames | contains([\$item]) == false ) | .[]" | 
    while IFS= read -r client ; do
        client_parts=( $(echo $client | sed 's/-/ /g') )
        cl_container="cl-${client_parts[0]}-${client_parts[2]}-${client_parts[1]}"
        el_container="el-${client_parts[0]}-${client_parts[1]}-${client_parts[2]}"

        echo "${client_parts[0]} $client $cl_container $el_container"
    done
)

# 2: stop client pairs that are not validating
echo "stop non validating client pairs..."
echo "$non_validating_pairs" | while IFS= read -r client ; do
    client=( $client )

    echo "  stop participant ${client[0]} cl: ${client[2]}"
    kurtosis service stop $enclave ${client[2]} > /dev/null

    echo "  stop participant ${client[0]} el: ${client[3]}"
    kurtosis service stop $enclave ${client[3]} > /dev/null
done

# 3: await
echo ""
echo "Waiting for chain progress... (${WAIT_TIME} seconds)"

if [ ${WAIT_TIME} -eq 0 ]; then
    read -p "Hit ENTER to continue"
else
    read -t ${WAIT_TIME} -p "Hit ENTER or wait ${WAIT_TIME} seconds"
fi
# 4: start previously stopped clients
echo ""
echo "start non validating client pairs..."
echo "$non_validating_pairs" | while IFS= read -r client ; do
    client=( $client )

    echo "  start participant ${client[0]} cl: ${client[2]}"
    kurtosis service start $enclave ${client[2]} > /dev/null

    echo "  start participant ${client[0]} el: ${client[3]}"
    kurtosis service start $enclave ${client[3]} > /dev/null
done

# 5: start assertoor test that polls the nodes for sync status
echo "start sync check in assertoor..."

test_registration=$(curl -s \
  -H "Accept: application/json" \
  -H "Content-Type:application/json" \
  -X POST \
  --data "{\"file\": \"https://raw.githubusercontent.com/ethpandaops/assertoor-test/master/assertoor-tests/synchronized-check.yaml\"}" \
  "$assertoor_url/api/v1/tests/register_external"
)
if [ "$(echo "$test_registration" | jq -r ".status")" != "OK" ]; then
    echo "failed registering synchronization check in assertoor:"
    echo "  $test_registration"
    exit 1
fi

test_config="{}"
test_config=$(echo "$test_config" | jq ".test_id=\"synchronized-check\"")
client_names=$(
    echo "$non_validating_pairs" | while IFS= read -r client ; do
        client=( $client )
        echo "${client[1]}"
    done | jq -Rn '[inputs]'
)
test_config=$(echo "$test_config" | jq -c ".config={clientPairNames:$client_names}")

test_start=$(curl -s \
  -H "Accept: application/json" \
  -H "Content-Type:application/json" \
  -X POST \
  --data "$test_config" \
  "$assertoor_url/api/v1/test_runs/schedule"
)
if [ "$(echo "$test_start" | jq -r ".status")" != "OK" ]; then
    echo "failed starting synchronization check in assertoor:"
    echo "  $test_start"
    exit 1
fi

test_run_id=$(echo "$test_start" | jq ".data.run_id")

# 6: wait for assertoor test result
echo -n "await assertoor sync test completion... "

get_tasks_status() {
    tasks=$(echo "$1" | jq -c ".data.tasks[] | {index, parent_index, name, title, status, result}")

    echo "$tasks" | while IFS= read -r task ; do
        task_id=$(echo "$task" | jq -r ".index")
        task_parent=$(echo "$task" | jq -r ".parent_index")
        task_name=$(echo "$task" | jq -r ".name")
        task_title=$(echo "$task" | jq -r ".title")
        task_result=$(echo "$task" | jq -r ".result")

        if [ "$task_result" == "none" ]; then
            task_result="${GRAY}none   ${NC}"
        elif [ "$task_result" == "success" ]; then
            task_result="${GREEN}success${NC}"
        elif [ "$task_result" == "failure" ]; then
            task_result="${RED}failure${NC}"
        fi
          
        echo -e " $(printf '%-4s' "$task_id")\t$task_result\t $(printf '%-50s' "$task_name") \t$task_title"
    done
}

while true
do
    test_data=$(curl -s "$assertoor_url/api/v1/test_run/$test_run_id")
    test_status=$(echo "$test_data" | jq -r ".data.status")

    if [ "$test_status" == "pending" ]; then
        echo -n "-"
    elif [ "$test_status" == "running" ]; then
        echo -n "+"
    else
        echo ""
        echo -n "sync test complete! status:"
        if [ "$test_status" == "success" ]; then
            echo "${GREEN}success${NC}"
        else
            echo "${RED}$test_status${NC}"
        fi

        echo ""
        get_tasks_status "$test_data"
        break
    fi

    sleep 5
done

