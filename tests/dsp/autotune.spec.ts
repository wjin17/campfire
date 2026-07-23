import { test, expect } from '@playwright/test'

test('autotune snaps a 449Hz tone toward A440', async ({ page }) => {
  await page.goto('/harness.html')
  const { outputHz } = (await page.evaluate('window.testAutotuneSnap()')) as { outputHz: number }
  expect(Math.abs(outputHz - 440)).toBeLessThan(Math.abs(outputHz - 449))
  expect(Math.abs(outputHz - 440)).toBeLessThan(4)
})
