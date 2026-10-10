# Matchmaker color system

The existing global CSS and shared components serve every implemented page. Brand changes are centralized in `src/design/tokens.css`; theme switching continues to use the existing `data-theme` attribute and system preference.

| Role | Brand color | Application |
| --- | --- | --- |
| Primary | Coral `#FE3C72`, hover `#E92F65`, light `#FFF0F4` | Primary calls to action, current navigation, selected workflow steps, factor bars |
| Secondary | Purple `#8055E8`, hover `#6D42D3`, light `#F2EAFE` | Chat responses, social badges, compatibility rings, completeness indicators and focus |
| Premium | Yellow `#FFC629`, light `#FFF6D8` | Reserved premium/special highlights; `badge-premium` styling is available, with no invented membership product or generic yellow status badges |
| Success / error | Green `#22A06B` / red `#D92D45` | Semantic status, with readable text variants; labels/icons remain the status evidence |

Light surfaces use `#FAF9FC`, white and `#F5F3F8`, with `#191622` text and `#716B7D` muted text. Dark surfaces use `#15121C`, `#201B29` and `#292333`, with `#F8F6FC` and `#B8B0C5`. Brand primitives stay stable; dark soft backgrounds and readable semantic foregrounds adapt. Subtle borders use the requested `#E9E5EE` / `#393144`; stronger control borders remain distinct from decorative separators.

Bright coral cannot support small white text at WCAG AA. Primary gradients therefore use near-black `--on-primary` text, including hover/pressed states. Inline coral/purple/green text uses separately tuned `--primary-text`, `--secondary-text` and `--success-text` rather than decorative primitives. Danger buttons use white text on the deeper error color. Native checks use purple for readable checks. Pair foregrounds with their intended surface; do not assume a raw brand swatch is safe for small text.

The coral-to-peach gradient is restricted to primary actions; soft radial coral/purple highlights frame setup/login. Cards, administrative workflows and dialogs retain solid semantic surfaces. Rounded corners, subtle shadows, explicit disabled colors, visible focus rings and existing reduced-motion rules are shared across the application. No new landing page, public signup, like/pass behavior, subscription system or route is introduced by this visual change.

## Verification — 10 October 2026

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm run build` | Passed after the final CSS adjustment |
| `npm test` | 138 passed, zero failed/skipped |
| `npm run test:e2e` | 39 passed, zero failed/skipped, 6.6 minutes |
| Automated accessibility | Zero axe violations across 56 route/theme/viewport combinations at 1440, 768, 390 and 320 pixels; additional editor, review-dialog and saved-chat scans passed |
| Separate anonymous login checks | Light/dark axe scans passed; rendered coral default/hover gradients and near-black labels confirmed |
| CSS token references | No undefined tokens |

Calculated primary-button text contrast is at least 4.83:1 across the specified gradient endpoints, hover and pressed fills. Readable semantic text variants meet AA on their intended surfaces; muted chat metadata uses the purple foreground on pale purple surfaces. Screenshots of both login themes, the mobile light dashboard and the desktop dark dashboard were visually inspected. Existing browser checks also verify keyboard focus, reduced motion, theme persistence, overflow and core functionality. Automated axe is not full manual accessibility certification.

Tests use synthetic temporary databases and disabled/mocked providers. No backend, API, route, authentication, data model, business rule, dependency or legacy project file was changed. The Stage 10 snapshot checker is tied to that historical empty-database baseline and is not a valid current-data comparison after operator activity; its expected count mismatch does not justify resetting user data. Existing operational prerequisites documented in the Stage 10 report remain outside this color change.
