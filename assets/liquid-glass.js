(() => {
  const opaque = matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)');
  const svgNamespace = 'http://www.w3.org/2000/svg';

  function svgNode(name, attributes) {
    const node = document.createElementNS(svgNamespace, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }

  // A capsule samples inward along its surface normal. The center of the
  // capsule is neutral, so text and other detail behind the glass stay legible.
  function capsuleMap(width, height, bezel) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * .7);
    canvas.height = Math.ceil(height * .85);
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    const map = ctx.createImageData(canvas.width, canvas.height);
    const radius = height / 2;
    let index = 0;
    for (let y = 0; y < canvas.height; y++) {
      const dy = (y + .5) * height / canvas.height - radius;
      for (let x = 0; x < canvas.width; x++) {
        const px = (x + .5) * width / canvas.width;
        const dx = px - Math.max(radius, Math.min(width - radius, px));
        const length = Math.hypot(dx, dy);
        const rim = Math.max(0, Math.min(1, 1 - (radius - length) / bezel));
        const offset = length ? 115 * rim * rim / length : 0;
        map.data[index++] = 128 - dx * offset;
        map.data[index++] = 128 - dy * offset;
        map.data[index++] = 128;
        map.data[index++] = 255;
      }
    }
    ctx.putImageData(map, 0, 0);
    return canvas.toDataURL();
  }

  function attachBackdropLens(surface, index) {
    // Several engines parse URL filters on backdrops without rendering them.
    // Limit this enhancement to fine-pointer Chromium. The CSS material is universal.
    const fine = matchMedia('(pointer: fine)');
    if (!/\b(?:HeadlessChrome|Chrome|Chromium|Edg)\//.test(navigator.userAgent) ||
        !CSS.supports('backdrop-filter', 'url(#glass-backdrop-0)')) return;

    const id = 'glass-backdrop-' + index;
    const root = svgNode('svg', { width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' });
    root.style.position = 'absolute';
    const filter = svgNode('filter', {
      id, x: 0, y: 0, width: '100%', height: '100%',
      filterUnits: 'objectBoundingBox', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB'
    });
    const texture = svgNode('feImage', { x: 0, y: 0, preserveAspectRatio: 'none', result: 'capsule' });
    const bend = svgNode('feDisplacementMap', { in: 'SourceGraphic', in2: 'capsule', xChannelSelector: 'R', yChannelSelector: 'G' });
    filter.append(texture, bend);
    root.append(filter);
    document.body.append(root);
    surface.style.setProperty('--glass-refraction', `url(#${id})`);

    let size = '';
    let frame = 0;
    function update() {
      frame = 0;
      const width = surface.clientWidth;
      const height = surface.clientHeight;
      if (opaque.matches || !fine.matches || width <= height || height < 12) {
        delete surface.dataset.optics;
        return;
      }
      const geometry = width + 'x' + height;
      if (geometry !== size) {
        const bezel = Math.min(14, height * .22);
        const image = capsuleMap(width, height, bezel);
        if (!image) return;
        texture.setAttribute('href', image);
        texture.setAttribute('width', width);
        texture.setAttribute('height', height);
        bend.setAttribute('scale', bezel * 1.55);
        size = geometry;
      }
      surface.dataset.optics = 'svg';
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(surface);
    else window.addEventListener('resize', schedule, { passive: true });
    opaque.addEventListener('change', schedule);
    fine.addEventListener('change', schedule);
    schedule();
  }

  const vertex = `
    attribute vec2 corner;
    varying vec2 uv;
    void main() {
      uv = corner * .5 + .5;
      gl_Position = vec4(corner, 0., 1.);
    }`;
  const fragment = `
    precision mediump float;
    varying vec2 uv;
    uniform vec2 pane;
    uniform vec4 imageBounds;
    uniform sampler2D backdrop;

    vec3 photoAt(vec2 point) {
      vec2 tex = (point - imageBounds.xy) / imageBounds.zw;
      if (tex.x < 0. || tex.y < 0. || tex.x > 1. || tex.y > 1.) {
        return vec3(.043, .125, .20);
      }
      return texture2D(backdrop, tex).rgb;
    }

    void main() {
      vec2 p = vec2(uv.x, 1. - uv.y) * pane;
      float radius = pane.y * .5;
      vec2 q = p - pane * .5;
      q.x -= clamp(q.x, radius - pane.x * .5, pane.x * .5 - radius);
      float distance = length(q);
      float edge = radius - distance;
      if (edge < 0.) discard;
      vec2 normal = q / max(distance, .001);
      float rim = 1. - smoothstep(0., 13., edge);
      vec2 bent = p - normal * (rim * rim * 9.);
      float fringe = rim * .72;
      vec3 color = vec3(
        photoAt(bent + normal * fringe).r,
        photoAt(bent).g,
        photoAt(bent - normal * fringe).b
      );
      float light = pow(max(dot(normal, vec2(-.44, -.9)), 0.), 3.);
      float sheen = light * (1. - smoothstep(.3, 3.2, edge));
      gl_FragColor = vec4(mix(color, vec3(.93, .97, 1.), sheen * .27), smoothstep(0., 1., edge));
    }`;

  function makePhotoRenderer(gl) {
    function shader(type, source) {
      const result = gl.createShader(type);
      gl.shaderSource(result, source);
      gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error('Glass shader unavailable');
      return result;
    }
    const program = gl.createProgram();
    const shaders = [shader(gl.VERTEX_SHADER, vertex), shader(gl.FRAGMENT_SHADER, fragment)];
    for (const part of shaders) gl.attachShader(program, part);
    gl.linkProgram(program);
    for (const part of shaders) gl.deleteShader(part);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Glass program unavailable');
    gl.useProgram(program);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, 'corner');
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, 'backdrop'), 0);
    const pane = gl.getUniformLocation(program, 'pane');
    const bounds = gl.getUniformLocation(program, 'imageBounds');
    const buffer = document.createElement('canvas');
    let previousSource = '';

    return (image, photo, surface) => {
      if (image.currentSrc !== previousSource) {
        // Use a bounded texture even when the source is a full-resolution upload.
        const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
        buffer.width = Math.max(1, Math.round(image.naturalWidth * scale));
        buffer.height = Math.max(1, Math.round(image.naturalHeight * scale));
        buffer.getContext('2d').drawImage(image, 0, 0, buffer.width, buffer.height);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Glass texture unavailable');
        previousSource = image.currentSrc;
        buffer.width = buffer.height = 1;
      }
      const pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
      const width = Math.round(surface.width * pixelRatio);
      const height = Math.round(surface.height * pixelRatio);
      if (gl.canvas.width !== width || gl.canvas.height !== height) {
        gl.canvas.width = width;
        gl.canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.uniform2f(pane, surface.width, surface.height);
      gl.uniform4f(bounds, photo.left - surface.left, photo.top - surface.top, photo.width, photo.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
  }

  function attachPhotoLens(surface) {
    const image = document.getElementById(surface.dataset.glassPhoto);
    const dialog = surface.closest('dialog');
    if (!image || !dialog) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'glass-optical-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    surface.prepend(canvas);

    let draw;
    let failed = false;
    let frame = 0;
    function update() {
      frame = 0;
      if (failed || opaque.matches || !dialog.open || document.hidden || !image.complete || !image.naturalWidth) {
        delete surface.dataset.optics;
        return;
      }
      const rectangle = surface.getBoundingClientRect();
      const photo = image.getBoundingClientRect();
      if (rectangle.height < 1 || rectangle.width < rectangle.height || photo.width < 1 || photo.height < 1) return;
      try {
        if (!draw) {
          const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, powerPreference: 'low-power' });
          if (!gl) throw new Error('WebGL unavailable');
          draw = makePhotoRenderer(gl);
        }
        draw(image, photo, rectangle);
        surface.dataset.optics = 'webgl';
      } catch {
        failed = true;
        delete surface.dataset.optics;
      }
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    image.addEventListener('load', schedule);
    image.addEventListener('error', schedule);
    opaque.addEventListener('change', schedule);
    document.addEventListener('visibilitychange', schedule);
    new MutationObserver(schedule).observe(dialog, { attributes: true, attributeFilter: ['open'] });
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(schedule);
      observer.observe(image);
      observer.observe(surface);
    } else window.addEventListener('resize', schedule, { passive: true });
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      delete surface.dataset.optics;
      draw = null;
      failed = true;
    });
    canvas.addEventListener('webglcontextrestored', () => { failed = false; schedule(); });
  }

  function attachSegments(group) {
    function position() {
      const selected = group.querySelector('button[aria-pressed="true"]');
      if (!selected?.offsetWidth) return;
      group.style.setProperty('--glass-selection-width', selected.offsetWidth + 'px');
      group.style.setProperty('--glass-selection-x', selected.offsetLeft + 'px');
      group.setAttribute('data-indicator', '');
    }
    group.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const choices = [...group.querySelectorAll('button[aria-pressed]:not(:disabled)')];
      const current = choices.indexOf(event.target);
      if (current < 0) return;
      const rtl = getComputedStyle(group).direction === 'rtl';
      const step = (event.key === 'ArrowRight') === rtl ? -1 : 1;
      let next = (current + step + choices.length) % choices.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = choices.length - 1;
      event.preventDefault();
      choices[next].focus();
      choices[next].click();
    });
    new MutationObserver(position).observe(group, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
    if ('ResizeObserver' in window) new ResizeObserver(position).observe(group);
    else window.addEventListener('resize', position, { passive: true });
    document.fonts?.ready.then(position);
    position();
  }

  const header = document.querySelector('[data-glass-header]');
  const hero = document.querySelector('.hero-glow');
  if (header && hero) {
    let frame = 0;
    function tone() {
      frame = 0;
      const { top, height } = header.getBoundingClientRect();
      header.toggleAttribute('data-on-hero', hero.getBoundingClientRect().bottom > top + height * .55);
      header.toggleAttribute('data-scrolled', window.scrollY > 20);
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(tone); };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    tone();
  }

  for (const disclosure of document.querySelectorAll('.glass-disclosure')) {
    const summary = disclosure.querySelector('summary');
    disclosure.addEventListener('click', event => {
      if (event.target.closest('a')) disclosure.open = false;
    });
    document.addEventListener('pointerdown', event => {
      if (disclosure.open && !disclosure.contains(event.target)) disclosure.open = false;
    });
    disclosure.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !disclosure.open) return;
      event.preventDefault();
      disclosure.open = false;
      summary.focus();
    });
  }

  document.querySelectorAll('[data-glass-backdrop]').forEach(attachBackdropLens);
  document.querySelectorAll('[data-glass-photo]').forEach(attachPhotoLens);
  document.querySelectorAll('[data-glass-segments]').forEach(attachSegments);
})();
