import { expect, test } from '@playwright/test'
import {
  clearAndSeedWorkspace,
  dragLocatorTo,
  launchApp,
  seededWorkspaceId,
} from './workspace-canvas.helpers'
import type { RoleNodeData } from '../../src/contexts/workspace/presentation/renderer/types'

function createRoleData(options: {
  roleId: string
  roleName: string
  promptTemplate: string
}): RoleNodeData {
  return {
    roleId: options.roleId,
    roleName: options.roleName,
    roleDescription: '',
    promptTemplate: options.promptTemplate,
    inputHint: '',
    outputFormat: '',
    input: '',
    selectedProvider: 'codex',
    linkedAgentNodeId: null,
    runHistory: [],
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
  }
}

test.describe('Workspace Canvas - Role Workflow', () => {
  test('connects roles even when the drag starts from the input handle', async () => {
    const { electronApp, window } = await launchApp({
      windowMode: 'offscreen',
      env: {
        OPENCOVE_TEST_ENABLE_SESSION_STATE_WATCHER: '1',
        OPENCOVE_TEST_AGENT_SESSION_SCENARIO: 'codex-standby-no-newline',
      },
    })

    try {
      await clearAndSeedWorkspace(
        window,
        [
          {
            id: 'role-a',
            title: 'Role A',
            position: { x: 160, y: 150 },
            width: 360,
            height: 320,
            kind: 'role',
            status: null,
            task: createRoleData({
              roleId: 'project-role-a',
              roleName: 'Role A',
              promptTemplate: 'Turn the user input into a concise handoff.',
            }),
          },
          {
            id: 'role-b',
            title: 'Role B',
            position: { x: 650, y: 150 },
            width: 360,
            height: 320,
            kind: 'role',
            status: null,
            task: createRoleData({
              roleId: 'project-role-b',
              roleName: 'Role B',
              promptTemplate: 'Use the handoff to continue the work.',
            }),
          },
        ],
        {
          settings: {
            defaultProvider: 'codex',
          },
        },
      )

      const roleNodes = window.locator('.role-node')
      const roleA = roleNodes.filter({ hasText: 'Role A' })
      const roleB = roleNodes.filter({ hasText: 'Role B' })
      await expect(roleA).toBeVisible()
      await expect(roleB).toBeVisible()

      await dragLocatorTo(
        window,
        roleB.locator('.role-node__connection--input'),
        roleA.locator('.role-node__connection--output'),
        { steps: 18, settleBeforeTriggerMs: 80 },
      )
      await expect(window.locator('.workspace-role-workflow-edge')).toHaveCount(1)

      await roleA.locator('[data-testid="role-node-input"]').fill('Initial brief')
      await roleA.locator('[data-testid="role-node-run"]').click()

      await expect(roleB.locator('[data-testid="role-node-input"]')).toHaveValue('All set.', {
        timeout: 20_000,
      })
    } finally {
      await electronApp.close()
    }
  })

  test('connects two roles and runs downstream with upstream output', async () => {
    const { electronApp, window } = await launchApp({
      windowMode: 'offscreen',
      env: {
        OPENCOVE_TEST_ENABLE_SESSION_STATE_WATCHER: '1',
        OPENCOVE_TEST_AGENT_SESSION_SCENARIO: 'codex-standby-no-newline',
      },
    })

    try {
      await clearAndSeedWorkspace(
        window,
        [
          {
            id: 'role-a',
            title: 'Role A',
            position: { x: 160, y: 150 },
            width: 360,
            height: 320,
            kind: 'role',
            status: null,
            task: createRoleData({
              roleId: 'project-role-a',
              roleName: 'Role A',
              promptTemplate: 'Turn the user input into a concise handoff.',
            }),
          },
          {
            id: 'role-b',
            title: 'Role B',
            position: { x: 650, y: 150 },
            width: 360,
            height: 320,
            kind: 'role',
            status: null,
            task: createRoleData({
              roleId: 'project-role-b',
              roleName: 'Role B',
              promptTemplate: 'Use the handoff to continue the work.',
            }),
          },
        ],
        {
          settings: {
            defaultProvider: 'codex',
            projectRolesByWorkspaceId: {
              [seededWorkspaceId]: [
                {
                  id: 'project-role-a',
                  name: 'Role A',
                  description: '',
                  promptTemplate: 'Turn the user input into a concise handoff.',
                  inputHint: '',
                  outputFormat: '',
                  createdAt: '2026-05-10T00:00:00.000Z',
                  updatedAt: '2026-05-10T00:00:00.000Z',
                },
                {
                  id: 'project-role-b',
                  name: 'Role B',
                  description: '',
                  promptTemplate: 'Use the handoff to continue the work.',
                  inputHint: '',
                  outputFormat: '',
                  createdAt: '2026-05-10T00:00:00.000Z',
                  updatedAt: '2026-05-10T00:00:00.000Z',
                },
              ],
            },
          },
        },
      )

      const roleNodes = window.locator('.role-node')
      const roleA = roleNodes.filter({ hasText: 'Role A' })
      const roleB = roleNodes.filter({ hasText: 'Role B' })
      await expect(roleA).toBeVisible()
      await expect(roleB).toBeVisible()

      await dragLocatorTo(
        window,
        roleA.locator('.role-node__connection--output'),
        roleB.locator('.role-node__connection--input'),
        { steps: 18, settleBeforeTriggerMs: 80 },
      )
      await expect(window.locator('.workspace-role-workflow-edge')).toHaveCount(1)

      await roleA.locator('[data-testid="role-node-input"]').fill('Initial brief')
      await roleA.locator('[data-testid="role-node-run"]').click()

      await expect(roleB.locator('[data-testid="role-node-input"]')).toHaveValue('All set.', {
        timeout: 20_000,
      })
      await expect
        .poll(async () => await window.locator('.terminal-node').count())
        .toBeGreaterThanOrEqual(2)

      await expect
        .poll(async () => {
          return await window.evaluate(async () => {
            const raw = await window.opencoveApi.persistence.readWorkspaceStateRaw()
            if (!raw) {
              return null
            }

            const parsed = JSON.parse(raw) as {
              workspaces?: Array<{
                nodes?: Array<{
                  id?: string
                  task?: {
                    input?: string
                    runHistory?: Array<{
                      input?: string
                      triggeredByRunId?: string | null
                    }>
                  } | null
                }>
              }>
            }
            const roleBNode = parsed.workspaces?.[0]?.nodes?.find(node => node.id === 'role-b')
            const latestRun = roleBNode?.task?.runHistory?.[0]
            return {
              input: roleBNode?.task?.input ?? null,
              latestRunInput: latestRun?.input ?? null,
              triggeredByRunId: latestRun?.triggeredByRunId ?? null,
            }
          })
        })
        .toMatchObject({
          input: 'All set.',
          latestRunInput: 'All set.',
          triggeredByRunId: expect.any(String),
        })
    } finally {
      await electronApp.close()
    }
  })
})
