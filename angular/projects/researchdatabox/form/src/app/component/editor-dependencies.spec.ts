import { createAtomBlockMarkdownSpec, createInlineMarkdownSpec } from "@tiptap/core";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";
import DOMPurify from "dompurify";

describe("Editor dependency security regressions", () => {
  it("validates attributes supplied through pasted ProseMirror slice context", () => {
    const validate = jasmine.createSpy("validate clipboard attribute").and.callFake((value: unknown) => {
      if (typeof value !== "string") throw new RangeError("Expected a string");
    });
    const schema = new Schema({
      nodes: {
        doc: { content: "block+" },
        text: { group: "inline" },
        paragraph: { group: "block", content: "inline*", parseDOM: [{ tag: "p" }], toDOM: () => ["p", 0] },
        blockquote: {
          group: "block", content: "block+",
          attrs: { kind: { default: "safe", validate } },
          parseDOM: [{ tag: "blockquote" }], toDOM: () => ["blockquote", 0]
        }
      }
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const view = new EditorView(host, { state: EditorState.create({ schema }) });
    try {
      const hostileAttribute = ["script", {}, "alert(document.domain)"];
      const context = JSON.stringify(["blockquote", { kind: hostileAttribute }]);
      view.pasteHTML(`<p data-pm-slice='1 1 ${context}'>Safe pasted text</p>`);
      expect(validate).toHaveBeenCalledWith(hostileAttribute);
      expect(view.state.doc.textContent).toBe("Safe pasted text");
      expect(host.querySelector("script")).toBeNull();
      view.state.doc.descendants(node => {
        if (node.type.name === "blockquote") expect(node.attrs["kind"]).toBe("safe");
      });
    } finally {
      view.destroy();
      host.remove();
    }
  });

  it("scrubs template expressions reassembled inside attached shadow roots", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.append(document.createTextNode("$"), document.createElement("object"), document.createTextNode("{alert(document.domain)}"));
    DOMPurify.sanitize(host, { IN_PLACE: true, SAFE_FOR_TEMPLATES: true });
    expect(shadow.querySelector("object")).toBeNull();
    expect(shadow.textContent).not.toContain("${");
  });

  it("parses adversarial block and inline Markdown attributes within a bounded time", () => {
    const block = createAtomBlockMarkdownSpec({ nodeName: "probe" }).markdownTokenizer!;
    const inline = createInlineMarkdownSpec({ nodeName: "probe", selfClosing: true }).markdownTokenizer!;
    const lexer = { inlineTokens: () => [], blockTokens: () => [] };
    const start = performance.now();
    expect(block.tokenize(`:::probe {${"__QUOTED_0".repeat(4096)}__QUOTED_0__} :::\n`, [], lexer)).toBeDefined();
    expect(inline.tokenize(`[probe ${"0".repeat(65536)}]`, [], lexer)).toBeDefined();
    expect(performance.now() - start).toBeLessThan(1500);
  });
});
