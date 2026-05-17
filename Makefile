SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help setup dev dev_stop test lint typecheck security build deploy

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

setup: ## Install deps for API and web
	./scripts/setup.sh

dev: ## Start web app and API (keeps running)
	./scripts/dev.sh

dev_stop: ## Stop leftover local dev processes
	./scripts/dev_stop.sh

test: ## Run API tests
	cd apps/api && npx vitest run

lint: ## Run linters
	cd apps/api && npx eslint src tests || true
	cd apps/web && npx eslint pages components lib || true

typecheck: ## Run type checks
	cd apps/api && npx tsc --noEmit
	cd apps/web && npx tsc --noEmit

security: ## Run secret scan
	python3 ./scripts/check_secrets.py

build: ## Build and push per-service Docker images for Cloud Run
	$(eval SLUG := $(shell python3 -c "import re,sys; m=re.search(r'slug:\s*\"?([^\n\"]+)',open('APP_MANIFEST.yaml').read()); print(m.group(1).strip()) if m else print('pdf-checker')"))
	$(eval REGION := $(shell python3 -c "import re,sys; m=re.search(r'region:\s*\"?([^\n\"]+)',open('APP_MANIFEST.yaml').read()); print(m.group(1).strip()) if m else print('us-central1')"))
	$(eval REPO := $(shell python3 -c "import re,sys; m=re.search(r'artifact_registry_repo:\s*\"?([^\n\"]+)',open('APP_MANIFEST.yaml').read()); print(m.group(1).strip()) if m else print('apps')"))
	$(eval PROJECT := $(shell gcloud config get-value project 2>/dev/null))
	$(eval REGISTRY := $(REGION)-docker.pkg.dev/$(PROJECT)/$(REPO))
	docker build --platform linux/amd64 -f apps/api/Dockerfile -t $(REGISTRY)/$(SLUG)-api:latest .
	docker build --platform linux/amd64 -f apps/web/Dockerfile -t $(REGISTRY)/$(SLUG)-web:latest .
	docker push $(REGISTRY)/$(SLUG)-api:latest
	docker push $(REGISTRY)/$(SLUG)-web:latest

deploy: ## Print deploy env and point at the bootstrap-generated templates
	./scripts/gcp_print_env.sh
	@echo ""
	@echo "Deploy templates are printed by the bootstrap script after it"
	@echo "provisions the IAP + internal-only networking. See ARCHITECTURE.md."
	@echo "Run: ./scripts/gcp_bootstrap.sh --project tar-012f42959395"
	@echo ""
	@echo "Never deploy the web or api Cloud Run services with --allow-unauthenticated"
	@echo "or --ingress=all — that breaks the IAP security boundary."
