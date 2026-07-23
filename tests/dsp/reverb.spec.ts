import { test, expect } from '@playwright/test'

test('reverb produces a tail after the first second', async ({ page }) => {
  await page.goto('/harness.html')
  const { early, tail } = (await page.evaluate('window.testReverbTail()')) as {
    early: number
    tail: number
  }
  expect(early).toBeGreaterThan(0)
  expect(tail).toBeGreaterThan(0.000001)
})

test('mix 0 is effectively dry', async ({ page }) => {
  await page.goto('/harness.html')
  const tail = (await page.evaluate('window.testDryOnly()')) as number
  expect(tail).toBeLessThan(0.001)
})
