/**
 * Minimal zero-dependency PDF writer.
 *
 * Produces a valid PDF 1.4 document (single or multi page) with text lines,
 * section headings, key-value rows, horizontal rules and a footer. Enough for
 * invoices, receipts and lease agreements without pulling in a heavy
 * pdfkit/puppeteer dependency.
 *
 * All text is escaped; only WinAnsi-safe characters are written. Long lines
 * wrap automatically at the usable width.
 */

const PAGE_WIDTH = 595.28; // A4 width in points
const PAGE_HEIGHT = 841.89; // A4 height in points
const MARGIN = 48;
const USABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Approximate per-character width factor for Helvetica at size 1pt, used for
// simple greedy line wrapping (good enough for generated documents).
const AVG_CHAR_WIDTH = 0.52;

type TextSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<TextSize, number> = {
  xs: 8,
  sm: 10,
  md: 11,
  lg: 14,
  xl: 20,
};

function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function sanitize(text: string): string {
  // Keep WinAnsi printable range; replace anything else (e.g. emoji).
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x20-\x7E\n\t]/g, (ch) => {
    // Common smart punctuation mapped to ASCII equivalents.
    if (ch === '\u2018' || ch === '\u2019') return "'";
    if (ch === '\u201C' || ch === '\u201D') return '"';
    if (ch === '\u2013' || ch === '\u2014') return '-';
    if (ch === '\u2026') return '...';
    return '?';
  });
}

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const maxChars = Math.max(8, Math.floor(maxWidth / (fontSize * AVG_CHAR_WIDTH)));
  const lines: string[] = [];
  for (const rawLine of text.split('\n')) {
    if (rawLine.length <= maxChars) {
      lines.push(rawLine);
      continue;
    }
    let current = '';
    for (const word of rawLine.split(/\s+/)) {
      if (!current) {
        current = word;
      } else if ((current + ' ' + word).length <= maxChars) {
        current += ' ' + word;
      } else {
        lines.push(current);
        current = word;
      }
      // Hard-split words longer than a full line.
      while (current.length > maxChars) {
        lines.push(current.slice(0, maxChars));
        current = current.slice(maxChars);
      }
    }
    lines.push(current);
  }
  return lines;
}

class PdfPage {
  private ops: string[] = [];

  text(
    text: string,
    opts: { x?: number; y?: number; size?: TextSize; bold?: boolean; color?: [number, number, number] } = {}
  ): this {
    const { x = MARGIN, y, size = 'md', bold = false, color } = opts;
    const fontSize = SIZES[size];
    const yy = y ?? PAGE_HEIGHT - MARGIN - (this.ops.length ? 0 : fontSize);
    const font = bold ? '/F2' : '/F1';
    const rgb = color ? `${color[0]} ${color[1]} ${color[2]}` : '0 0 0';
    this.ops.push(
      `BT ${rgb} rg ${font} ${fontSize} Tf 1 0 0 1 ${x.toFixed(2)} ${yy.toFixed(2)} Tm (${escapePdfText(
        sanitize(text)
      )}) Tj ET`
    );
    return this;
  }

  /** Absolute-positioned text measured from the top of the page. */
  textFromTop(text: string, fromTop: number, opts: { size?: TextSize; bold?: boolean; x?: number } = {}): this {
    const y = PAGE_HEIGHT - fromTop;
    this.text(text, { ...opts, y });
    return this;
  }

  line(fromTop: number, opts: { x1?: number; x2?: number; width?: number; color?: [number, number, number] } = {}): this {
    const { x1 = MARGIN, x2 = PAGE_WIDTH - MARGIN, width = 0.75, color = [0.85, 0.85, 0.85] } = opts;
    const y = PAGE_HEIGHT - fromTop;
    const rgb = `${color[0]} ${color[1]} ${color[2]}`;
    this.ops.push(
      `${rgb} RG ${width} w ${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S`
    );
    return this;
  }

  rect(
    x: number,
    fromTop: number,
    w: number,
    h: number,
    color: [number, number, number]
  ): this {
    const y = PAGE_HEIGHT - fromTop - h;
    this.ops.push(
      `${color[0]} ${color[1]} ${color[2]} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`
    );
    return this;
  }
}

export class PdfDocument {
  private pages: PdfPage[] = [];
  private current: PdfPage | null = null;
  private cursorFromTop = 0;
  private footerText: string | null = null;

  /** Start a fresh page (or the first implicit one). */
  private ensurePage(): PdfPage {
    if (!this.current) {
      this.current = new PdfPage();
      this.cursorFromTop = MARGIN;
    }
    return this.current;
  }

