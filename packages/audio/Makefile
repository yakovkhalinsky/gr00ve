# Node/TypeScript project in the root pnpm workspace.
#
# Dependencies resolve through the workspace lockfile at the repo root, so this
# project's `install` is a no-op — run `make install` from the root instead.
#
# Node 24 strips TypeScript types natively, so `test` runs with zero
# dependencies installed. `tsc` is only needed for type-checking and emitting,
# so `build` and `lint` degrade gracefully when it is absent.

DIST := dist

# pnpm links workspace dependencies' binaries into the package that depends on
# them (not into the workspace root), so this is the package-local shim.
TSC := node_modules/.bin/tsc

.PHONY: install build test lint fmt check clean

install: ## No-op — dependencies come from the root pnpm workspace
	@echo "audio: dependencies come from the root workspace — run 'make install' at the repo root"

build: ## Type-check and emit to dist/ (excludes tests)
	@if [ -x "$(TSC)" ]; then \
		$(TSC) -p tsconfig.build.json && echo "audio: emitted to $(DIST)/"; \
	else \
		echo "audio: typescript not installed — run 'make install' at the repo root"; \
	fi

test: ## Run the test suite (needs no dependencies)
	node --test

lint: ## Type-check everything, tests included, without emitting
	@if [ -x "$(TSC)" ]; then \
		$(TSC) -p . && echo "audio: type-check clean"; \
	else \
		echo "audio: typescript not installed — run 'make install' at the repo root"; \
	fi

fmt: ## No formatter configured for this project
	@echo "audio: no formatter configured"

check: lint build test

clean: ## Remove build artifacts
	rm -rf $(DIST) "$(DIST).tsbuildinfo" .tsbuildinfo
