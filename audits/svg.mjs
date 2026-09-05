export const chapterPath = (slug        , locale        ) =>
  `${locale === "en" ? "/en" : ""}/chapter/${slug}`;

/**
 * Serialised into the page. Reports a label only when it is WIDER than the box
 * drawn behind it, or when it leaves the viewBox — the two states a reader
 * actually sees as broken.
 *
 * Everything is measured in the SVG root's user space through getCTM(), never
 * from raw x/y/width attributes: axis captions are rotated and legends sit in
 * translated groups, and getBBox() reports the box BEFORE those transforms.
 * Reading attributes directly reported a rotated axis caption as leaving the
 * viewBox by 41 units when it sits comfortably inside it.
 *
 * Two further heuristics keep the result trustworthy, both learned from false
 * positives. Matching by "smallest rect enclosing the text" attributes a label
 * drawn NEXT TO a legend swatch to that swatch, so boxes too small to be a
 * label container are skipped. And a label narrower than its box that merely
 * sits close to an edge is deliberate placement, not a spill.
 */
const measureSpills = () => {
  /** A rect narrower than this cannot be a label container — it is a swatch. */
  const MIN_CONTAINER = 24;
  /** Sub-pixel rounding in getBBox; below this a spill is not visible. */
  const EPSILON = 1;

  const found

      = [];

  document.querySelectorAll("svg").forEach((svg) => {
    const viewBox = (svg.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
    if (viewBox.length !== 4 || Number.isNaN(viewBox[2])) return;
    const rootCTM = svg.getScreenCTM();
    if (!rootCTM) return;
    // A hidden or zero-sized SVG has a singular matrix and inverse() throws.
    // Uncaught, that aborts the whole sweep and reports a clean page — which is
    // how an earlier revision of this measurement silently found nothing.
    let toUserSpace           ;
    try {
      toUserSpace = rootCTM.inverse();
    } catch {
      return;
    }

    const paintedBox = (node                    ) => {
      let local         ;
      try {
        local = node.getBBox();
      } catch {
        return null;
      }
      const ctm = node.getScreenCTM();
      if (!ctm) return null;
      const matrix = toUserSpace.multiply(ctm);
      const point = (svg                 ).createSVGPoint();
      const xs           = [];
      const ys           = [];
      for (const [dx, dy] of [
        [0, 0],
        [local.width, 0],
        [0, local.height],
        [local.width, local.height],
      ]) {
        point.x = local.x + dx;
        point.y = local.y + dy;
        const mapped = point.matrixTransform(matrix);
        xs.push(mapped.x);
        ys.push(mapped.y);
      }
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    };

    const rects = [...svg.querySelectorAll("rect")]
      .map((rect) => paintedBox(rect))
      .filter((box)                                                        =>
        Boolean(box && box.w >= MIN_CONTAINER && box.h > 0),
      );

    svg.querySelectorAll("text").forEach((node) => {
      const text = (node.textContent ?? "").trim();
      if (!text) return;
      const box = paintedBox(node);
      if (!box || box.w === 0) return;

      if (box.x < viewBox[0] - EPSILON || box.x + box.w > viewBox[0] + viewBox[2] + EPSILON) {
        found.push({
          kind: "viewBox",
          text,
          width: Number(box.w.toFixed(1)),
          limit: viewBox[2],
          spill: Number(
            Math.max(viewBox[0] - box.x, box.x + box.w - (viewBox[0] + viewBox[2])).toFixed(1),
          ),
        });
        return;
      }

      const centre = box.x + box.w / 2;
      const host = rects
        .filter(
          (rect) =>
            box.y >= rect.y - 2 &&
            box.y + box.h <= rect.y + rect.h + 2 &&
            centre >= rect.x &&
            centre <= rect.x + rect.w,
        )
        .sort((a, b) => a.w * a.h - b.w * b.h)[0];
      if (!host) return;
      if (box.w > host.w - EPSILON) {
        found.push({
          kind: "box",
          text,
          width: Number(box.w.toFixed(1)),
          limit: Number(host.w.toFixed(1)),
          spill: Number((box.w - host.w).toFixed(1)),
        });
      }
    });
  });

  return found;
};

/** Diagrams below the fold are mounted but may render lazily. */
const settleDiagrams = async (page      ) => {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(180);
  await page.evaluate(() => window.scrollTo(0, 0));
};

export const collectLabelSpills = async (page      )                        => {
  await settleDiagrams(page);
  return page.evaluate(measureSpills);
};

export const formatSpillFailure = (
  slug        ,
  locale        ,
  spills                       ,
) => {
  const lines = [`Diagram labels spill their boxes on ${chapterPath(slug, locale)}`];
  for (const spill of spills) {
    lines.push(
      spill.kind === "viewBox"
        ? `  "${spill.text}" leaves the viewBox (${spill.limit} wide) by ${spill.spill}`
        : `  "${spill.text}" is ${spill.width} wide in a ${spill.limit} box (over by ${spill.spill})`,
    );
  }
  lines.push(
    "SVG text does not wrap: author the label's line breaks per locale, or widen the box.",
  );
  return lines.join("\n");
};
