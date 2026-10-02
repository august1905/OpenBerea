import { expect, type Page, test } from '@playwright/test';

import { expectAccessible, gotoApp, openMenu, tapItem } from './helpers';

// Maps, timelines, people profiles with family trees, and the harmony of the Gospels.

/** The map's current view, read from the transformed group: screen = map × s + (tx, ty). */
async function mapView(page: Page) {
  const transform = await page.locator('#map-view').getAttribute('transform');
  const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)\s*scale\(([-\d.]+)\)/.exec(transform ?? '');
  if (!m) throw new Error(`No map transform: ${transform}`);
  return { tx: Number(m[1]), ty: Number(m[2]), s: Number(m[3]) };
}

/** Page position of a longitude/latitude on the base map (k = 20, lat0 = 30°, bbox west 5, north 45). */
async function screenPoint(page: Page, lon: number, lat: number) {
  const v = await mapView(page);
  const box = (await page.getByTestId('map-surface').boundingBox())!;
  const x = (lon - 5) * Math.cos(Math.PI / 6) * 20;
  const y = (45 - lat) * 20;
  return { x: box.x + x * v.s + v.tx, y: box.y + y * v.s + v.ty };
}

test.describe('maps', () => {
  test('John 3 shows its places; tapping a place opens its verses', async ({ page }, info) => {
    await gotoApp(page, '/study/maps?ch=JHN.3');
    await expect(page.getByRole('heading', { name: 'Places in John 3' })).toBeVisible();
    for (const id of ['jerusalem', 'judea-1', 'aenon', 'salim', 'jordan']) {
      await expect(page.getByTestId(`place-${id}`)).toBeVisible();
    }
    // Chapter places are labelled on the map.
    await expect(page.getByTestId('map-label-jordan').last()).toBeAttached();
    await expect(page.getByTestId('history-credits')).toContainText('OpenBible.info');
    await expect(page.getByTestId('history-credits')).toContainText('Natural Earth');
    await expectAccessible(page, 'map: John 3');

    // Tap the Jordan's marker on the map itself.
    const p = await screenPoint(page, 35.558333, 31.761389);
    if (info.project.name === 'phone') await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
    const sheet = page.getByTestId('place-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Jordan', exact: true })).toBeVisible();
    await expect(page.getByTestId('place-confidence')).toHaveText('High confidence');
    await expect(sheet).toContainText('In John 3');
    // Every verse that names it, with KJV text, a page at a time.
    const first = page.getByTestId('place-verses-1032010');
    await expect(first).toContainText('Genesis 32:10');
    await expect(first).toContainText('with my staff I passed over this Jordan');
    await expect(page.getByTestId('place-verses-more')).toBeVisible();
    await expectAccessible(page, 'place sheet');
    await first.click();
    await expect(page).toHaveURL(/\/read\/gen\/32\?v=10$/);
  });

  test('the place list opens the same details (keyboard and screen readers)', async ({ page }) => {
    await gotoApp(page, '/study/maps?ch=JHN.3');
    await page.getByTestId('place-aenon').click();
    const sheet = page.getByTestId('place-sheet');
    await expect(sheet.getByRole('heading', { name: 'Aenon', exact: true })).toBeVisible();
    await expect(page.getByTestId('place-confidence')).toHaveText('Low confidence');
    await expect(page.getByTestId('place-verses-43003023')).toContainText('John 3:23');
    await page.getByTestId('place-sheet-close').click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId('place-aenon')).toHaveAttribute('aria-current', 'true');
  });

  test('zoom buttons zoom in, out, and reset', async ({ page }) => {
    await gotoApp(page, '/study/maps');
    const start = await mapView(page);
    await page.getByTestId('map-zoom-in').click();
    await expect.poll(async () => (await mapView(page)).s).toBeCloseTo(start.s * 1.6, 3);
    await page.getByTestId('map-zoom-in').click();
    await expect.poll(async () => (await mapView(page)).s).toBeCloseTo(start.s * 1.6 * 1.6, 3);
    await page.getByTestId('map-zoom-out').click();
    await expect.poll(async () => (await mapView(page)).s).toBeCloseTo(start.s * 1.6, 3);
    await page.getByTestId('map-reset').click();
    await expect.poll(async () => (await mapView(page)).s).toBeCloseTo(start.s, 4);
    await expectAccessible(page, 'map: all places');
  });

  test('the focused map pans with arrow keys and zooms with + and −', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'keyboard on desktop');
    await gotoApp(page, '/study/maps');
    const start = await mapView(page);
    await page.getByTestId('map-surface').focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await mapView(page)).tx).toBeCloseTo(start.tx + 80, 0);
    await page.keyboard.press('+');
    await expect.poll(async () => (await mapView(page)).s).toBeCloseTo(start.s * 1.6, 3);
    await page.keyboard.press('0');
    await expect.poll(async () => (await mapView(page)).s).toBeCloseTo(start.s, 4);
  });

  test('drag pans and the mouse wheel zooms', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'mouse wheel and drag on desktop');
    await gotoApp(page, '/study/maps');
    const box = (await page.getByTestId('map-surface').boundingBox())!;
    const start = await mapView(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 40, { steps: 8 });
    await page.mouse.up();
    const panned = await mapView(page);
    expect(panned.tx).toBeCloseTo(start.tx - 120, 0);
    expect(panned.ty).toBeCloseTo(start.ty - 40, 0);
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => (await mapView(page)).s).toBeGreaterThan(start.s * 1.2);
  });

  test('touch: one finger pans, two fingers pinch-zoom, without scrolling the page', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'phone', 'touch gestures on the phone');
    await gotoApp(page, '/study/maps');
    const box = (await page.getByTestId('map-surface').boundingBox())!;
    const cdp = await context.newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: [number, number][]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
    const start = await mapView(page);
    await touch('touchStart', [[cx, cy]]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[cx - i * 10, cy - i * 5]]);
    await touch('touchEnd', []);
    const panned = await mapView(page);
    expect(panned.tx).toBeCloseTo(start.tx - 80, 0);
    expect(panned.ty).toBeCloseTo(start.ty - 40, 0);
    expect((await page.getByTestId('map-surface').boundingBox())!.y).toBeCloseTo(box.y, 0);
    await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[cx - 30 - i * 10, cy], [cx + 30 + i * 10, cy]]);
    await touch('touchEnd', []);
    expect((await mapView(page)).s).toBeGreaterThan(start.s * 2);
  });

  test('every place is listed and filterable; ?place= focuses one place', async ({ page }) => {
    await gotoApp(page, '/study/maps');
    await page.getByTestId('place-filter').fill('bethle');
    await expect(page.getByTestId('place-bethlehem-1')).toBeVisible();
    await expect(page).toHaveURL(/q=bethle/);
    await gotoApp(page, '/study/maps?place=bethlehem-1');
    await expect(page.getByTestId('map-label-bethlehem-1').last()).toBeAttached();
    expect((await mapView(page)).s).toBeGreaterThan(10);
  });
});

