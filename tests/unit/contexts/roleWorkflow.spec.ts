import { describe, expect, it } from 'vitest'
import type { RoleWorkflowLink } from '../../../src/contexts/workspace/presentation/renderer/types'
import {
  ROLE_WORKFLOW_INPUT_HANDLE_ID,
  ROLE_WORKFLOW_OUTPUT_HANDLE_ID,
  resolveRoleWorkflowConnection,
  sanitizeRoleWorkflowLinks,
  validateRoleWorkflowConnection,
} from '../../../src/contexts/workspace/presentation/renderer/utils/roleWorkflow'

const roleNode = (id: string) => ({
  id,
  kind: 'role' as const,
})

const taskNode = (id: string) => ({
  id,
  kind: 'task' as const,
})

const link = (sourceRoleNodeId: string, targetRoleNodeId: string): RoleWorkflowLink => ({
  id: `link-${sourceRoleNodeId}-${targetRoleNodeId}`,
  sourceRoleNodeId,
  targetRoleNodeId,
  mode: 'auto',
  createdAt: '2026-05-10T00:00:00.000Z',
  updatedAt: '2026-05-10T00:00:00.000Z',
})

describe('role workflow links', () => {
  it('allows a role output to connect to another role input', () => {
    expect(
      validateRoleWorkflowConnection({
        sourceRoleNodeId: 'role-a',
        targetRoleNodeId: 'role-b',
        nodes: [roleNode('role-a'), roleNode('role-b')],
        links: [],
      }),
    ).toEqual({ ok: true })
  })

  it('normalizes reverse handle drags into output-to-input workflow direction', () => {
    expect(
      resolveRoleWorkflowConnection({
        source: 'role-b',
        sourceHandle: ROLE_WORKFLOW_INPUT_HANDLE_ID,
        target: 'role-a',
        targetHandle: ROLE_WORKFLOW_OUTPUT_HANDLE_ID,
      }),
    ).toEqual({
      sourceRoleNodeId: 'role-a',
      targetRoleNodeId: 'role-b',
    })
  })

  it('rejects loose same-type handle drags before validation can infer a direction', () => {
    const nodes = [roleNode('role-a'), roleNode('role-b')]

    for (const connection of [
      {
        source: 'role-a',
        sourceHandle: ROLE_WORKFLOW_OUTPUT_HANDLE_ID,
        target: 'role-b',
        targetHandle: ROLE_WORKFLOW_OUTPUT_HANDLE_ID,
      },
      {
        source: 'role-a',
        sourceHandle: ROLE_WORKFLOW_INPUT_HANDLE_ID,
        target: 'role-b',
        targetHandle: ROLE_WORKFLOW_INPUT_HANDLE_ID,
      },
    ]) {
      const resolvedConnection = resolveRoleWorkflowConnection(connection)

      expect(
        validateRoleWorkflowConnection({
          sourceRoleNodeId: resolvedConnection.sourceRoleNodeId,
          targetRoleNodeId: resolvedConnection.targetRoleNodeId,
          nodes,
          links: [],
        }),
      ).toEqual({ ok: false, reason: 'missing-endpoint' })
    }
  })

  it('rejects non-role endpoints and self links', () => {
    expect(
      validateRoleWorkflowConnection({
        sourceRoleNodeId: 'role-a',
        targetRoleNodeId: 'task-b',
        nodes: [roleNode('role-a'), taskNode('task-b')],
        links: [],
      }),
    ).toEqual({ ok: false, reason: 'non-role-node' })

    expect(
      validateRoleWorkflowConnection({
        sourceRoleNodeId: 'role-a',
        targetRoleNodeId: 'role-a',
        nodes: [roleNode('role-a')],
        links: [],
      }),
    ).toEqual({ ok: false, reason: 'same-node' })
  })

  it('keeps one incoming link per role and prevents cycles', () => {
    const links = [link('role-a', 'role-b'), link('role-b', 'role-c')]
    const nodes = [roleNode('role-a'), roleNode('role-b'), roleNode('role-c')]

    expect(
      validateRoleWorkflowConnection({
        sourceRoleNodeId: 'role-a',
        targetRoleNodeId: 'role-c',
        nodes,
        links,
      }),
    ).toEqual({ ok: false, reason: 'target-already-linked' })

    expect(
      validateRoleWorkflowConnection({
        sourceRoleNodeId: 'role-c',
        targetRoleNodeId: 'role-a',
        nodes,
        links,
      }),
    ).toEqual({ ok: false, reason: 'cycle' })
  })

  it('sanitizes old or invalid persisted links', () => {
    expect(
      sanitizeRoleWorkflowLinks({
        value: [link('role-a', 'role-b'), link('role-a', 'missing-role'), link('role-c', 'role-b')],
        nodes: [roleNode('role-a'), roleNode('role-b'), roleNode('role-c')],
      }).map(item => item.id),
    ).toEqual(['link-role-a-role-b'])
  })
})
