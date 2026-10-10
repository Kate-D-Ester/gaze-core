const { chromium } = require("playwright")

async function checkBrowserProbe() {
  const launchOptions = { headless: true }
  if (process.env.GAZE_PROBE_BROWSER) {
    launchOptions.executablePath = process.env.GAZE_PROBE_BROWSER
  }
  const browser = await chromium.launch(launchOptions)
  try {
    const context = await browser.newContext()
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).hostname === "127.0.0.1") {
        return route.continue()
      }
      return route.abort()
    })
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.goto("http://127.0.0.1:4057/")
    await page.waitForFunction(
      () => typeof globalThis.runBrowserGazeProbe === "function"
    )
    const result = await page.evaluate(() => globalThis.runBrowserGazeProbe())
    if (errors.length) {
      throw new Error(errors.join("\n"))
    }
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await browser.close()
  }
}

checkBrowserProbe().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
