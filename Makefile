# Default wait time (in seconds)
WAIT_TIME ?= 1800

all: run clean

run:
	./synctest.sh -t $(WAIT_TIME)

# Run sync test with supernode enabled
run-supernode:
	./synctest.sh -t $(WAIT_TIME) --supernode

clean:
	kurtosis clean -a

# Add these new targets
run-no-wait:
	./synctest.sh -t 0

run-custom-wait:
	@read -p "Enter wait time in seconds: " wait_time; \
	./synctest.sh -t $$wait_time

# Sync test targets
# Usage examples:
#   make synctest                                    # Test all clients
#   make synctest ARGS="-c lighthouse"              # Test specific client
#   make synctest ARGS="-c teku --genesis-sync"     # Test with genesis sync
#   make synctest ARGS="-c lighthouse -e nethermind" # Test with specific EL
#   make synctest ARGS="-c lighthouse --supernode"  # Test with supernode enabled
#   make synctest ARGS="-h"                         # Show help
synctest:
	./synctest.sh $(ARGS)

# Stop-restart sync test
# Usage examples:
#   make synctest-stop-restart                              # All clients, 300s delay
#   make synctest-stop-restart START_DELAY=60               # All clients, 60s delay
#   make synctest-stop-restart ARGS="-c lighthouse"         # Specific client
START_DELAY ?= 300
synctest-stop-restart:
	./synctest.sh --stop-restart --start-delay $(START_DELAY) $(ARGS)

.PHONY: all run clean run-no-wait run-custom-wait synctest synctest-stop-restart