test.describe('timeline', () => {
  test('kings and prophets: Rehoboam in Judah, Isaiah among the prophets', async ({ page }) => {
    await gotoApp(page, '/study/timeline');
    await expect(page.getByRole('heading', { name: 'Timeline', level: 1 })).toBeVisible();
    await expect(page.getByTestId('lane-judah')).toContainText('Rehoboam');
    await expect(page.getByTestId('lane-prophet')).toContainText('Isaiah');
    await expect(page.getByTestId('lane-israel')).toContainText('Jeroboam I');
    await expect(page.getByTestId('lane-united')).toContainText('David');
    await expect(page.getByTestId('history-credits')).toContainText('Theographic');
    await expect(page.getByTestId('history-credits')).toContainText('approximate');
    await expectAccessible(page, 'timeline: kings');

    await page.getByTestId('ruler-rehoboam_2412').click();
    const sheet = page.getByTestId('ruler-sheet');
    await expect(sheet).toContainText('Ruler of Judah');
    await expect(sheet).toContainText('c. 975–958 BC');
    await expect(sheet.getByRole('link', { name: '1 Kings 12:17–24' })).toBeVisible();
    await page.getByTestId('ruler-profile').click();
    await expect(page).toHaveURL(/\/study\/people\/rehoboam_2412$/);
  });

  test('the lane chart zooms', async ({ page }) => {
    await gotoApp(page, '/study/timeline');
    const bar = page.getByTestId('ruler-isaiah_617');
    const before = (await bar.boundingBox())!.width;
    await page.getByTestId('timeline-zoom-in').click();
    await expect.poll(async () => (await bar.boundingBox())!.width).toBeGreaterThan(before);
  });

  test('events are grouped by era with links to people, places, and passages', async ({ page }) => {
    await gotoApp(page, '/study/timeline');
    await page.getByTestId('timeline-view-events').click();
    await expect(page).toHaveURL(/view=events/);
    // One era at a time, starting at the beginning.
    await expect(page.getByTestId('era-beginnings')).toBeVisible();
    await expect(page.getByTestId('event-creation-of-all-things')).toContainText('c. 4004 BC');
    await expect(page.getByTestId('era-link-beginnings')).toHaveAttribute('aria-current', 'true');
    await page.getByTestId('era-link-united').click();
    await expect(page).toHaveURL(/era=united/);
    await expect(page.getByTestId('era-united')).toBeVisible();
    const david = page.getByTestId('event-reign-of-david');
    await expect(david).toContainText('c. 1055–1015 BC');
    await expect(david.getByRole('link', { name: 'David' })).toHaveAttribute('href', '/study/people/david_994');
    await expect(david.getByRole('link', { name: 'Hebron' })).toHaveAttribute('href', '/study/maps?place=hebron');
    await expect(david.getByRole('link', { name: '2 Sam 2:1–24:25' })).toHaveAttribute('href', '/read/2sa/2?v=1');
    await expectAccessible(page, 'timeline: events');
    await page.getByTestId('era-next').click();
    await expect(page).toHaveURL(/era=divided/);
    await expect(page.getByTestId('event-reign-of-rehoboam')).toBeVisible();
    await gotoApp(page, '/study/timeline?view=events&era=church');
    await expect(page.getByTestId('event-the-holy-spirit-comes')).toBeVisible();
  });

  test('a link to one event highlights it', async ({ page }) => {
    await gotoApp(page, '/study/timeline?event=reign-of-rehoboam');
    const row = page.getByTestId('event-reign-of-rehoboam');
    await expect(row).toHaveAttribute('aria-current', 'true');
    await expect(row).toBeInViewport();
  });
});

