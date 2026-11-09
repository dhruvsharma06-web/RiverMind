# Fixture images (Dhruv, S0.5)

Add these 4 photos — **our own photos only**, each under 300 KB, no faces, EXIF stripped:

| File | What it shows | Mock expectation |
|---|---|---|
| `waste.jpg` | water with visible floating plastic | mock `waste_score >= 0.5` |
| `clean.jpg` | clear water surface | mock `waste_score < 0.5` |
| `before.jpg` | a spot with litter | used as proof "before" |
| `after.jpg` | the SAME spot, litter removed (same framing) | Hamming(before, after) >= 3 |

Tip: a tray of water with a few bottle caps and wrappers works; take `before.jpg`, remove them, take `after.jpg` from the same spot.
