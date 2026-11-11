# Test assets (real photos, held-out test split)

Three photos from the **test split** of the Mendeley dataset *Floating Waste and Aquatic Vegetation Image Dataset
from Turbid Rivers* v2 (DOI 10.17632/j26w4m645z.2, CC BY 4.0 — credits in `ai/ATTRIBUTION.md`), downscaled to
1280 px. None was used to train the detector. Labels are the authors' YOLO boxes (class 0 = floating waste,
1 = river vegetation).

| File | Original | Use in tests |
|---|---|---|
| `scene_a_before.jpg` | `IMG_6182_frame_00004.jpg` | "before" photo with waste |
| `scene_a_later.jpg` | `IMG_6182_frame_00005.jpg` | a later frame of the same scene; tests erase its labelled waste to simulate a cleanup |
| `other_place.jpg` | `FOTO_0002.jpg` | a different place |
