Generate a game asset image using the Nano Banana MCP (Google Gemini).

Usage: /generate-asset <description of the asset>

1. Take the user's description and craft an image generation prompt optimized for game assets:
   - Specify "2D game asset, transparent background, pixel art style" unless the user specifies otherwise
   - Include relevant Small World theming (fantasy races, terrain types, etc.)
2. Use the Nano Banana MCP `generate_image` tool to create the image
3. Save the generated image to `src/assets/generated/` with a descriptive filename
4. Display the generated image for review
5. Ask if the user wants to regenerate with different parameters

The argument after the command is the asset description.
