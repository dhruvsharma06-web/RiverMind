# Data and model attribution

Raw training images are **not** stored in this repository (`data/` and `eval/raw/` are git-ignored). Only the
trained weights and these credits are published.

## Training data

**Floating Waste and Aquatic Vegetation Image Dataset from Turbid Rivers**, version 2 (Mendeley Data, published
9 Sep 2026). DOI [10.17632/j26w4m645z.2](https://doi.org/10.17632/j26w4m645z.2).
Authors: Iphan F Radam, yus lena, Muhammad Ryan Rizky Rahmadi, Muhammad Alkaff, Irham Maulani Abdul Gani,
Mohammad Zaki Firmansah, Natalie Grace Katiandagho, Zainil Musthofa Radam, Fatih Alfayruz, Nashry Akbar
(Lambung Mangkurat University).
Licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Changes we made (in `ai/tools/train_detector.ipynb`): class names mapped to our contract classes
(`floating_waste` → `other`, `river_vegetation` → `vegetation`); 4 photos carrying an EXIF rotation tag left out;
photos wider or taller than 1920 px downscaled. Labels and splits are otherwise the authors' own.

**River Trash final**, version 2 (Roboflow Universe, workspace `trisha-lingat-m9vjl`, by Trisha Lingat).
<https://universe.roboflow.com/trisha-lingat-m9vjl/river-trash-final-k9997/dataset/2>.
Licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Changes we made (in `ai/tools/train_detector_v2.ipynb`): classes mapped to ours (`plastic-bottle` → `bottle`,
`plastic-bag` → `bag`, `cardboard` / `clustered-trash` / `cup` / `metal-can` / `plastic-container` / `styrofoam` →
`other`, `branch` → `vegetation`); `oil-spil` boxes removed. We also used a model trained on it to try to relabel the
Mendeley "floating waste" boxes as bottle/bag (it changed 1 box).

## Pretrained models

- **YOLO11n** (starting weights for fine-tuning) — Ultralytics, AGPL-3.0.
- **YOLO-World v2, `yolov8s-worldv2`** (zero-shot baseline for comparison only, not shipped) — Ultralytics, AGPL-3.0.
