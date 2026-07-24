import { test, expect } from '@playwright/test'

test('the real chain (buildChain + autotune node) carries a single signal path', async ({
  page
}) => {
  await page.goto('/harness.html')
  const { outputRms, inputRms, outputHz } = (await page.evaluate(
    'window.testChainSinglePath()'
  )) as { outputRms: number; inputRms: number; outputHz: number }
  // a doubled path (raw source summed with the worklet output) reads ~2x RMS
  expect(outputRms / inputRms).toBeGreaterThan(0.6)
  expect(outputRms / inputRms).toBeLessThan(1.4)
  expect(Math.abs(outputHz - 449)).toBeLessThan(4)
})
