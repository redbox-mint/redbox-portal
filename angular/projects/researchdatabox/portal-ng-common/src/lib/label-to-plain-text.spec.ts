import { labelToPlainText } from './label-to-plain-text';
import { PlainTextLabelPipe } from './plain-text-label.pipe';

describe('labelToPlainText', () => {
  it('extracts link text without exposing markup or link attributes', () => {
    expect(labelToPlainText('See the <a href="https://example.org" target="_blank" rel="noopener">DFAT</a> website?'))
      .toBe('See the DFAT website?');
  });

  it('decodes entities once, including numeric and non-breaking spaces', () => {
    expect(labelToPlainText('Research &amp; Australia&#39;s&nbsp;partners &#x2013; &lt; 5'))
      .toBe("Research & Australia's partners – < 5");
    expect(labelToPlainText('&lt;a href=&quot;example&quot;&gt;'))
      .toBe('<a href="example">');
  });

  it('collapses HTML whitespace and separates block elements and line breaks', () => {
    expect(labelToPlainText('<p>First\n  line</p><div>Second<br>line</div>'))
      .toBe('First line Second line');
    expect(labelToPlainText('re<strong>search</strong>')).toBe('research');
  });

  it('preserves plain labels exactly, including comparisons and whitespace', () => {
    for (const label of ['', 'Plain label', '  Plain\n label  ', 'a < b', '  a < b\n & c > d  ']) {
      expect(labelToPlainText(label)).withContext(label).toBe(label);
    }
  });

  it('omits comments and non-visible script/style content without executing it', () => {
    expect(labelToPlainText('Safe<!-- comment --><script>throw new Error("bad")</script><style>p { color: red }</style> label'))
      .toBe('Safe label');
  });

  it('guards environments without a DOM parser', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'DOMParser')!;
    try {
      Object.defineProperty(globalThis, 'DOMParser', { configurable: true, value: undefined });
      expect(labelToPlainText('<b>Label</b>')).toBe('<b>Label</b>');
    } finally {
      Object.defineProperty(globalThis, 'DOMParser', descriptor);
    }
  });

  it('shares conversion with the template pipe', () => {
    expect(new PlainTextLabelPipe().transform('<b>Research &amp; development</b>'))
      .toBe('Research & development');
  });
});
