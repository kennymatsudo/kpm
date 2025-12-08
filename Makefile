
help:
	@echo "Available commands:"
install:


	npm run dev

db\:reset:
	rm -f ~/Library/Application\ Support/KPM\ -\ Planning\ Workbench/planner.db


# Build distributable app (DMG, installer, etc.)
	npm run build && npm run dist

# E2E tests (packages app first, then runs Playwright)
test\:e2e: package
	npx playwright test

test\:e2e\:ui: package
	npx playwright test --ui
