import type { JSX } from 'react'
import { X } from 'lucide-react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'

export interface RoleWorkflowEdgeData {
  onDelete?: (linkId: string) => void
  deleteLabel?: string
}

export function RoleWorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps): JSX.Element {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const edgeData = data as RoleWorkflowEdgeData | undefined

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <button
          type="button"
          className="workspace-role-workflow-edge__delete nodrag nopan"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          aria-label={edgeData?.deleteLabel}
          title={edgeData?.deleteLabel}
          onClick={event => {
            event.preventDefault()
            event.stopPropagation()
            edgeData?.onDelete?.(id)
          }}
        >
          <X aria-hidden="true" />
        </button>
      </EdgeLabelRenderer>
    </>
  )
}
