// Redoc 3 ships its standalone bundle as an ES module, so this bootstrap is
// loaded with type="module" and imports `init` instead of using a global.
import { init } from './redoc.standalone.js';

var mount = document.getElementById('redoc');

// Keep Redoc's native section observer: it accounts for the parent viewport
// across the same-origin frame. Routing force-mounts the requested section.
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
  let expandedTag = '';
  let selectedTag = '';
  function syncSidebarNavigation() {
    // Redoc 3 retains visited groups. Collapse their operation panels without
    // reaching into React state; following any operation restores its group.
    if (expandedTag) {
      for (const section of mount.querySelectorAll('.api-content > div > [data-section-id]')) {
        const id = section.getAttribute('data-section-id');
        if (id.includes('/paths/')) section.parentElement.hidden = id.split('/')[1] !== expandedTag;
      }
    }
    mount.toggleAttribute('data-admin-tag-navigation', !!selectedTag);
    for (const link of mount.querySelectorAll('.menu-content a[href^="#/"]')) {
      const href = link.getAttribute('href');
      const selected = !!selectedTag && href === '#/' + selectedTag;
      link.toggleAttribute('data-admin-selected', selected);
      if (selected) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
      const group = link.parentElement;
      if (group.classList.contains('menu-item-type-group')) {
        group.classList.toggle('admin-api-collapsed', !!expandedTag && href !== '#/' + expandedTag);
      }
    }
  }
  function updateFrame() {
    pending = 0;
    syncSidebarNavigation();
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
    const link = event.target.closest('a');
    const href = link?.getAttribute('href');
    if (!href?.startsWith('#/') || event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    // Follow Redoc routing after React has updated, across the iframe boundary.
    pendingSection = href.slice(1);
    if (link.closest('.menu-content')) {
      expandedTag = href.split('/')[1];
      selectedTag = href.split('/').length === 2 ? expandedTag : '';
    } else if (href.includes('/paths/')) {
      expandedTag = href.split('/')[1];
      selectedTag = '';
    }
    navigationFrames = 4;
    scheduleUpdate();
  }
  function cancelNavigation(event) {
    if (event.type === 'keydown' && !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) return;
    pendingSection = '';
    if (event.type !== 'pointerdown') selectedTag = '';
    scheduleUpdate();
  }
  function followPageScroll() {
    if (!pendingSection) selectedTag = '';
    scheduleUpdate();
  }
  const navigationEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  for (const event of navigationEvents) {
    parentWindow.addEventListener(event, cancelNavigation, { passive: true });
    window.addEventListener(event, cancelNavigation, { passive: true });
  }
  mount.addEventListener('click', followReferenceLink, true);
  const observer = new ResizeObserver(scheduleUpdate);
  observer.observe(mount);
  const contentObserver = new MutationObserver(scheduleUpdate);
  contentObserver.observe(mount, { childList: true, subtree: true });
  parentWindow.addEventListener('scroll', followPageScroll, { passive: true });
  parentWindow.addEventListener('resize', scheduleUpdate);
  window.addEventListener('pagehide', () => {
    observer.disconnect();
    contentObserver.disconnect();
    for (const event of navigationEvents) {
      parentWindow.removeEventListener(event, cancelNavigation);
      window.removeEventListener(event, cancelNavigation);
    }
    mount.removeEventListener('click', followReferenceLink, true);
    parentWindow.cancelAnimationFrame(pending);
    parentWindow.removeEventListener('scroll', followPageScroll);
    parentWindow.removeEventListener('resize', scheduleUpdate);
  }, { once: true });
  scheduleUpdate();
}
