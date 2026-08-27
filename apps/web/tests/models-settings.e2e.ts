// Web e2e scenario: the Models settings page end to end through the real
// wire, under the provider-UI lockdown (ui-settings-models/src/client/lockdown.ts).
// The catalog add path renders disabled with the policy notice; the one
// configurable thing is a hand-declared local LiteLLM gateway. The custom card
// refuses an external endpoint and accepts the localhost one; a blank key
// saves a reference-free profile for gateway-native auth, and typing an API
// key later stores it write-only under the derived reference
// (`LITELLM_API_KEY`) while the settings document records only that
// reference. The customized-settings fold writes its curated fields — the
// endpoint, and the declared route's own name and protocol (OpenAI-shaped
// only: the lockdown narrows the select, while the schema keeps accepting the
// full union for settings.yaml routes) — as merge patches against the stored
// profile. Zero model calls: configuration is pure settings/credentials/
// llm-domain traffic, so there is no fixture and a stray stream would fail
// loud because the adapter registry is empty. The deletion dialog
// distinguishes a reference-free profile from a page-managed key before the
// credential and settings unsets reach the wire.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/models-settings', import.meta.url))
const EMPTY_EXPECTED = join(SNAPSHOT_DIR, 'empty.expected.md')
const CONFIGURED_EXPECTED = join(SNAPSHOT_DIR, 'configured.expected.md')
const DECLARED_EXPECTED = join(SNAPSHOT_DIR, 'declared.expected.md')
const DECLARED_EDIT_EXPECTED = join(SNAPSHOT_DIR, 'declared-edit.expected.md')
const NATIVE_DELETE_EXPECTED = join(SNAPSHOT_DIR, 'native-delete.expected.md')
const DELETE_EXPECTED = join(SNAPSHOT_DIR, 'delete.expected.md')
const MODE = webSnapshotMode()

