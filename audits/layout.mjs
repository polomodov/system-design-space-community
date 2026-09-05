import { openPublicPage, settleAnimations } from "./common.mjs";

// Target scrollWidth can drift by a few pixels from subpixel rounding.
// Document overflow and visible offenders still fail the audit.
const TARGET_SCROLL_DELTA_TOLERANCE_PX = 8;

export const layoutViewportProfiles                                   = [
  {
    id: "mobile",
    width: 320,
    height: 780,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  },
  {
    id: "desktop",
    width: 1440,
    height: 900,
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  },
]         ;

const requestedViewport = process.env.LAYOUT_VIEWPORT;

export const activeLayoutViewportProfiles = (() => {
  if (!requestedViewport) {
    return layoutViewportProfiles;
  }

  return layoutViewportProfiles.filter(
    (viewport) => viewport.id === requestedViewport,
  );
})();

const waitForReadyMarker = async (page      , route                  ) => {
  await page.getByTestId(route.rootTestId).waitFor({ state: "visible" });

  if (!route.readyMarker) {
    return;
  }

  if (route.readyMarker.type === "testId") {
    await page
      .getByTestId(route.readyMarker.value)
      .waitFor({ state: "visible" });
    return;
  }

  await page
    .locator(route.readyMarker.value)
    .first()
    .waitFor({ state: "visible" });
};

const formatAuditFailure = (
  route                  ,
  viewport                       ,
  audit                   ,
) => {
  const lines = [
    `Layout audit failed for ${route.path} [${route.locale}, ${viewport.id}]`,
    `document overflow: ${audit.documentScrollWidth} / ${audit.viewportWidth} (delta ${audit.documentOverflowDelta})`,
  ];

  for (const target of audit.targets) {
    if (
      target.scrollDelta <= TARGET_SCROLL_DELTA_TOLERANCE_PX &&
      target.offenders.length === 0
    ) {
      continue;
    }

    lines.push(
      `target ${target.testId}: scroll ${target.scrollWidth} / ${target.clientWidth} (delta ${target.scrollDelta})`,
    );

    for (const offender of target.offenders.slice(0, 8)) {
      lines.push(
        `  ${offender.tag} "${offender.text}" right+${offender.overRight} left+${offender.overLeft} width=${offender.width} class=${offender.className}`,
      );
    }
  }

  return lines.join("\n");
};

export const openRouteForLayoutAudit = async (
  page      ,
  route                  ,
) => {
  await openPublicPage(page, route.path);
  await waitForReadyMarker(page, route);
  await settleAnimations(page);

  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });
};