test.describe('people', () => {
  test('the index filters by name and shows titles and verse counts', async ({ page }) => {
    await gotoApp(page, '/study/people');
    await page.getByTestId('people-filter').fill('david');
    const row = page.getByTestId('person-david_994');
    await expect(row).toContainText('896 verses');
    await expect(page.getByTestId('people-list').getByRole('link').first()).toHaveAttribute('href', '/study/people/david_994');
    await page.getByTestId('people-filter').fill('jesus');
    await expect(page.getByTestId('person-jesus_905')).toContainText('son of Joseph');
    await expectAccessible(page, 'people index');
    await page.getByTestId('person-jesus_905').click();
    await expect(page).toHaveURL(/\/study\/people\/jesus_905$/);
  });

  test('David: Jesse as father, a family tree, and every mention', async ({ page }) => {
    await gotoApp(page, '/study/people/david_994');
    await expect(page.getByRole('heading', { name: 'David', level: 1 })).toBeVisible();
    await expect(page.getByTestId('person-years')).toHaveText('Born c. 1085 BC · Died c. 1015 BC');
    const tree = page.getByTestId('family-tree');
    await expect(tree).toBeVisible();
    const parents = page.getByTestId('tree-gen-parents');
    await expect(parents.getByTestId('tree-jesse_903')).toContainText('Jesse');
    await expect(parents.getByTestId('tree-jesse_903')).toContainText('father');
    await expect(page.getByTestId('tree-self')).toContainText('David');
    await expect(tree.getByTestId('tree-solomon_2762')).toBeVisible();
    // Outer generations load on demand: Obed above, Rehoboam below.
    await expect(page.getByTestId('tree-gen-grandparents').getByTestId('tree-obed_2228')).toBeVisible();
    await expect(page.getByTestId('tree-gen-grandchildren').getByTestId('tree-rehoboam_2412')).toBeVisible();
    await expect(page.getByTestId('person-dict')).toContainText('youngest son of Jesse');
    const verses = page.getByTestId('person-verses');
    await expect(verses).toContainText('Showing 20 of 896');
    await expect(page.getByTestId('person-verses-8004017')).toContainText('Ruth 4:17');
    await expect(page.getByTestId('person-events')).toContainText('Reign of David');
    await expectAccessible(page, 'profile: David');

    await page.getByTestId('person-verses-more').click();
    await expect(verses).toContainText('Showing 40 of 896');
    await parents.getByTestId('tree-jesse_903').click();
    await expect(page).toHaveURL(/\/study\/people\/jesse_903$/);
    await expect(page.getByRole('heading', { name: 'Jesse', level: 1 })).toBeVisible();
    await expect(page.getByTestId('tree-gen-children').getByTestId('tree-david_994')).toBeVisible();
  });

  test('profile events link to the timeline', async ({ page }) => {
    await gotoApp(page, '/study/people/david_994');
    await page.getByTestId('person-event-reign-of-david').click();
    await expect(page).toHaveURL(/\/study\/timeline\?view=events&event=reign-of-david$/);
    await expect(page.getByTestId('event-reign-of-david')).toHaveAttribute('aria-current', 'true');
  });
});