describe('web e2e: Models settings page configures only the local gateway', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('locks the catalog add path behind the policy notice', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-empty'))
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Models', exact: true }).click()
    await dialog.getByText('Enter your API keys to use models from the following providers.').waitFor({ timeout: 10_000 })
    // The lockdown notice names the one thing this page may configure.
    await dialog.getByText(/only a local LiteLLM gateway/).waitFor({ timeout: 10_000 })
    // The dormant pi-ai catalog still exists behind the wire, but adopting a
    // vendor from it is not clickable under the lockdown.
    const add = dialog.getByRole('button', { name: 'Add provider', exact: true })
    await add.waitFor({ timeout: 10_000 })
    expect(await add.isEnabled()).toBe(false)
    // The custom path stays open — it is how the local gateway is declared.
    const declare = dialog.getByRole('button', { name: 'Add a custom provider', exact: true })
    await expect.poll(async () => declare.isEnabled(), { timeout: 10_000 }).toBe(true)
    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(EMPTY_EXPECTED, snapshot, MODE)
  }, 60_000)

  it('refuses an external endpoint and a key no HTTP header can carry', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-declare-guards'))
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByRole('button', { name: 'Add a custom provider', exact: true }).click()
    await dialog.getByLabel('Provider ID').fill('litellm')
    await dialog.getByLabel('Display name', { exact: true }).fill('LiteLLM')
    await dialog.getByRole('button', { name: 'Add model', exact: true }).click()
    await dialog.getByLabel('Model ID 1', { exact: true }).fill('gpt-local')
    const create = dialog.getByRole('button', { name: 'Create provider', exact: true })

    // An external gateway is refused where it is typed, before any write.
    await dialog.getByLabel('Base URL', { exact: true }).fill('https://gateway.acme.example/v1')
    await dialog.getByText(/Only a localhost LiteLLM endpoint/).waitFor({ timeout: 10_000 })
    await expect.poll(async () => create.isEnabled(), { timeout: 10_000 }).toBe(false)
    await dialog.getByLabel('Base URL', { exact: true }).fill('http://127.0.0.1:4000/v1')
    expect(await dialog.getByText(/Only a localhost LiteLLM endpoint/).count()).toBe(0)

    // A key no HTTP header can carry would save cleanly and fail the first
    // turn with a ByteString TypeError; the form names the offending field.
    const key = dialog.getByLabel('API key', { exact: true })
    await key.fill('sk-\u{1F600}litellm')
    await dialog.getByText('This API key is not in a valid format. Please check it.').waitFor({ timeout: 10_000 })
    await expect.poll(async () => create.isEnabled(), { timeout: 10_000 }).toBe(false)
    await key.fill('')
    await expect.poll(async () => create.isEnabled(), { timeout: 10_000 }).toBe(true)
  }, 60_000)

  it('creates the local gateway keyless as a reference-free profile', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-native-auth'))
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByRole('button', { name: 'Create provider', exact: true }).click()
    const row = dialog.getByText('LiteLLM', { exact: true }).first()
    await row.waitFor({ timeout: 10_000 })
    // The tag follows the adapter's installed catalog: this route is in none.
    const rowCard = dialog.locator('li').filter({ hasText: 'LiteLLM' }).first()
    await expect.poll(async () => rowCard.getByText('Custom', { exact: true }).count(), { timeout: 10_000 }).toBe(1)
    expect(await dialog.getByRole('img', { name: 'API key configured' }).count()).toBe(0)
    expect(await dialog.getByRole('img', { name: 'API key missing' }).count()).toBe(0)
    const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(document).toContain('litellm:')
    expect(document).toContain('baseURL: http://127.0.0.1:4000/v1')
    expect(document).not.toContain('LITELLM_API_KEY')
    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(DECLARED_EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('describes reference-free deletion without claiming a credential exists', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-native-delete'))
    const settingsDialog = page.getByRole('dialog', { name: 'Settings' })
    await settingsDialog.getByRole('button', { name: 'Delete LiteLLM (litellm)', exact: true }).click()
    const deleteDialog = page.getByRole('dialog', { name: 'Delete LiteLLM (litellm)?' })
    await deleteDialog.waitFor({ timeout: 10_000 })
    const snapshot = await captureStableAria(
      page,
      '[role="dialog"][aria-label="Delete LiteLLM (litellm)?"]',
      scaffold.workspaceCwd,
    )
    await compareOrRefreshGolden(NATIVE_DELETE_EXPECTED, snapshot, MODE)
    await deleteDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  }, 60_000)

  it('stores the key under the derived reference and keeps the route live', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-add'))
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByRole('button', { name: 'Edit LiteLLM (litellm)', exact: true }).click()
    await dialog.getByRole('textbox', { name: 'API key', exact: true }).fill('sk-e2e-litellm')
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
    // The profile lands in settings.yaml with only the derived reference, the
    // key value lands in the harness home's .credentials.yaml, and the
    // topology frame invalidates the page into the row.
    await expect.poll(
      async () => dialog.getByRole('textbox', { name: 'API key', exact: true }).count(),
      { timeout: 10_000 },
    ).toBe(0)
    await dialog.getByRole('img', { name: 'API key configured' }).waitFor({ timeout: 10_000 })
    await dialog.getByText('Saved LiteLLM (litellm).', { exact: true }).waitFor({ timeout: 10_000 })
    const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(document).toContain('litellm:')
    expect(document).toContain('apiKeyEnv: LITELLM_API_KEY')
    expect(document).not.toContain('sk-e2e-litellm')
    const credentialFile = join(scaffold.harnessHome, '.credentials.yaml')
    await expect.poll(
      async () => readFile(credentialFile, 'utf8').catch(() => ''),
      { timeout: 10_000 },
    ).toContain('LITELLM_API_KEY: sk-e2e-litellm')
    expect(await page.content()).not.toContain('sk-e2e-litellm')
  }, 60_000)

  it('applies a customized-settings field as a merge patch, still localhost-only', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-customized'))
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByRole('button', { name: 'Edit LiteLLM (litellm)', exact: true }).click()
    await dialog.getByText('Customized settings').click()
    const url = dialog.getByLabel('Base URL', { exact: true })
    await url.waitFor({ timeout: 10_000 })
    // The lockdown holds in the editor too: an external endpoint blocks the
    // apply where it is typed.
    await url.fill('https://gateway.litellm.example/v1')
    await dialog.getByText(/Only a localhost LiteLLM endpoint/).waitFor({ timeout: 10_000 })
    const save = dialog.getByRole('button', { name: 'Apply', exact: true })
    await expect.poll(async () => save.isEnabled(), { timeout: 10_000 }).toBe(false)
    await url.fill('http://127.0.0.1:4100/v1')
    await expect.poll(async () => save.isEnabled(), { timeout: 10_000 }).toBe(true)
    await save.click()
    // The editor closes back to the row; the fold's write merged into the
    // stored profile beside the reference.
    await expect.poll(async () => dialog.getByLabel('Base URL', { exact: true }).count(), { timeout: 10_000 }).toBe(0)
    await dialog.getByText('Saved LiteLLM (litellm).', { exact: true }).waitFor({ timeout: 10_000 })
    const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(document).toContain('baseURL: http://127.0.0.1:4100/v1')
    expect(document).toContain('apiKeyEnv: LITELLM_API_KEY')
    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(CONFIGURED_EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('reopens the name and protocol, offering only the OpenAI-shaped choices', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-declared-identity'))
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByRole('button', { name: 'Edit LiteLLM (litellm)', exact: true }).click()
    await dialog.getByText('Customized settings').click()
    // The create card asked this route for a name and a protocol because
    // nothing can default them; the editor reaches the same two fields.
    const protocol = dialog.getByLabel('API protocol', { exact: true })
    await protocol.waitFor({ timeout: 10_000 })
    expect(await protocol.inputValue()).toBe('openai-completions')
    // Under the lockdown the select narrows to what LiteLLM speaks; the
    // schema (and settings.yaml) still accepts the full union.
    const options = await protocol.locator('option').allTextContents()
    expect(options).toContain('openai-responses')
    expect(options).not.toContain('anthropic-messages')
    const name = dialog.getByLabel('Display name', { exact: true })
    expect(await name.inputValue()).toBe('LiteLLM')
    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(DECLARED_EDIT_EXPECTED, snapshot, MODE)

    await protocol.selectOption('openai-responses')
    await name.fill('LiteLLM Relay')
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect.poll(async () => dialog.getByLabel('API protocol', { exact: true }).count(), { timeout: 10_000 }).toBe(0)
    // The adapter re-resolved the route under the new protocol and
    // re-registered it under the new name.
    await dialog.getByText('LiteLLM Relay', { exact: true }).first().waitFor({ timeout: 10_000 })
    await dialog.getByText('Saved LiteLLM Relay (litellm).', { exact: true }).waitFor({ timeout: 10_000 })
    const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(document).toContain('api: openai-responses')
    expect(document).toContain('displayName: LiteLLM Relay')
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('confirms an identified provider deletion before removing its profile and key', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-delete'))
    const settingsDialog = page.getByRole('dialog', { name: 'Settings' })
    await settingsDialog.getByRole('button', { name: 'Delete LiteLLM Relay (litellm)', exact: true }).click()
    const deleteDialog = page.getByRole('dialog', { name: 'Delete LiteLLM Relay (litellm)?' })
    await deleteDialog.waitFor({ timeout: 10_000 })
    const snapshot = await captureStableAria(
      page,
      '[role="dialog"][aria-label="Delete LiteLLM Relay (litellm)?"]',
      scaffold.workspaceCwd,
    )
    await compareOrRefreshGolden(DELETE_EXPECTED, snapshot, MODE)

    await deleteDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')).toContain('litellm:')
    await settingsDialog.getByRole('button', { name: 'Delete LiteLLM Relay (litellm)', exact: true }).click()
    await page.getByRole('dialog', { name: 'Delete LiteLLM Relay (litellm)?' })
      .getByRole('button', { name: 'Delete LiteLLM Relay (litellm)', exact: true }).click()
    await expect.poll(
      async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'),
      { timeout: 10_000 },
    ).not.toContain('litellm:')
    expect(await readFile(join(scaffold.harnessHome, '.credentials.yaml'), 'utf8'))
      .not.toContain('LITELLM_API_KEY')
    await expect.poll(
      async () => page.getByRole('dialog', { name: 'Delete LiteLLM Relay (litellm)?' }).count(),
      { timeout: 10_000 },
    ).toBe(0)
    await page.keyboard.press('Escape')
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, [
      'configured.expected.md', 'declared-edit.expected.md', 'declared.expected.md',
      'delete.expected.md', 'empty.expected.md', 'native-delete.expected.md',
    ])
  })
})
