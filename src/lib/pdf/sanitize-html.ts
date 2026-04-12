/**
 * Sanitize user-edited HTML from the WYSIWYG PDF editor.
 * Used to prevent stored XSS when the override is loaded by another user,
 * and as defense-in-depth against scripts running inside Puppeteer.
 */
import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'html', 'head', 'meta', 'title', 'style', 'body',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'colgroup', 'col',
  'div', 'span', 'p', 'br', 'hr',
  'b', 'strong', 'i', 'em', 'u', 'sub', 'sup',
  'ul', 'ol', 'li',
  'img',
];

const ALLOWED_ATTR = [
  'class', 'style', 'colspan', 'rowspan', 'width', 'height',
  'align', 'valign', 'lang', 'dir', 'charset', 'name', 'content', 'http-equiv',
  'src', 'alt',
];

/**
 * Sanitize a full HTML document string. Allows only a tight allowlist of
 * tags and attributes suitable for our proforma invoice template.
 *
 * - Strips all `<script>`, `<iframe>`, `<object>`, `<embed>`, `<svg>`, `<math>`, etc.
 * - Strips all `on*` event handlers
 * - Strips `javascript:` URLs, `data:` URLs (except `data:image/*;base64,`)
 * - Preserves `<style>` blocks for CSS
 */
export function sanitizePdfHtml(rawHtml: string): string {
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    WHOLE_DOCUMENT: true,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    // DOMPurify applies ALLOWED_URI_REGEXP to every attribute value (not just
    // URI attributes like href/src). So the regex has to admit plain values
    // like `colspan="5"` and `width="100%"` too — otherwise DOMPurify strips
    // those attributes and the PDF layout collapses. The first alternative
    // `[^:]*$` accepts anything without a colon (numbers, class names, CSS
    // values), then the remaining alternatives allow only safe URI schemes.
    ALLOWED_URI_REGEXP: /^(?:[^:]*$|data:image\/(?:png|jpeg|jpg|gif|webp);base64,|https?:\/\/|\/|#)/i,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'option', 'button', 'link', 'base', 'svg', 'math'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onkeydown', 'onkeyup', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'formaction', 'srcdoc', 'srcset'],
    KEEP_CONTENT: true,
  }) as unknown as string;
}
