// @ts-check
const {defineConfig,devices}=require('@playwright/test');
// Cross-browser semantic smoke (T28, T-REQ-046): chromium/firefox/webkit
// projects for tests/cross-browser/**; every other suite keeps running
// against pinned Chromium only (deterministic geometry/visual assertions
// are not meaningful across rendering engines). Firefox/webkit only get the
// launchOptions executablePath override on non-CI runs where Chromium's is
// pinned to the pre-installed binary; those two engines use Playwright's own
// managed install path, which must already be present on the machine.
module.exports=defineConfig({testDir:'./tests',timeout:45_000,expect:{timeout:8_000},fullyParallel:false,workers:1,retries:0,reporter:[['list'],['html',{open:'never',outputFolder:'playwright-report'}]],outputDir:'test-results/playwright',use:{baseURL:'http://127.0.0.1:4173',browserName:'chromium',trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:process.env.CI?{}:{executablePath:'/opt/pw-browsers/chromium'}},projects:[{name:'chromium',use:{...devices['Desktop Chrome']}},{name:'firefox',use:{...devices['Desktop Firefox'],browserName:'firefox',launchOptions:{}}},{name:'webkit',use:{...devices['Desktop Safari'],browserName:'webkit',launchOptions:{}}}],webServer:{command:'node tests/static-server.cjs',url:'http://127.0.0.1:4173',reuseExistingServer:false,timeout:20_000}});
