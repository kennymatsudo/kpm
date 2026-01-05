
help:
	@echo "Available commands:"

# Install all dependencies (run once after clone or adding new packages)
# Cleans native module builds first to avoid NODE_MODULE_VERSION mismatch
install:
	rm -rf node_modules/.cache
	rm -rf node_modules/better-sqlite3/build
	rm -rf node_modules/better-sqlite3/prebuilds


# Start dev server
	npm run dev

db\:reset:
	rm -f ~/Library/Application\ Support/KPM\ -\ Planning\ Workbench/planner.db
	@echo "Database reset. Restart the app."

package:

# Build distributable app (DMG, installer, etc.)
dist:
	npm run build && npm run dist

# E2E tests (packages app first, then runs Playwright)
test\:e2e: package
	npx playwright test

test\:e2e\:ui: package
	npx playwright test --ui
