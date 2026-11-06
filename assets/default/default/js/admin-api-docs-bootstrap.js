// Redoc 3 ships its standalone bundle as an ES module, so this bootstrap is
// loaded with type="module" and imports `init` instead of using a global.
import { init } from './redoc.standalone.js';

var mount = document.getElementById('redoc');

// Redoc 3.0.1 removed the v2 lazyRendering option. In this isolated viewer,
// eagerly mount its section placeholders so outer-page offsets stay stable.
// Other observers (menu selection, tooltips, etc.) retain native behaviour.
if (mount && window.IntersectionObserver) {
  const NativeObserver = window.IntersectionObserver;
  window.IntersectionObserver = class extends NativeObserver {
    constructor(callback, options) {
      super(callback, options);
      this.sectionCallback = callback;
    }
    observe(target) {
      if (mount.contains(target) && target.hasAttribute('data-section-id')) {
        queueMicrotask(() => {
          if (target.isConnected) this.sectionCallback([{ target, isIntersecting: true }], this);
        });
      } else {
        super.observe(target);
      }
    }
  };
}

if (mount) {
  init(
    mount.getAttribute('data-openapi-url'),
    {
      disableTelemetry: true,
      hideDownloadButtons: true,
      scrollYOffset: 0
    },
    mount
  );
}

// The reference is same-origin. Give its content the page scrollbar, while keeping
// the sidebar within the outer viewport instead of the now full-height iframe.
if (mount && window.frameElement && window.parent.location.origin === window.location.origin) {
  const frame = window.frameElement;
  const parentWindow = window.parent;
  let pending = 0;
  let pendingSection = '';
  let navigationFrames = 0;
  function updateFrame() {
    pending = 0;
    const viewportHeight = parentWindow.innerHeight;
    mount.style.setProperty('--admin-api-viewport-height', viewportHeight + 'px');
    // Measure normal layout: scrollHeight includes the translated sidebar and
    // would keep a previously expanded reference from shrinking.
    const height = Math.ceil(mount.getBoundingClientRect().height);
    if (frame.style.height !== height + 'px') frame.style.height = height + 'px';
    const offset = Math.max(0, Math.min(-frame.getBoundingClientRect().top, height - viewportHeight));
    mount.style.setProperty('--admin-api-sidebar-offset', offset + 'px');
    if (pendingSection) {
      const section = Array.from(mount.querySelectorAll('[data-section-id]')).find(element => element.getAttribute('data-section-id').toLowerCase() === pendingSection.toLowerCase());
      if (section) {
        const top = parentWindow.scrollY + frame.getBoundingClientRect().top + section.getBoundingClientRect().top;
        // Routing can expand a tag's operations after its heading first mounts.
        // Retain the anchor through those resizes until the user takes over scrolling.
        parentWindow.scrollTo({ top, behavior: 'instant' });
        if (navigationFrames-- > 0) scheduleUpdate();
      }
    }
  }
  function scheduleUpdate() {
    if (!pending) pending = parentWindow.requestAnimationFrame(updateFrame);
  }
  function followReferenceLink(event) {
    const href = event.target.closest('a')?.getAttribute('href');
    if (!href?.startsWith('#/') || event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    // Follow Redoc routing after React has updated, across the iframe boundary.
    pendingSection = href.slice(1);
    navigationFrames = 4;
    scheduleUpdate();
  }
  function cancelNavigation(event) {
    if (event.type === 'keydown' && !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) return;
    pendingSection = '';
  }
  const navigationEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  for (const event of navigationEvents) {
    parentWindow.addEventListener(event, cancelNavigation, { passive: true });
    window.addEventListener(event, cancelNavigation, { passive: true });
  }
  mount.addEventListener('click', followReferenceLink, true);
  const observer = new ResizeObserver(scheduleUpdate);
  observer.observe(mount);
  parentWindow.addEventListener('scroll', scheduleUpdate, { passive: true });
  parentWindow.addEventListener('resize', scheduleUpdate);
  window.addEventListener('pagehide', () => {
    observer.disconnect();
    for (const event of navigationEvents) {
      parentWindow.removeEventListener(event, cancelNavigation);
      window.removeEventListener(event, cancelNavigation);
    }
    mount.removeEventListener('click', followReferenceLink, true);
    parentWindow.cancelAnimationFrame(pending);
    parentWindow.removeEventListener('scroll', scheduleUpdate);
    parentWindow.removeEventListener('resize', scheduleUpdate);
  }, { once: true });
  scheduleUpdate();
}
