# settimes.ca — canonical task runner for humans and agents.
# make propagates real exit codes; never wrap these in `cmd | tail` chains.
# E2E recipe mirrors .github/actions/e2e-env/action.yml.

SHELL := /bin/sh
WRANGLER := ./frontend/node_modules/.bin/wrangler
E2E_STATE := .wrangler/e2e-state
E2E_PID := .wrangler/e2e-state/wrangler.pid
E2E_ADMIN_EMAIL ?= e2e-admin@test.local
E2E_ADMIN_PASSWORD ?= e2e-test-password-Xk9

.PHONY: help install build dev format format-check lint test test-backend test-frontend \
	gate validate-openapi schema-check e2e e2e-setup e2e-serve e2e-run e2e-clean

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

test-backend: ## Backend unit tests (better-sqlite3; may DLOPEN-fail on some Apple Silicon — CI covers it)
	npm test

test-frontend: ## Frontend unit tests
	cd frontend && npm test -- --run

test: test-backend test-frontend ## All unit tests

gate: format format-check lint test build ## FULL pre-commit gate — run before every commit

validate-openapi: ## Required when docs/api-spec.yaml changed
	npm run validate:openapi

schema-check: ## Required after touching migrations/ — regenerate + drift-check setup-complete.sql
	node scripts/regenerate-setup-complete.mjs
	node scripts/check-schema-drift.mjs

e2e-setup: build ## Init + seed an isolated local D1 for E2E (safe to re-run)
	rm -rf $(E2E_STATE)
	$(WRANGLER) d1 execute settimes-production-db --local --persist-to $(E2E_STATE) --file=database/setup-complete.sql
	$(WRANGLER) d1 execute settimes-production-db --local --persist-to $(E2E_STATE) --file=database/seed-test-data.sql
	SEED_SQL=$$(node scripts/seed-e2e-admin.mjs --email "$(E2E_ADMIN_EMAIL)" --password "$(E2E_ADMIN_PASSWORD)"); \
	$(WRANGLER) d1 execute settimes-production-db --local --persist-to $(E2E_STATE) --command="$$SEED_SQL"

e2e-serve: ## Start wrangler for E2E in the background (writes pidfile)
	$(WRANGLER) pages dev frontend/dist --port 8788 --persist-to $(E2E_STATE) > $(E2E_STATE)/wrangler.log 2>&1 & \
	echo $$! > $(E2E_PID); \
	i=0; until curl -s -o /dev/null http://localhost:8788/ || [ $$i -ge 45 ]; do i=$$((i+1)); sleep 2; done; \
	curl -s -o /dev/null http://localhost:8788/ || { echo "wrangler failed to start; log:"; tail -20 $(E2E_STATE)/wrangler.log; exit 1; }

e2e-run: ## Run Playwright (server must be up; credentials required even for --list)
	ADMIN_EMAIL="$(E2E_ADMIN_EMAIL)" ADMIN_PASSWORD="$(E2E_ADMIN_PASSWORD)" npx playwright test $(SPEC) --reporter=list

e2e-clean: ## Kill the E2E server by pidfile and remove isolated state
	-[ -f $(E2E_PID) ] && kill $$(cat $(E2E_PID)) 2>/dev/null || true
	rm -rf $(E2E_STATE)

e2e: e2e-setup e2e-serve ## Full local E2E: setup, serve, run, always clean up
	ADMIN_EMAIL="$(E2E_ADMIN_EMAIL)" ADMIN_PASSWORD="$(E2E_ADMIN_PASSWORD)" npx playwright test $(SPEC) --reporter=list; \
	status=$$?; \
	$(MAKE) e2e-clean; \
	exit $$status
