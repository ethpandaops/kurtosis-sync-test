# Default wait time (in seconds)
WAIT_TIME ?= 1800

all: run clean

run:
	./synctest.sh -t $(WAIT_TIME)

clean:
	kurtosis clean -a

# Add these new targets
run-no-wait:
	./synctest.sh -t 0

run-custom-wait:
	@read -p "Enter wait time in seconds: " wait_time; \
	./synctest.sh -t $$wait_time