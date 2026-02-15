Capture a screenshot of the running game for visual QA.

1. Use Puppeteer MCP to navigate to `http://localhost:5173`
2. Wait for the Phaser canvas to render (wait for `canvas` element)
3. Take a full-page screenshot
4. Save to `screenshots/` directory with timestamp filename (e.g., `screenshot-2024-01-15-143022.png`)
5. Display the screenshot for visual review
6. Report any visual issues observed

If the dev server is not running, start it first with `/preview`.
