/** Styles that change where text lands; copied onto the measuring mirror. */
const MIRRORED = [
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'whiteSpace',
  'overflowWrap',
  'wordBreak',
] as const;

export interface CaretCoordinates {
  /** Relative to the control's border box, before subtracting its scroll offset. */
  top: number;
  left: number;
  height: number;
}

/**
 * Pixel position of a text offset in a textarea or input, measured with an
 * off-screen mirror element that copies the control's text metrics. The control
 * itself is never modified.
 */
export function caretCoordinates(control: HTMLTextAreaElement | HTMLInputElement, offset: number): CaretCoordinates {
  const doc = control.ownerDocument;
  const mirror = doc.createElement('div');
  const style = mirror.style;
  const computed = doc.defaultView!.getComputedStyle(control);
  for (const property of MIRRORED) {
    style[property] = computed[property];
  }
  const single = control.tagName === 'INPUT';
  style.position = 'absolute';
  style.visibility = 'hidden';
  style.top = '0';
  style.left = '-9999px';
  style.overflow = 'hidden';
  if (single) {
    style.whiteSpace = 'pre';
    style.height = 'auto';
  }
  mirror.textContent = control.value.slice(0, offset);
  const marker = doc.createElement('span');
  // A zero-width character gives the marker a line box even at a line end.
  marker.textContent = control.value.slice(offset, offset + 1) || '​';
  mirror.appendChild(marker);
  doc.body.appendChild(mirror);
  const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2;
  const result = {
    top: marker.offsetTop + (parseFloat(computed.borderTopWidth) || 0),
    left: marker.offsetLeft + (parseFloat(computed.borderLeftWidth) || 0),
    height: lineHeight,
  };
  if (single) {
    // Inputs centre their single line vertically.
    result.top = Math.max(0, (control.clientHeight - lineHeight) / 2) + (parseFloat(computed.borderTopWidth) || 0);
  }
  mirror.remove();
  return result;
}
