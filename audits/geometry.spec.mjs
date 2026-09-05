import {test,expect} from '@playwright/test';
import {runLayoutAudit,layoutViewportProfiles} from './layout.mjs';
import {settleAnimations} from './common.mjs';
import {collectLabelSpills} from './svg.mjs';

test('layout measurement detects actual overflow and accepts a fitting page',async({page},testInfo)=>{
  const route={path:'/',locale:'en',rootTestId:'fixture',auditTargetTestIds:['fixture']};
  await page.setViewportSize({width:320,height:780});
  await page.setContent('<main data-testid="fixture"><div style="width:100px;height:20px">Fits</div></main>');
  await runLayoutAudit(page,route,layoutViewportProfiles[0],testInfo);
  await page.setContent('<main data-testid="fixture"><div style="width:900px;height:20px">Overflow</div></main>');
  await expect(runLayoutAudit(page,route,layoutViewportProfiles[0],testInfo)).rejects.toThrow('Layout audit failed');
});
test('SVG measurement detects text escaping the drawn box',async({page})=>{
  await page.setContent('<svg viewBox="0 0 100 60" width="100" height="60"><rect x="0" y="0" width="80" height="40"/><text x="5" y="25" font-size="20">A deliberately very long diagram label</text></svg>');
  expect((await collectLabelSpills(page)).length).toBeGreaterThan(0);
  await page.setContent('<svg viewBox="0 0 300 60" width="300" height="60"><rect x="0" y="0" width="280" height="50"/><text x="10" y="25" font-size="12">Fits</text></svg>');
  expect(await collectLabelSpills(page)).toEqual([]);
});

test('waits for finite entrance animations before measuring', async ({page}) => {
  await page.setContent('<style>@keyframes enter {from {transform:translateX(20px)} to {transform:translateX(0)}} aside {animation:enter .15s both}</style><aside>Graph controls</aside>');
  await settleAnimations(page);
  expect(await page.locator('aside').evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41)).toBe(0);
});
