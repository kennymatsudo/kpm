
help:
	@echo "Available commands:"

# Install all dependencies (run once after clone or adding new packages)
install:


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
