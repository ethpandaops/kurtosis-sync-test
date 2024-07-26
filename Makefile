
all: run clean

run:
	./synctest.sh

clean:
	kurtosis clean -a
