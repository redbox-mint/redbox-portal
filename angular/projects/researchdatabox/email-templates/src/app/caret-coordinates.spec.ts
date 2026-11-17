import { caretCoordinates } from './caret-coordinates';

describe('caretCoordinates', () => {
  let area: HTMLTextAreaElement;
  beforeEach(() => {
    area = document.createElement('textarea');
    area.style.cssText =
      'font: 13px/20px monospace; padding: 8px 12px; border: 1px solid; width: 400px; white-space: pre';
    area.value = 'first line\n{{record.';
    document.body.appendChild(area);
  });
  afterEach(() => area.remove());

  it('measures later lines lower and later columns further right, without touching the control', () => {
    const start = caretCoordinates(area, 0);
    const secondLine = caretCoordinates(area, 11);
    const end = caretCoordinates(area, area.value.length);
    expect(secondLine.top - start.top).toBeCloseTo(20, 0);
    expect(end.left).toBeGreaterThan(secondLine.left);
    expect(start.left).toBeCloseTo(13, 0);
    expect(start.height).toBe(20);
    expect(area.value).toBe('first line\n{{record.');
    expect(document.body.lastElementChild).toBe(area);
  });

  it('measures single-line inputs on one line', () => {
    const input = document.createElement('input');
    input.style.cssText = 'font: 14px/20px monospace; padding: 6px 12px; width: 300px';
    input.value = 'Subject {{rec';
    document.body.appendChild(input);
    expect(caretCoordinates(input, 8).left).toBeGreaterThan(caretCoordinates(input, 0).left);
    input.remove();
  });
});
