const NUMERIC = /^[-+(]?[$€£₹]?\s?\d[\d,]*(\.\d+)?\s?%?\)?$/;

/** Right-aligns a table column when every body cell in it is a number, so figures line up. */
export function alignNumericColumns(root) {
  root.querySelectorAll('table').forEach((table) => {
    const body = table.tBodies[0];
    if (!body || !table.rows.length) return;
    const rows = [...body.rows];
    for (let c = 0; c < table.rows[0].cells.length; c++) {
      const cells = rows.map((r) => r.cells[c]).filter(Boolean);
      if (cells.length && cells.every((td) => NUMERIC.test(td.textContent.trim()))) {
        table.rows[0].cells[c].classList.add('num');
        cells.forEach((td) => td.classList.add('num'));
      }
    }
  });
}