  addPage(): this {
    this.current = new PdfPage();
    this.pages.push(this.current);
    this.cursorFromTop = MARGIN;
    return this;
  }

  private space(amount: number) {
    this.cursorFromTop += amount;
  }

  heading(text: string): this {
    const page = this.ensurePage();
    this.space(6);
    page.textFromTop(text, this.cursorFromTop, { size: 'xl', bold: true, x: MARGIN });
    this.space(SIZES.xl * 1.3);
    return this;
  }

  subheading(text: string): this {
    const page = this.ensurePage();
    this.space(10);
    page.textFromTop(text, this.cursorFromTop, { size: 'lg', bold: true });
    this.space(SIZES.lg * 1.4);
    return this;
  }

  text(text: string, opts: { size?: TextSize; bold?: boolean; indent?: number } = {}): this {
    const page = this.ensurePage();
    const fontSize = SIZES[opts.size || 'md'];
    const lines = wrapText(text, USABLE_WIDTH - (opts.indent || 0), fontSize);
    for (const line of lines) {
      this.space(fontSize * 1.35);
      page.textFromTop(line, this.cursorFromTop, { size: opts.size, bold: opts.bold, x: MARGIN + (opts.indent || 0) });
    }
    return this;
  }

  muted(text: string): this {
    return this.text(text, { size: 'sm' });
  }

  /** Two-column key/value row (label left, value right-aligned). */
  keyValue(label: string, value: string, opts: { bold?: boolean; size?: TextSize } = {}): this {
    const page = this.ensurePage();
    const size = SIZES[opts.size || 'sm'];
    this.space(size * 1.5);
    page.textFromTop(label, this.cursorFromTop, { size: opts.size || 'sm' });
    // Right-align approximate.
    const valueWidth = value.length * size * AVG_CHAR_WIDTH;
    const x = Math.max(MARGIN + 220, PAGE_WIDTH - MARGIN - valueWidth);
    page.textFromTop(value, this.cursorFromTop, { size: opts.size || 'sm', bold: opts.bold, x });
    return this;
  }

  divider(): this {
    const page = this.ensurePage();
    this.space(8);
    page.line(this.cursorFromTop);
    this.space(8);
    return this;
  }

  gap(amount = 8): this {
    this.space(amount);
    return this;
  }

  footer(text: string): this {
    this.footerText = text;
    return this;
  }

  /** Returns the finished PDF as a Buffer. */
  build(): Buffer {
    if (this.pages.length === 0) this.addPage();
    if (this.current) {
      // Ensure trailing cursor content ends within the page.
      this.current = null;
    }

    const objects: string[] = [];
    const pageObjectStart = 3; // 1=catalog, 2=pages
    const pageCount = this.pages.length;

    // Page objects each reference their content stream. Streams start after
    // the two fixed objects.
    const pageObjectIds: number[] = [];
    const contentObjectIds: number[] = [];
    for (let i = 0; i < pageCount; i++) {
      pageObjectIds.push(pageObjectStart + i * 2);
      contentObjectIds.push(pageObjectStart + i * 2 + 1);
    }
    const fontsStart = pageObjectStart + pageCount * 2;
    const fontRegularId = fontsStart;
    const fontBoldId = fontsStart + 1;

    // Catalog + Pages
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push(
      `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`
    );

    for (let i = 0; i < pageCount; i++) {
      const content = this.pages[i]['ops'].join('\n');
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(
          2
        )}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${
          contentObjectIds[i]
        } 0 R >>`
      );

      let streamBody = content;
      if (this.footerText) {
        streamBody += `\nBT 0.55 0.55 0.55 rg /F1 8 Tf 1 0 0 1 ${MARGIN} 28 Tm (${escapePdfText(
          sanitize(this.footerText)
        )}) Tj ET`;
      }
      objects.push(
        `<< /Length ${Buffer.byteLength(streamBody, 'latin1')} >>\nstream\n${streamBody}\nendstream`
      );
    }

    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(Buffer.byteLength(pdf, 'latin1'));
      pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (const offset of offsets) {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'latin1');
  }
}

export const PDF_COLORS = {
  ink: [0.07, 0.09, 0.15] as [number, number, number],
  gold: [0.886, 0.718, 0.078] as [number, number, number],
  gray: [0.42, 0.42, 0.45] as [number, number, number],
  white: [1, 1, 1] as [number, number, number],
};

export { PAGE_WIDTH as PDF_PAGE_WIDTH, PAGE_HEIGHT as PDF_PAGE_HEIGHT, MARGIN as PDF_MARGIN };
