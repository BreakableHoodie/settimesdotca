# settimes.ca — canonical task runner for humans and agents.
# make propagates real exit codes; never wrap these in `cmd | tail` chains.
# E2E recipe mirrors .github/actions/e2e-env/action.yml.

SHELL := /bin/sh
WRANGLER := ./frontend/node_modules/.bin/wrangler
E2E_STATE := .wrangler/e2e-state
E2E_PID := .wrangler/e2e-state/wrangler.pid
E2E_ADMIN_EMAIL ?= e2e-admin@test.local
E2E_ADMIN_PASSWORD ?= e2e-test-password-Xk9
# Exported, never interpolated: make echoes recipe text, so a $(VAR) in a
# recipe prints the secret to the terminal and into CI logs. Exporting puts
# the value in the child environment instead, where $$VAR reads it at run
# time and the recipe text never contains it. Verify with `make -n e2e-setup`.
export E2E_ADMIN_EMAIL
export E2E_ADMIN_PASSWORD

.PHONY: help install build dev format format-check lint lint-md lint-sh lint-yaml lint-sql lint-json \
	lint-all test test-backend test-frontend gate review review-wip validate-openapi schema-check \
	probe-links e2e e2e-setup e2e-serve e2e-run e2e-clean

# CodeRabbit emits PostHog telemetry errors when egress is blocked. They are
# noise, not review failures — the review still exits 0. They appear on BOTH
# stdout and stderr, so redirecting one stream is not enough.
#
# Every pattern here is anchored or names posthog/the CLI's own bundle path, so
# none can match review prose. Do NOT loosen these to bare tokens like `code:`
# or `path:` — a finding whose text contains one would be silently swallowed,
# and a filter that eats findings is worse than the noise it removes.
CR_NOISE := ^Error while flushing PostHog |^ *path: "https://us\.i\.posthog\.com/|\$$bunfs/root/cli\.js|^error: Unable to connect\.|^ *errno: 0,$$|^ *code: "ConnectionRefused"$$

help: ## List targets
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: ## Install root + frontend dependencies
	npm ci
	cd frontend && npm ci

build: ## Frontend production build (also what E2E serves)
	npm run build --prefix frontend

dev: ## Serve the built app + functions on :8788 against local D1 (foreground)
	$(WRANGLER) pages dev frontend/dist --port 8788 --persist-to .wrangler/state

format: ## Prettier --write, both stacks
	npm run format
	cd frontend && npx prettier --write "src/**/*.{js,jsx,json,css}"

format-check: ## Prettier --check, both stacks (what CI runs)
	npm run format:check
	cd frontend && npm run format:check

lint: ## ESLint, both stacks
	npm run lint
	cd frontend && npm run lint

lint-md: ## markdownlint across the docs we maintain (see .markdownlint-cli2.jsonc)
	npm run lint:md

# Each external linter FAILS with an install hint rather than skipping. A gate
# that quietly passes when its tool is absent is worse than no gate — that is
# exactly the failure `lint-md` had before it reached .PHONY.
#
# File lists use `--cached --others --exclude-standard`, not a bare
# `git ls-files`: the latter sees only TRACKED files, so a brand-new file you
# have not added yet — the one most likely to be wrong — would sail through the
# pre-commit gate unchecked. `--exclude-standard` still honours .gitignore, so
# node_modules and friends stay out.
lint-sh: ## shellcheck every tracked shell script
	@command -v shellcheck >/dev/null 2>&1 || { \
		echo "shellcheck not found. Install: brew install shellcheck"; exit 1; }
	git ls-files --cached --others --exclude-standard '*.sh' | xargs shellcheck

lint-yaml: ## yamllint every tracked YAML file (config: .yamllint)
	@command -v yamllint >/dev/null 2>&1 || { \
		echo "yamllint not found. Install: brew install yamllint"; exit 1; }
	git ls-files --cached --others --exclude-standard '*.yml' '*.yaml' | xargs yamllint

# archive/ is excluded: those migrations use `ALTER TABLE ... ADD COLUMN IF NOT
# EXISTS`, which SQLite does not support and sqlfluff cannot parse. They are
# archived and never applied, so fixing them buys nothing.
lint-sql: ## sqlfluff every tracked SQL file outside archive/ (config: .sqlfluff)
	@command -v sqlfluff >/dev/null 2>&1 || { \
		echo "sqlfluff not found. Install: brew install sqlfluff"; exit 1; }
	git ls-files --cached --others --exclude-standard '*.sql' | grep -v '^archive/' | xargs sqlfluff lint

# Validity, deliberately NOT formatting. Prettier on these files only explodes
# compact arrays past printWidth — churn on load-bearing files (_routes.json)
# for no defect caught. An unparseable file is the real failure, and
# ground-truth.json in particular has no code that reads it to fail loudly.
lint-json: ## assert every tracked JSON file parses
	@git ls-files --cached --others --exclude-standard '*.json' | while read -r f; do \
		node -e "JSON.parse(require('fs').readFileSync('$$f','utf8'))" \
			|| { echo "invalid JSON: $$f"; exit 1; }; \
	done

lint-all: lint lint-md lint-sh lint-yaml lint-sql lint-json ## every linter, all file types

test-backend: ## Backend unit tests (better-sqlite3; runs fine on Apple Silicon, a few seconds)
	npm test

