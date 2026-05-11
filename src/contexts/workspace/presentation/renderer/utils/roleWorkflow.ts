import type { RoleWorkflowLink, WorkspaceNodeKind } from '../types'

export const ROLE_WORKFLOW_INPUT_HANDLE_ID = 'role-input'
export const ROLE_WORKFLOW_OUTPUT_HANDLE_ID = 'role-output'

type RoleWorkflowNodeLike = {
  id: string
  kind?: WorkspaceNodeKind
  data?: {
    kind?: WorkspaceNodeKind
  }
}

export type RoleWorkflowValidationFailure =
  | 'missing-endpoint'
  | 'same-node'
  | 'non-role-node'
  | 'duplicate-link'
  | 'target-already-linked'
  | 'cycle'

export type RoleWorkflowValidationResult =
  | { ok: true }
  | { ok: false; reason: RoleWorkflowValidationFailure }

export type RoleWorkflowConnectionLike = {
  source?: string | null
  target?: string | null
  sourceHandle?: string | null
  targetHandle?: string | null
}

export type ResolvedRoleWorkflowConnection = {
  sourceRoleNodeId: string | null
  targetRoleNodeId: string | null
}

function getNodeKind(node: RoleWorkflowNodeLike | undefined): WorkspaceNodeKind | null {
  return node?.data?.kind ?? node?.kind ?? null
}

function isRoleNode(node: RoleWorkflowNodeLike | undefined): boolean {
  return getNodeKind(node) === 'role'
}

function hasPathToSource({
  sourceRoleNodeId,
  targetRoleNodeId,
  links,
}: {
  sourceRoleNodeId: string
  targetRoleNodeId: string
  links: RoleWorkflowLink[]
}): boolean {
  const outgoingBySource = new Map<string, string[]>()
  for (const link of links) {
    const outgoing = outgoingBySource.get(link.sourceRoleNodeId) ?? []
    outgoing.push(link.targetRoleNodeId)
    outgoingBySource.set(link.sourceRoleNodeId, outgoing)
  }

  const pending = [targetRoleNodeId]
  const visited = new Set<string>()
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current || visited.has(current)) {
      continue
    }

    if (current === sourceRoleNodeId) {
      return true
    }

    visited.add(current)
    pending.push(...(outgoingBySource.get(current) ?? []))
  }

  return false
}

export function createRoleWorkflowLinkId({
  sourceRoleNodeId,
  targetRoleNodeId,
}: {
  sourceRoleNodeId: string
  targetRoleNodeId: string
}): string {
  return `role-workflow-${sourceRoleNodeId}-${targetRoleNodeId}`
}

export function resolveRoleWorkflowConnection(
  connection: RoleWorkflowConnectionLike,
): ResolvedRoleWorkflowConnection {
  const sourceNodeId = connection.source?.trim() ?? null
  const targetNodeId = connection.target?.trim() ?? null

  if (
    connection.sourceHandle === ROLE_WORKFLOW_INPUT_HANDLE_ID &&
    connection.targetHandle === ROLE_WORKFLOW_OUTPUT_HANDLE_ID
  ) {
    return {
      sourceRoleNodeId: targetNodeId,
      targetRoleNodeId: sourceNodeId,
    }
  }

  return {
    sourceRoleNodeId: sourceNodeId,
    targetRoleNodeId: targetNodeId,
  }
}

export function validateRoleWorkflowConnection({
  sourceRoleNodeId,
  targetRoleNodeId,
  nodes,
  links,
}: {
  sourceRoleNodeId: string | null | undefined
  targetRoleNodeId: string | null | undefined
  nodes: RoleWorkflowNodeLike[]
  links: RoleWorkflowLink[]
}): RoleWorkflowValidationResult {
  const source = sourceRoleNodeId?.trim() ?? ''
  const target = targetRoleNodeId?.trim() ?? ''
  if (source.length === 0 || target.length === 0) {
    return { ok: false, reason: 'missing-endpoint' }
  }

  if (source === target) {
    return { ok: false, reason: 'same-node' }
  }

  const nodeById = new Map(nodes.map(node => [node.id, node]))
  if (!isRoleNode(nodeById.get(source)) || !isRoleNode(nodeById.get(target))) {
    return { ok: false, reason: 'non-role-node' }
  }

  if (links.some(link => link.sourceRoleNodeId === source && link.targetRoleNodeId === target)) {
    return { ok: false, reason: 'duplicate-link' }
  }

  if (links.some(link => link.targetRoleNodeId === target)) {
    return { ok: false, reason: 'target-already-linked' }
  }

  if (hasPathToSource({ sourceRoleNodeId: source, targetRoleNodeId: target, links })) {
    return { ok: false, reason: 'cycle' }
  }

  return { ok: true }
}

export function sanitizeRoleWorkflowLinks({
  value,
  nodes,
}: {
  value: unknown
  nodes: RoleWorkflowNodeLike[]
}): RoleWorkflowLink[] {
  if (!Array.isArray(value)) {
    return []
  }

  const links: RoleWorkflowLink[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const record = item as Record<string, unknown>
    const sourceRoleNodeId =
      typeof record.sourceRoleNodeId === 'string' ? record.sourceRoleNodeId.trim() : ''
    const targetRoleNodeId =
      typeof record.targetRoleNodeId === 'string' ? record.targetRoleNodeId.trim() : ''
    const validation = validateRoleWorkflowConnection({
      sourceRoleNodeId,
      targetRoleNodeId,
      nodes,
      links,
    })
    if (!validation.ok) {
      continue
    }

    const now = new Date().toISOString()
    const id =
      typeof record.id === 'string' && record.id.trim().length > 0
        ? record.id.trim()
        : createRoleWorkflowLinkId({ sourceRoleNodeId, targetRoleNodeId })
    const createdAt =
      typeof record.createdAt === 'string' && record.createdAt.trim().length > 0
        ? record.createdAt.trim()
        : now
    const updatedAt =
      typeof record.updatedAt === 'string' && record.updatedAt.trim().length > 0
        ? record.updatedAt.trim()
        : createdAt

    links.push({
      id,
      sourceRoleNodeId,
      targetRoleNodeId,
      mode: 'auto',
      createdAt,
      updatedAt,
    })
  }

  return links
}

export function pruneRoleWorkflowLinksForNodes({
  links,
  nodes,
}: {
  links: RoleWorkflowLink[]
  nodes: RoleWorkflowNodeLike[]
}): RoleWorkflowLink[] {
  return sanitizeRoleWorkflowLinks({ value: links, nodes })
}
