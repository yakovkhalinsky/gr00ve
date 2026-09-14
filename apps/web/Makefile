# React/Vite app in the root pnpm workspace.
#
# Dependencies resolve through the workspace lockfile at the repo root, so this
# project's `install` is a no-op — run `make install` from the root instead.
#
# Note `test` needs no dependencies, but it only covers the pure logic in
# src/. Anything touching Web Audio or Web MIDI needs a real browser and is out
# of scope for `node --test` — see the brief's note on testing strategy.

DIST := dist
VITE := node_modules/.bin/vite
TSC := node_modules/.bin/tsc

.PHONY: install dev build test lint fmt check clean

install: ## No-op — dependencies come from the root pnpm workspace
	@echo "web: dependencies come from the root workspace — run 'make install' at the repo root"

dev: ## Run the Vite dev server (http://localhost:5273)
	@if [ -x "$(VITE)" ]; then \
		$(VITE); \
	else \
		echo "web: vite not installed — run 'make install' at the repo root" >&2; \
		exit 1; \
	fi

build: ## Production build to dist/
	@if [ -x "$(VITE)" ]; then \
		$(VITE) build && echo "web: built to $(DIST)/"; \
	else \
		echo "web: vite not installed — run 'make install' at the repo root"; \
	fi

test: ## Run the unit tests (needs no dependencies)
	node --test

lint: ## Type-check without emitting
	@if [ -x "$(TSC)" ]; then \
		$(TSC) -p . && echo "web: type-check clean"; \
	else \
		echo "web: typescript not installed — run 'make install' at the repo root"; \
	fi

fmt: ## No formatter configured for this project
	@echo "web: no formatter configured"

check: lint build test

clean: ## Remove build artifacts
	rm -rf $(DIST) "$(DIST).tsbuildinfo" .tsbuildinfo
