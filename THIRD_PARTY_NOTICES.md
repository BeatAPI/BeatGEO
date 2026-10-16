# Third-party notices

BeatGEO is maintained by BeatAPI and incorporates the MIT-licensed Elmo codebase at `2f68b9199a236a4c3d1b5753cbf24f3f2bf088a1`, copyright 2026 Blue Whale Software, LLC. The original notice remains in LICENSE.md and Git history. BeatAPI additions are also provided under MIT.

Inherited statistics include share-of-voice and citation-stability calculations. The local metrics module reuses the same answer-level share-of-voice ratio.

[BeatBrowser](https://github.com/BeatAPI/BeatBrowser) is included as a pinned MIT dependency (`9aefd38bbd4e3fc7762751bcff57599fe8405588`); its original license and notices remain in the package. Its Chrome extension is copied locally during setup, with no separate product account or database.

Research references, not bundled complete products:

- [GeoScore](https://github.com/jianruntech/geo-score): audit and repeat-measurement methodology.
- [oneglanse](https://github.com/oneglanse/oneglanse): browser collection and citation extraction.
- [niubigeo](https://github.com/Albert-Weasker/niubigeo): confirmed planning and observation boundaries.
- [Ansvisor](https://github.com/ansvisor/ansvisor): opportunity-to-action workflow.

Geist and Lucide notices remain in `apps/browser-lab/public/assets/`. Dependency notices remain with packages. Historical changelogs and source documentation retain original attribution. Compatibility identifiers for existing ciphertext are not product branding.

The default local installer uses [embedded-postgres](https://github.com/leinelissen/embedded-postgres), pinned to `17.10.0-beta.17` (MIT wrapper; platform packages declare Apache-2.0). PostgreSQL and bundled native libraries retain their own notices in the dependency packages. The fixed-version installation scripts restore native library symlinks inside those packages; BeatGEO does not create operating-system users or install a system-wide database service.
