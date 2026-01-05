/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// Reference the entry style files, relative to the compiled js output file.
// This is needed for webpack to generate the compiled styles.
import "../../../styles/style.scss";
// import "../../../styles/default.css";
import {formValidatorsSharedDefinitions} from "@researchdatabox/sails-ng-common";

export const formValidatorDefinitions = formValidatorsSharedDefinitions;

function safeStorageGet(key: string): any {
  try {
    if (!window.localStorage) {
      return null;
    }
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    return null;
  }
}

function safeStorageSet(key: string, value: any): void {
  try {
    if (!window.localStorage) {
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // Ignore storage failures (privacy mode/quota).
  }
}

function safeStorageRemove(key: string): void {
  try {
    if (!window.localStorage) {
      return;
    }
    localStorage.removeItem(key);
  } catch (err) {
    // Ignore storage failures (privacy mode/quota).
  }
}

function initSystemMessage() {
  const systemMessageArea = document.getElementById('system-message-area');
  const systemMessage = document.getElementById('system-message');

  if (systemMessageArea) {
    const messageKey = systemMessageArea.getAttribute('data-system-message-key') || '';
    const messageScope = systemMessageArea.getAttribute('data-system-message-scope') || 'default';
    const storageKey = 'systemMessageDismissal:' + messageScope;
    const dismissal = safeStorageGet(storageKey);
    const now = Date.now();
    const eightHoursInMillis = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
    const dismissedAt = dismissal && Number(dismissal.dismissedAt);
    const hasValidDismissal = dismissal && dismissal.key === messageKey && isFinite(dismissedAt);

    safeStorageRemove('systemMessageDismissalTime');

    if (hasValidDismissal && now - dismissedAt <= eightHoursInMillis) {
      // Remove the system message area as it takes up space even when hidden
      systemMessageArea.remove();
    } else {
      // Ensure visible on first load or when the message changes
      systemMessageArea.style.display = 'block';
    }
  }

  if (systemMessage) {
    systemMessage.addEventListener('closed.bs.alert', function () {
      const area = document.getElementById('system-message-area');
      if (area) {
        const messageKey = area.getAttribute('data-system-message-key') || '';
        const messageScope = area.getAttribute('data-system-message-scope') || 'default';
        const storageKey = 'systemMessageDismissal:' + messageScope;
        safeStorageSet(storageKey, { key: messageKey, dismissedAt: Date.now() });
        // Remove the system message area as it takes up space even when hidden
        area.remove();
      }
    });
  }
}

function initNavigationHighlight() {
  // Remove any pre-existing active classes from nav items
  document.querySelectorAll('li.active').forEach(function (li) {
    li.classList.remove('active');
  });

  // Helper to find the first anchor matching an exact path
  function findLinkByPath(path: string): Element | null {
    // Escape quotes and backslashes for safe selector usage
    const escapedPath = path.replace(/["\\]/g, '\\$&');
    return document.querySelector('a[href="' + escapedPath + '"]');
  }

  // Try to find and highlight the active navigation item
  let curHref = findLinkByPath(location.pathname);
  if (!curHref) {
    // Try progressively shorter paths if exact match fails
    const segments = location.pathname.split('/');
    for (let i = segments.length - 1; i > 0; i--) {
      const candidate = segments.slice(0, i).join('/');
      curHref = findLinkByPath(candidate);
      if (curHref) {
        break;
      }
    }
  }

  if (curHref) {
    const dropdown = curHref.closest('.dropdown');
    const li = curHref.closest('li');
    if (!dropdown) {
      if (li) {
        li.classList.add('nav-active-item');
      }
    } else {
      if (li) {
        li.classList.add('active');
      }
      dropdown.classList.add('nav-active-item');
    }
  }
}

document.addEventListener('DOMContentLoaded', function() {
  initSystemMessage();
  initNavigationHighlight();
});