export const runLayoutAudit = async (
  page      ,
  route                  ,
  viewport                       ,
  testInfo          ,
) => {
  const audit = await page.evaluate(
    ({
      auditTargetTestIds,
      offenderScanTestIds,
      ignoredDescendantSelectors,
    }

     ) => {
      const ignoredTags = new Set([
        "script",
        "style",
        "link",
        "meta",
        "noscript",
        "path",
        "marker",
        "defs",
        "stop",
        "clipPath",
        "mask",
        "linearGradient",
        "radialGradient",
        "filter",
        "feGaussianBlur",
        "feColorMatrix",
        "feOffset",
        "feBlend",
        "feFlood",
        "feComposite",
        "feMerge",
        "feMergeNode",
        "feMorphology",
        "feDropShadow",
        "feTurbulence",
        "feDisplacementMap",
        "title",
        "desc",
      ]);

      const hasHorizontalScrollAncestor = (
        element         ,
        root             ,
      ) => {
        let current = element.parentElement;

        while (current && current !== root) {
          const styles = window.getComputedStyle(current);
          const overflowX = `${styles.overflowX} ${styles.overflow}`;
          if (overflowX.includes("auto") || overflowX.includes("scroll")) {
            return true;
          }
          current = current.parentElement;
        }

        return false;
      };

      const isMeaningfullyVisible = (element         ) => {
        if (element.closest('[aria-hidden="true"]')) {
          return false;
        }

        const styles = window.getComputedStyle(element);
        if (styles.display === "none" || styles.visibility === "hidden") {
          return false;
        }

        if (Number.parseFloat(styles.opacity || "1") === 0) {
          return false;
        }

        if ((element               ).hidden) {
          return false;
        }

        return true;
      };

      const isDecorativeGlow = (element         ) => {
        const styles = window.getComputedStyle(element);
        const text = (element.textContent || "").trim();
        const className = (element.className || "").toString();
        const isLayeredDecoration =
          styles.position === "absolute" || styles.position === "fixed";
        const hasBlurEffect =
          className.includes("blur") ||
          styles.filter !== "none" ||
          styles.backdropFilter !== "none";

        return isLayeredDecoration && hasBlurEffect && text.length === 0;
      };

      const shouldIgnoreElement = (
        element         ,
        ignoredSelectors          ,
      ) => {
        if (!ignoredSelectors.length) {
          return false;
        }

        return ignoredSelectors.some(
          (selector) =>
            element.matches(selector) || Boolean(element.closest(selector)),
        );
      };

      const offenderScanIds = new Set(offenderScanTestIds);

      const scanTarget = (testId        ) => {
        const root = document.querySelector             (
          `[data-testid="${testId}"]`,
        );
        if (!root) {
          return {
            testId,
            clientWidth: 0,
            scrollWidth: 0,
            scrollDelta: 0,
            offenders: [
              {
                tag: "missing-root",
                className: "",
                text: `Missing [data-testid="${testId}"]`,
                left: 0,
                right: 0,
                width: 0,
                overLeft: 0,
                overRight: 0,
              },
            ],
          };
        }

        const viewportWidth = window.innerWidth;
        const rootRect = root.getBoundingClientRect();
        const allowedLeft = Math.max(0, rootRect.left);
        const allowedRight = Math.min(viewportWidth, rootRect.right);
        const offenders                   = [];

        if (offenderScanIds.has(testId)) {
          const descendants = Array.from(root.querySelectorAll("*"));
          for (const element of descendants) {
            const tag = element.tagName.toLowerCase();
            if (ignoredTags.has(tag)) {
              continue;
            }

            if (shouldIgnoreElement(element, ignoredDescendantSelectors)) {
              continue;
            }

            if (!isMeaningfullyVisible(element)) {
              continue;
            }

            if (isDecorativeGlow(element)) {
              continue;
            }

            if (hasHorizontalScrollAncestor(element, root)) {
              continue;
            }

            const rect = element.getBoundingClientRect();
            if (rect.width <= 1 || rect.height <= 1) {
              continue;
            }

            const overRight = Math.max(0, rect.right - allowedRight);
            const overLeft = Math.max(0, allowedLeft - rect.left);

            if (overRight <= 1 && overLeft <= 1) {
              continue;
            }

            offenders.push({
              tag,
              className: (element.className || "").toString().slice(0, 180),
              text: (element.textContent || "")
                .trim()
                .replace(/\s+/g, " ")
                .slice(0, 140),
              left: Math.round(rect.left * 10) / 10,
              right: Math.round(rect.right * 10) / 10,
              width: Math.round(rect.width * 10) / 10,
              overLeft: Math.round(overLeft * 10) / 10,
              overRight: Math.round(overRight * 10) / 10,
            });
          }
        }

        return {
          testId,
          clientWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
          scrollDelta: root.scrollWidth - root.clientWidth,
          offenders: offenders.slice(0, 20),
        };
      };

      return {
        viewportWidth: window.innerWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        documentOverflowDelta:
          document.documentElement.scrollWidth - window.innerWidth,
        targets: auditTargetTestIds.map(scanTarget),
      }                            ;
    },
    {
      auditTargetTestIds: route.auditTargetTestIds,
      offenderScanTestIds:
        route.offenderScanTestIds ?? route.auditTargetTestIds,
      ignoredDescendantSelectors: route.ignoredDescendantSelectors ?? [],
    },
  );

  const hasTargetFailures = audit.targets.some(
    (target) =>
      target.scrollDelta > TARGET_SCROLL_DELTA_TOLERANCE_PX ||
      target.offenders.length > 0,
  );

  if (audit.documentOverflowDelta <= 1 && !hasTargetFailures) {
    return;
  }

  await testInfo.attach("layout-audit-report", {
    body: Buffer.from(JSON.stringify(audit, null, 2)),
    contentType: "application/json",
  });
  await testInfo.attach("layout-audit-screenshot", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });

  throw new Error(formatAuditFailure(route, viewport, audit));
};
