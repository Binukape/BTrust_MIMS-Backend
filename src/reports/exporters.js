import PDFDocument from 'pdfkit';
import { slNowText } from '../utils/dates.js';

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(report) {
  const header = report.columns.map((c) => csvCell(c.label)).join(',');
  const lines = report.rows.map((row) => report.columns.map((c) => csvCell(row[c.key])).join(','));
  return `${[header, ...lines].join('\r\n')}\r\n`;
}

export function toPdf(report, res) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 });
  doc.pipe(res);

  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const weights = report.columns.map((c) => Math.max(6, Math.min(24, c.label.length + 2)));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / totalWeight) * usable);

  doc.font('Helvetica-Bold').fontSize(15).text(report.title, left, doc.y);
  doc.font('Helvetica').fontSize(8.5).fillColor('#444444')
    .text(`${report.period}   |   Generated ${slNowText()} (Sri Lanka time)   |   B-Trust Microfinance Bank`)
    .fillColor('#000000');
  doc.moveDown(0.6);

  function drawRow(cells, bold) {
    const font = bold ? 'Helvetica-Bold' : 'Helvetica';
    doc.font(font).fontSize(7.6);
    const height = Math.max(
      ...cells.map((text, i) => doc.heightOfString(String(text ?? ''), { width: widths[i] - 6 })),
    ) + 6;

    if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
    const top = doc.y;
    if (bold) {
      doc.rect(left, top, usable, height).fill('#e5e5e5').fillColor('#000000');
    }
    let x = left;
    cells.forEach((text, i) => {
      const align = report.columns[i].align || 'left';
      doc.font(font).fontSize(7.6).text(String(text ?? ''), x + 3, top + 3, { width: widths[i] - 6, align });
      x += widths[i];
    });
    doc.moveTo(left, top + height).lineTo(left + usable, top + height).strokeColor('#bbbbbb').lineWidth(0.5).stroke();
    doc.x = left;
    doc.y = top + height;
  }

  drawRow(report.columns.map((c) => c.label), true);
  if (report.rows.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(9).text('No data for the selected period.', left, doc.y + 6);
  }
  report.rows.forEach((row) => drawRow(report.columns.map((c) => row[c.key]), false));

  doc.end();
}
