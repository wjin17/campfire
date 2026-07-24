import { test, expect } from '@playwright/test'

test('tuner detects a 449Hz tone while correction is bypassed', async ({ page }) => {
  await page.goto('/harness.html')
  const { medianSemitones, pitchCount, outputHz } = (await page.evaluate(
    'window.testTunerPitch()'
  )) as { medianSemitones: number; pitchCount: number; outputHz: number }
  expect(pitchCount).toBeGreaterThan(0)
  expect(Math.abs(medianSemitones - 0.351)).toBeLessThan(0.1)
  expect(Math.abs(outputHz - 449)).toBeLessThan(4)
})