test.describe('harmony of the Gospels', () => {
  test('lists the parts and sections and filters them', async ({ page }) => {
    await gotoApp(page, '/study/harmony');
    await expect(page.getByRole('heading', { name: 'Part I. The Sources of the Gospels' })).toBeVisible();
    await page.getByTestId('harmony-filter').fill('baptized by john');
    await expect(page.getByTestId('harmony-section-24')).toBeVisible();
    await expect(page.getByTestId('harmony-section-1')).toHaveCount(0);
    await expectAccessible(page, 'harmony index');
  });

  test('section 1 shows Luke 1:1–4 in the KJV', async ({ page }) => {
    await gotoApp(page, '/study/harmony/1');
    await expect(page.getByRole('heading', { name: /In the Dedication Luke Explains His Method/, level: 1 })).toBeVisible();
    const luke = page.getByTestId('harmony-text-LUK');
    await expect(luke).toContainText('Forasmuch as many have taken in hand to set forth in order a declaration');
    await expect(luke).toContainText('That thou mightest know the certainty of those things');
    await expect(luke.getByRole('link', { name: 'Luke 1:1–4' })).toHaveAttribute('href', '/read/luk/1?v=1');
    await expect(page.getByTestId('harmony-MAT')).toHaveCount(0);
    await expect(page.getByTestId('harmony-next').first()).toHaveAttribute('href', '/study/harmony/2');
    await expect(page.getByTestId('harmony-prev')).toHaveCount(0);
    await expect(page.getByTestId('history-credits')).toContainText('Robertson');
    await expectAccessible(page, 'harmony section 1');
  });

  test('parallel accounts are side by side on desktop and stacked on a phone', async ({ page }, info) => {
    await gotoApp(page, '/study/harmony/24');
    const boxes = await Promise.all(['MAT', 'MRK', 'LUK'].map(async (g) => (await page.getByTestId(`harmony-${g}`).boundingBox())!));
    if (info.project.name === 'desktop') {
      expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(2);
      expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width - 1);
    } else {
      expect(boxes[1].y).toBeGreaterThan(boxes[0].y + boxes[0].height - 1);
      expect(boxes[2].y).toBeGreaterThan(boxes[1].y + boxes[1].height - 1);
    }
    await expect(page.getByRole('heading', { name: 'Mark', level: 2 })).toBeVisible();
    await expect(page.getByTestId('harmony-text-MRK')).toContainText('baptized of John in Jordan');
    await expectAccessible(page, 'harmony section 24');
  });

  test('the Harmony verse tool opens the section for a Gospel verse', async ({ page }) => {
    await gotoApp(page, '/read/luk/1');
    await page.getByTestId('verse-num-2').click();
    await page.getByTestId('verse-action-harmony').click();
    await expect(page).toHaveURL(/\/study\/harmony\/1$/);
  });

  test('a verse in two sections lists both; non-Gospel verses get no Harmony tool', async ({ page }) => {
    await gotoApp(page, '/read/luk/3');
    await page.getByTestId('verse-num-23').click();
    await page.getByTestId('verse-action-harmony').click();
    await expect(page).toHaveURL(/\/study\/harmony\?v=LUK\.3\.23$/);
    await expect(page.getByTestId('harmony-for-verse')).toContainText('Sections that include Luke 3:23');
    await expect(page.getByTestId('harmony-section-3')).toBeVisible();
    await expect(page.getByTestId('harmony-section-24')).toBeVisible();
    await gotoApp(page, '/read/act/1');
    await page.getByTestId('verse-num-1').click();
    await expect(page.getByTestId('verse-sheet')).toBeVisible();
    await expect(page.getByTestId('verse-action-harmony')).toHaveCount(0);
  });
});

test.describe('history menu items', () => {
  test('Study → This passage → Places opens the chapter map', async ({ page }) => {
    await gotoApp(page, '/read/jhn/3');
    await openMenu(page, 'main-menu');
    await tapItem(page, 'main-menu', 'study');
    await tapItem(page, 'main-menu', 'study.passage');
    await tapItem(page, 'main-menu', 'study.places');
    await expect(page).toHaveURL(/\/study\/maps\?ch=JHN\.3$/);
  });

  test('Study → Reference has Maps, Timeline, and People; Study has Harmony', async ({ page }) => {
    await gotoApp(page, '/');
    await openMenu(page, 'main-menu');
    await tapItem(page, 'main-menu', 'study');
    await expect(page.getByTestId('main-menu-item-study.harmony')).toBeVisible();
    await tapItem(page, 'main-menu', 'study.reference');
    for (const id of ['study.maps', 'study.timeline', 'study.people']) {
      await expect(page.getByTestId(`main-menu-item-${id}`)).toBeVisible();
    }
    await tapItem(page, 'main-menu', 'study.timeline');
    await expect(page).toHaveURL(/\/study\/timeline$/);
  });
});
