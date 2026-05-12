#!/usr/bin/env python3
import base64
import json
import os
from pathlib import Path

from openai import OpenAI


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "generated"
OUT.mkdir(parents=True, exist_ok=True)


GAME_BRIEF = """
Create a compact static browser game for an OpenAI DevDay 2026 submission.

Requirements:
- The game must be playable in one browser tab and publishable on GitHub Pages.
- Theme: a night run through San Francisco to deliver an early DevDay ticket.
- The player collects three signal fragments: GPT, Image, Ship.
- Keep visible copy short and specific.
- Output JSON only with keys:
  title, tagline, intro, win, lose, fragments, palette, background_prompt, atlas_prompt.
- fragments must be an array of three short labels.
- palette must include bg, ink, accent, danger, signal.
- background_prompt and atlas_prompt are prompts for GPT Image. No copyrighted characters,
  no OpenAI logo, no real event branding beyond the words "DevDay" in app UI.
"""


def response_text(response) -> str:
    if hasattr(response, "output_text") and response.output_text:
        return response.output_text
    parts = []
    for item in getattr(response, "output", []) or []:
        for content in getattr(item, "content", []) or []:
            text = getattr(content, "text", None)
            if text:
                parts.append(text)
    return "\n".join(parts)


def generate_design(client: OpenAI) -> dict:
    response = client.responses.create(
        model="gpt-5.5",
        reasoning={"effort": "low"},
        input=[
            {
                "role": "system",
                "content": "You design concise browser-game creative specs. Return valid JSON only.",
            },
            {"role": "user", "content": GAME_BRIEF.strip()},
        ],
    )
    raw = response_text(response).strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw.removeprefix("json").strip()
    return json.loads(raw)


def generate_image(client: OpenAI, prompt: str, size: str, output: Path) -> None:
    result = client.images.generate(
        model="gpt-image-1",
        prompt=prompt,
        size=size,
        quality="low",
    )
    image_b64 = result.data[0].b64_json
    output.write_bytes(base64.b64decode(image_b64))


def main() -> None:
    if not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit("OPENAI_API_KEY is required")

    client = OpenAI()
    design = generate_design(client)

    background_prompt = (
        design["background_prompt"]
        + " Render as a crisp 16:9 game background, no text, no logos, no UI, "
        + "high contrast lanes and landmarks, suitable for canvas gameplay."
    )
    atlas_prompt = (
        design["atlas_prompt"]
        + " Create a clean 2x2 sprite atlas on a transparent-looking plain dark background: "
        + "top-left courier badge/player, top-right signal fragment collectible, "
        + "bottom-left fog/hazard, bottom-right glowing portal/checkpoint. "
        + "No text, no logos, centered objects, strong silhouettes."
    )

    generate_image(client, background_prompt, "1536x1024", OUT / "background.png")
    generate_image(client, atlas_prompt, "1024x1024", OUT / "atlas.png")

    generation = {
        "models": {
            "game_design": "gpt-5.5",
            "image_generation": "gpt-image-1",
        },
        "design": design,
        "image_prompts": {
            "background": background_prompt,
            "atlas": atlas_prompt,
        },
    }
    (OUT / "generation.json").write_text(json.dumps(generation, indent=2) + "\n", encoding="utf-8")
    print("Wrote generated game design and assets to", OUT)


if __name__ == "__main__":
    main()
