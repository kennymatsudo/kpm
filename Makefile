.PHONY: help dev up start check app db db\:reset install package dist test\:e2e test\:e2e\:dev test\:e2e\:ui screenshots screenshots\:dev release-notes release\:patch release\:minor release\:major

help:
	@echo "Available commands:"
	@echo "  make install        Install all dependencies (run once after clone)"
	@echo "  make dev            Start dev server"
	@echo "  make up             Alias for make dev"
	@echo "  make app            Build the app and install it to /Applications (macOS)"
	@echo "  make start          Run production build"
	@echo "  make check          Typecheck + lint + unit tests"
	@echo "  make db             Open the local database in sqlite3"
	@echo "  make db:reset       Delete local database (for schema changes)"
	@echo "  make package        Build and package Electron app (directory only)"
	@echo "  make dist           Build distributable app (DMG, installer, etc.)"
	@echo "  make test:e2e       Run Playwright E2E tests (packages app first)"
	@echo "  make test:e2e:dev   Run E2E tests against the existing package (skips rebuild)"
	@echo "  make test:e2e:ui    Run E2E tests with interactive UI"
	@echo "  make screenshots    Regenerate README screenshots in docs/images (packages app first)"
	@echo "  make screenshots:dev  Regenerate screenshots against the existing package"
	@echo "  make release-notes  Generate release notes from commits using Claude"
	@echo "  make release:patch  Release patch version (0.1.0 → 0.1.1)"
	@echo "  make release:minor  Release minor version (0.1.0 → 0.2.0)"
	@echo "  make release:major  Release major version (0.1.0 → 1.0.0)"

# Install all dependencies (run once after clone or adding new packages)
# Cleans native module builds first to avoid NODE_MODULE_VERSION mismatch
install:
	rm -rf node_modules/.cache
	rm -rf node_modules/better-sqlite3/build
	rm -rf node_modules/better-sqlite3/prebuilds
	CPPFLAGS="" npm install
	git config core.hooksPath .githooks
	@touch node_modules/.install-stamp

# Reinstall (which rebuilds native modules against the current Electron ABI)
# only when the lockfile changed since the last install. Lets targets depend on
# this to self-heal after a pull that bumps deps, without paying the install
# cost when nothing changed.
node_modules/.install-stamp: package-lock.json
	@$(MAKE) install


# Start dev server (reinstalls first if dependencies changed)
dev: node_modules/.install-stamp
	npm run dev

# Alias for `make dev`
up: dev

# Build and run production build
start:
	npm run build && npm run start

# Typecheck + lint + unit tests (same gate as the pre-commit hook plus tests)
check:
	npm run check

# Open the local database in an interactive sqlite3 shell
db:
	sqlite3 ~/Library/Application\ Support/KPM\ -\ Planning\ Workbench/planner.db

db\:reset:
	rm -f ~/Library/Application\ Support/KPM\ -\ Planning\ Workbench/planner.db
	@echo "Database reset. Restart the app."

# Build Electron app with electron-vite then package with electron-builder (directory only).
# CSC_IDENTITY_AUTO_DISCOVERY=false skips keychain certificate lookup so builds
# are reproducibly ad-hoc signed — no Apple Developer account needed.
package:
	npm run build && CSC_IDENTITY_AUTO_DISCOVERY=false npm run package

# Build the app and install it into /Applications (macOS).
# Locally built apps are never quarantined, so Gatekeeper does not require
# signing or notarization. Reinstalling replaces the previous copy; the first
# tracker-credential access after an update re-prompts for keychain approval.
app: package
	rm -rf "/Applications/KPM - Planning Workbench.app"
	ditto "release/mac-arm64/KPM - Planning Workbench.app" "/Applications/KPM - Planning Workbench.app"
	@echo "Installed /Applications/KPM - Planning Workbench.app"

# Build distributable app (DMG, installer, etc.)
dist:
	npm run build && npm run dist

# E2E tests (packages app first, then runs Playwright)
test\:e2e: package
	npx playwright test

# Re-run E2E against the already-packaged app (use while iterating on spec files)
test\:e2e\:dev:
	npx playwright test

test\:e2e\:ui: package
	npx playwright test --ui

# README screenshots (seeds a demo project, captures plan views to docs/images/)
screenshots: package
	KPM_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts

screenshots\:dev:
	KPM_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts

# Release commands - bump version, commit, tag, and push.
# Tags mark source releases only — no binaries are built or published.

# Generate release notes from commits since last tag using Claude
# Can be run standalone with: make release-notes
release-notes:
	@echo "Generating release notes with Claude..."
	@LAST_TAG=$$(git describe --tags --abbrev=0 2>/dev/null || echo ""); \
	if [ -z "$$LAST_TAG" ]; then \
		COMMITS=$$(git log --reverse --pretty=format:"%s" -20); \
	else \
		COMMITS=$$(git log --reverse $$LAST_TAG..HEAD --pretty=format:"%s" | grep -v "^Update release notes$$" | grep -v "^[0-9]\+\.[0-9]\+\.[0-9]\+$$"); \
	fi; \
	if [ -z "$$COMMITS" ]; then \
		echo "No commits found since $$LAST_TAG"; \
		exit 1; \
	fi; \
	echo "Commits since $$LAST_TAG (oldest first):"; \
	echo "$$COMMITS"; \
	echo ""; \
	echo "$$COMMITS" | claude --model claude-opus-4-7 -p "Write release notes for these commits. The commits are listed oldest to newest, so later commits override earlier ones. Output ONLY the markdown body with no preamble or commentary. Reflect the NET final state only: if a feature was added and later removed, omit it entirely; if a name or label changed multiple times, keep only the final version; if a behavior was changed and then reverted, drop both. Include only user-facing changes; exclude tests, refactors, internal cleanup, dependency bumps, CI, docs, and architecture changes. Use these section headers in this order, skipping empty ones: ## New, ## Improved, ## Fixed, ## Removed. One concise bullet per change; merge related commits into a single bullet; lead with a strong verb matching the section; no commit hashes, no sub-bullets, no trailing periods. Aim for the shortest phrasing that stays clear." > release-notes.md
	@echo ""
	@echo "=== Generated release-notes.md ==="
	@cat release-notes.md

release\:patch: release-notes
	@echo ""
	@read -p "Proceed with patch release? [y/N] " confirm && [ "$$confirm" = "y" ] || (echo "Release cancelled."; exit 1)
	git add release-notes.md
	git commit -m "Update release notes"
	npm version patch
	git push && git push --tags

release\:minor: release-notes
	@echo ""
	@read -p "Proceed with minor release? [y/N] " confirm && [ "$$confirm" = "y" ] || (echo "Release cancelled."; exit 1)
	git add release-notes.md
	git commit -m "Update release notes"
	npm version minor
	git push && git push --tags

release\:major: release-notes
	@echo ""
	@read -p "Proceed with major release? [y/N] " confirm && [ "$$confirm" = "y" ] || (echo "Release cancelled."; exit 1)
	git add release-notes.md
	git commit -m "Update release notes"
	npm version major
	git push && git push --tags
