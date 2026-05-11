import type { Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import {
  resolveWorkspaceCanvasAgentEdges,
  resolveWorkspaceCanvasRoleWorkflowEdges,
} from '../../../src/contexts/workspace/presentation/renderer/components/workspaceCanvas/hooks/useTaskAgentEdges'
import type { TerminalNodeData } from '../../../src/contexts/workspace/presentation/renderer/types'

function createNode(id: string, data: TerminalNodeData): Node<TerminalNodeData> {
  return {
    id,
    position: { x: 0, y: 0 },
    data,
  }
}

function createBaseData(kind: TerminalNodeData['kind']): TerminalNodeData {
  return {
    sessionId: kind === 'agent' ? `session-${kind}` : '',
    title: kind,
    width: 320,
    height: 240,
    kind,
    status: kind === 'agent' ? 'running' : null,
    startedAt: null,
    endedAt: null,
    exitCode: null,
    lastError: null,
    scrollback: null,
    agent: null,
    task: null,
    note: null,
    role: null,
    image: null,
    document: null,
    website: null,
  }
}

describe('resolveWorkspaceCanvasAgentEdges', () => {
  it('creates a visible role-to-agent edge from the latest role run record', () => {
    const roleData = createBaseData('role')
    roleData.title = 'Product Manager'
    roleData.role = {
      roleId: 'role-pm',
      roleName: 'Product Manager',
      roleDescription: '',
      promptTemplate: 'Write a PRD.',
      inputHint: '',
      outputFormat: '',
      input: 'Build role chaining',
      selectedProvider: 'codex',
      linkedAgentNodeId: null,
      runHistory: [
        {
          id: 'run-1',
          input: 'Build role chaining',
          prompt: 'Write a PRD.',
          outputFormat: '',
          provider: 'codex',
          agentNodeId: 'agent-1',
          sessionId: 'session-agent',
          createdAt: '2026-05-10T00:00:00.000Z',
        },
      ],
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
    }

    const agentData = createBaseData('agent')
    const edges = resolveWorkspaceCanvasAgentEdges({
      nodes: [createNode('role-1', roleData), createNode('agent-1', agentData)],
      formatRoleEdgeLabel: roleName => `Role run: ${roleName}`,
    })

    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      id: 'role-link-role-1-agent-1',
      source: 'role-1',
      target: 'agent-1',
      className: 'workspace-role-agent-edge workspace-role-agent-edge--active',
      label: 'Role run: Product Manager',
    })
  })
})

describe('resolveWorkspaceCanvasRoleWorkflowEdges', () => {
  it('creates role workflow edges with role handles', () => {
    const roleA = createBaseData('role')
    roleA.role = {
      roleId: 'role-a',
      roleName: 'Role A',
      roleDescription: '',
      promptTemplate: 'A',
      inputHint: '',
      outputFormat: '',
      input: '',
      selectedProvider: 'codex',
      linkedAgentNodeId: null,
      runHistory: [],
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
    }

    const roleB = createBaseData('role')
    roleB.role = {
      ...roleA.role,
      roleId: 'role-b',
      roleName: 'Role B',
    }

    const edges = resolveWorkspaceCanvasRoleWorkflowEdges({
      nodes: [createNode('role-a-node', roleA), createNode('role-b-node', roleB)],
      roleWorkflowLinks: [
        {
          id: 'role-workflow-role-a-node-role-b-node',
          sourceRoleNodeId: 'role-a-node',
          targetRoleNodeId: 'role-b-node',
          mode: 'auto',
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
      ],
      onDeleteRoleWorkflowLink: () => undefined,
      deleteLabel: 'Delete',
    })

    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      id: 'role-workflow-role-a-node-role-b-node',
      source: 'role-a-node',
      target: 'role-b-node',
      sourceHandle: 'role-output',
      targetHandle: 'role-input',
      type: 'roleWorkflow',
      className: 'workspace-role-workflow-edge',
    })
  })
})
