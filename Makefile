
help:
	@echo "Available commands:"
install:

	npm run dev

	rm -f ~/Library/Application\ Support/KPM\ -\ Planning\ Workbench/planner.db


# Build distributable app (DMG, installer, etc.)
	npm run build && npm run dist

# E2E tests (packages app first, then runs Playwright)

