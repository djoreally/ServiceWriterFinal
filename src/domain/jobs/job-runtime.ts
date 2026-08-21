export type JobRuntime = {
  id: string
  orgId: string

  customer: {
    id: string
    name: string
    phone?: string
    email?: string
  }

  vehicle: {
    id: string
    vin?: string
    year?: number
    make?: string
    model?: string
    engine?: string
  }

  service: {
    appointmentId?: string
    workOrderId?: string
    serviceTypeId?: string
    serviceName?: string
  }

  lifecycle: {
    status:
      | 'draft'
      | 'scheduled'
      | 'assigned'
      | 'en_route'
      | 'arrived'
      | 'in_progress'
      | 'paused'
      | 'completed'
      | 'cancelled'
      | 'no_show'
    updatedAt: string
    updatedBy?: string
    reasonCode?: string
  }

  execution: {
    checklistStatus: 'not_started' | 'in_progress' | 'complete' | 'blocked'
    startedAt?: string
    completedAt?: string
    blockingIssues?: string[]
    proofOfWork?: {
      photos?: string[]
      notes?: string
      mileage?: number
      technicianConfirmedSpecs?: boolean
      technicianConfirmedParts?: boolean
    }
  }

  dispatch: {
    technicianId?: string
    assignedAt?: string
    enRouteAt?: string
    arrivedAt?: string
  }

  financials: {
    subtotalCents: number
    taxCents: number
    totalCents: number
    paidCents: number
    refundedCents: number
    balanceCents: number
    invoiceStatus: 'none' | 'draft' | 'issued' | 'partial' | 'paid' | 'void'
    paymentStatus: 'unpaid' | 'partial' | 'paid' | 'refunded'
  }

  parts: {
    status: 'not_required' | 'pending_review' | 'identified' | 'ordered' | 'ready' | 'installed'
    required: Array<{
      partType: string
      partNumber?: string
      supplier?: string
      quantity: number
      confirmed: boolean
    }>
  }

  trust: {
    visibleToUser: boolean
    editableByUser: boolean
    organizationRole?: string
    subscriptionTier?: string
  }

  timestamps: {
    createdAt: string
    updatedAt: string
  }
}
