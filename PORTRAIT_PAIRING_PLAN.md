# Portrait pairing development

Development branch for upstream issue #514.

## Configuration

```yaml
wallpanel:
  portrait_pairing: true
  portrait_pairing_fit: contain       # contain | cover
```

Defaults:

- `portrait_pairing: false`
- `portrait_pairing_fit: contain`

## Pairing order

Pairing follows WallPanel's native `media_order`; there is no separate portrait ordering option.

- `media_order: random` uses random portrait partner selection.
- any non-random media order uses sequential adjacency: only the immediately following portrait can pair; an isolated portrait stays single.

## Random media order

`random` keeps the behavior validated during prototype testing:

- a portrait primary image gets a randomly selected portrait partner;
- the next portrait that WallPanel is about to show is avoided when possible, preventing the visible `A+B -> B+C` chain;
- the partner is preloaded while the next A/B container is still hidden, so the complete pair enters with the normal WallPanel crossfade;
- the WallPanel media list and index are not reordered.

## Non-random media order

`sequential` preserves the real WallPanel media order:

- only the immediately following media item may become the partner;
- if both adjacent items are portraits, they are displayed together and the right-hand partner's next standalone turn is consumed once;
- if the immediately following item is landscape, video, or otherwise unsuitable, the current portrait is shown normally as a single slide;
- no later portrait is pulled forward across intervening landscape images or videos.

Example input order:

```text
P1, landscape A, P2, P3, video B, P4
```

Sequential display:

```text
P1
landscape A
P2 + P3
video B
P4
```

## Pair fit

- `contain`: keeps the full portrait image visible and may leave bars inside each half.
- `cover`: fills each half completely and crops excess image area.

## Image information

Unpaired media keeps WallPanel's native `show_image_info` / `image_info_template` behavior.

For a portrait pair, one overlay is shown at the lower-left with two clearly marked entries:

```text
← <left image info>   → <right image info>
```

The existing WallPanel template is reused for both images. Video metadata behavior is intentionally left unchanged until it is verified separately on-device.

## Compatibility goal

The feature is opt-in and must not change existing WallPanel behavior while `portrait_pairing` is disabled.
