# Liquid Glass in the College Memory archive

The site uses static RTL HTML, CSS and JavaScript. Cloudflare Pages Functions handle routes and authentication, D1 stores the archive, and R2 serves media. The material belongs on navigation, filters, search, sheets and photo controls. The photo collage, Arabic typography, gallery cards and administration tables retain their own content surfaces. This follows Apple's emphasis on separation, legibility and localized tinting. [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

## Evaluation

| Project | Optics and Safari behavior | Trade-off for this archive |
| --- | --- | --- |
| [sohumsuthar/liquid-glass](https://github.com/sohumsuthar/liquid-glass) | Calibrated lens profile, measured rim, and SVG displacement of the live backdrop in Chromium. Safari and Firefox use its blur path. | A useful reference for lens geometry and keeping displacement to a few surfaces. Integrating the React component and its quality controls would add a framework. |
| [nikdelvin/liquid-glass](https://github.com/nikdelvin/liquid-glass) | SVG displacement and separated color channels in its effect path, with a documented Safari blur fallback. | Its Astro components and preset textures fit a standalone demo. The archive needs size-aware geometry and its existing semantic HTML controls. |
| [simple-liquid-glass](https://github.com/lucaperullo/simple-liquid-glass) | A framework-free web component is available. Its Safari and Firefox WebGL modes require an explicit source. A broader DOM source entails capture and refresh work. | Closest drop-in candidate. The photo viewer already has a single image that can be sampled directly, so the archive avoids shipping the HTML capture engine. |
| [Liquid Glass for Web](https://liquidglass.theatom.lk/docs) | A broad control kit with springs and keyboard patterns. Its docs describe native Chromium refraction, with localized copies or translucent bars on WebKit and Gecko. | Useful interaction reference. React peers and a parallel component system would duplicate the archive's existing buttons, range inputs, dialogs and form state. |
| [samasante/liquid-glass](https://github.com/samasante/liquid-glass) | Wraps a known source with an SVG filter across engines and supports a WebGL path for media. Its browser notes distinguish this from refracting arbitrary content behind a fixed element. | A strong reference for explicit-source lenses. Wrapping and duplicating the archive's live page to supply the header would add rendering and maintenance costs. |

The archive uses a small dependency-free hybrid. A single resize-cached displacement map bends the real desktop Chromium header backdrop. The viewer's WebGL toolbar samples the displayed photo on demand, with edge displacement, separated RGB samples and a directional rim highlight. It does not rasterize the page. Safari and Firefox use translucent CSS material on general navigation and can use the photo lens when WebGL is available.

## Using the material

- Import `assets/liquid-glass.css` for the brand, theme, and material tokens. Use `glass-surface` for a toolbar or popover, and `glass-on-media` where the surface needs a dark tint over photos.
- Use `glass-button`, `glass-icon`, `glass-field`, `glass-switch` and `glass-range` on their native elements. Keep their labels and existing input state. Reserve `glass-button--gold` and `glass-button--teal` for actions that need emphasis.
- Load `assets/liquid-glass.js` on pages with optics. `data-glass-backdrop` opts a capsule into native backdrop refraction. `data-glass-photo="image-id"` samples a same-origin image in the same dialog. `data-glass-segments` positions an existing `.glass-selection` on the pressed button and enables RTL arrow-key navigation.
- Material strength follows the system theme. Reduced transparency, increased contrast, and forced colors select opaque surfaces; reduced motion removes spring transitions. The optical layer is decorative and does not receive focus or intercept clicks.
