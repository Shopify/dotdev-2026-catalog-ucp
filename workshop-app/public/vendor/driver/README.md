# Vendored: driver.js

Vendored so the workshop lab stays fully offline — no CDN fetch at runtime.

- **Library:** [driver.js](https://github.com/kamranahmedse/driver.js) by Kamran Ahmed
- **Version:** 1.3.1
- **License:** MIT
- **Files:** `driver.js.iife.js` (global `window.driver.js.driver`), `driver.css`

## Update

```bash
curl -fsSL "https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.js.iife.js" -o driver.js.iife.js
curl -fsSL "https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.css" -o driver.css
```

Popover theming lives in `public/styles.css` under `.driver-popover.tb-tour`; tour steps live in `public/app.js` (`tourSteps`).
