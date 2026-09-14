# gr00ve — generative multi-track sequencer monorepo root.
#
# A "project" is any directory under apps/ or packages/ that contains a
# Makefile. Each project keeps whatever native toolchain it likes; the root
# only asks that it expose the targets it cares about.
#
#   make                              help + discovered projects
#   make test                         run `test` in every project
#   make test PKG=packages/core       run it in one project
#   make ci STRICT=1                  lint + build + test, no skips allowed
#
# Variables:
#   PKG="apps/a packages/b"  restrict the fan-out to these project paths
#   STRICT=1                 a project missing a target becomes a failure
#   NO_COLOR=1               disable ANSI colour

SHELL := /bin/bash
.DEFAULT_GOAL := help

PKG ?=
STRICT ?= 0
# CI passes --frozen-lockfile so a stale pnpm-lock.yaml fails loudly.
PNPM_FLAGS ?=

.PHONY: help list install build test lint fmt check clean ci dev

help: ## Show this help and the discovered projects
	@printf '\033[1mgr00ve\033[0m — generative multi-track sequencer\n\n'
	@printf 'Usage: make <target> [PKG=<path|"p1 p2">] [STRICT=1]\n\n'
	@printf 'Projects (%s discovered):\n' '$(words $(shell scripts/fanout.sh --list 2>/dev/null))'
	@scripts/fanout.sh --list 2>/dev/null | sed 's/^/  /' || true
	@printf '\nTargets:\n'
	@grep -hE '^[a-zA-Z][a-zA-Z_-]*:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-9s\033[0m %s\n", $$1, $$2}'

list: ## List discovered projects, one per line
	@scripts/fanout.sh --list

# pnpm workspaces are inherently root-level — dependencies for every JS
# package resolve through one lockfile at the root — so this cannot be
# delegated to the per-project fan-out.
install: ## Install dependencies (pnpm workspace, then every project)
	@if [ -f pnpm-workspace.yaml ]; then \
		if command -v pnpm >/dev/null 2>&1; then \
			echo "==> pnpm install (workspace root)"; \
			pnpm install $(PNPM_FLAGS) || exit 1; \
		else \
			echo "pnpm not found — run 'corepack enable' to activate the pinned version" >&2; \
			exit 1; \
		fi; \
	fi
	@scripts/fanout.sh install

dev: ## Run the web app dev server (apps/web)
	@make -C apps/web dev

build: ## Build every project
	@scripts/fanout.sh build

test: ## Test every project
	@scripts/fanout.sh test

lint: ## Lint every project
	@scripts/fanout.sh lint

fmt: ## Format every project
	@scripts/fanout.sh fmt

check: ## Build, test, and lint every project
	@scripts/fanout.sh build test lint

clean: ## Remove build artifacts from every project
	@scripts/fanout.sh clean

ci: lint build test ## What CI runs