test-frontend: ## Frontend unit tests
	cd frontend && npm test -- --run

test: test-backend test-frontend ## All unit tests

gate: format format-check lint-all test build ## FULL pre-commit gate — run before every commit

review: ## AI code review of this branch vs origin/main — run BEFORE opening a PR
	@command -v coderabbit >/dev/null 2>&1 || { \
		echo "coderabbit CLI not found. Install: brew install --cask coderabbit"; exit 1; }
	@coderabbit auth status >/dev/null 2>&1 || { \
		echo "Not signed in. Run: coderabbit auth login"; exit 1; }
	@# Refresh the remote ref first: the CLI compares against origin/main when
	@# local main has drifted, so a stale origin/main yields the wrong diff.
	@git fetch origin --quiet
	@out=$$(mktemp); coderabbit review --base main >"$$out" 2>&1; status=$$?; \
		grep -aivE '$(CR_NOISE)' "$$out" || true; rm -f "$$out"; exit $$status

review-wip: ## AI code review of uncommitted changes — run before committing
	@command -v coderabbit >/dev/null 2>&1 || { \
		echo "coderabbit CLI not found. Install: brew install --cask coderabbit"; exit 1; }
	@coderabbit auth status >/dev/null 2>&1 || { \
		echo "Not signed in. Run: coderabbit auth login"; exit 1; }
	@out=$$(mktemp); coderabbit review --type uncommitted >"$$out" 2>&1; status=$$?; \
		grep -aivE '$(CR_NOISE)' "$$out" || true; rm -f "$$out"; exit $$status

validate-openapi: ## Required when docs/api-spec.yaml changed
	npm run validate:openapi

schema-check: ## Required after touching migrations/ — regenerate + drift-check setup-complete.sql
	node scripts/regenerate-setup-complete.mjs
	node scripts/check-schema-drift.mjs

e2e-setup: build ## Init + seed an isolated local D1 for E2E (safe to re-run)
	rm -rf $(E2E_STATE)
	$(WRANGLER) d1 execute settimes-production-db --local --persist-to $(E2E_STATE) --file=database/setup-complete.sql
	$(WRANGLER) d1 execute settimes-production-db --local --persist-to $(E2E_STATE) --file=database/seed-test-data.sql
	SEED_SQL=$$(node scripts/seed-e2e-admin.mjs --email "$$E2E_ADMIN_EMAIL"); \
	$(WRANGLER) d1 execute settimes-production-db --local --persist-to $(E2E_STATE) --command="$$SEED_SQL"

e2e-serve: ## Start wrangler for E2E in the background (writes pidfile); retries boot once, never test failures (mirrors e2e-env action.yml, #625)
	try_boot() { \
		$(WRANGLER) pages dev frontend/dist --port 8788 --persist-to $(E2E_STATE) > $(E2E_STATE)/wrangler.log 2>&1 & \
		echo $$! > $(E2E_PID); \
		i=1; \
		while [ $$i -le 90 ]; do \
			kill -0 "$$(cat $(E2E_PID))" 2>/dev/null || { echo "wrangler process exited unexpectedly (attempt $$1)"; tail -20 $(E2E_STATE)/wrangler.log; return 1; }; \
			curl -s -o /dev/null http://localhost:8788/ && { echo "server ready on port 8788 (attempt $$1, $$((i*2))s)"; return 0; }; \
			[ $$((i % 10)) -eq 0 ] && { echo "--- wrangler log so far (attempt $$1, iteration $$i) ---"; tail -20 $(E2E_STATE)/wrangler.log; }; \
			i=$$((i+1)); sleep 2; \
		done; \
		echo "wrangler failed to start after 180s (attempt $$1)"; tail -20 $(E2E_STATE)/wrangler.log; return 1; \
	}; \
	try_boot 1 && exit 0; \
	kill "$$(cat $(E2E_PID))" 2>/dev/null || true; \
	for pid in $$(lsof -ti:8788 2>/dev/null); do kill -9 "$$pid" 2>/dev/null || true; done; \
	sleep 2; \
	try_boot 2 && exit 0; \
	echo "wrangler failed to start after 2 attempts"; exit 1

e2e-run: ## Run Playwright (server must be up; credentials required even for --list)
	ADMIN_EMAIL="$$E2E_ADMIN_EMAIL" ADMIN_PASSWORD="$$E2E_ADMIN_PASSWORD" npx playwright test $(SPEC) --reporter=list

e2e-clean: ## Kill the E2E server by pidfile and remove isolated state
	-[ -f $(E2E_PID) ] && kill $$(cat $(E2E_PID)) 2>/dev/null || true
	rm -rf $(E2E_STATE)

e2e: e2e-setup e2e-serve ## Full local E2E: setup, serve, run, always clean up
	ADMIN_EMAIL="$$E2E_ADMIN_EMAIL" ADMIN_PASSWORD="$$E2E_ADMIN_PASSWORD" npx playwright test $(SPEC) --reporter=list; \
	status=$$?; \
	$(MAKE) e2e-clean; \
	exit $$status

probe-links: ## Probe canonical bandcamp URLs for linkless bands (FILE=names.txt, newline-separated)
	node scripts/probe-band-links.mjs --file $(FILE)
