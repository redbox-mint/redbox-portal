export class UserLinkModel {
    id: string = ''
    primaryUserId: string = ''
    primaryUsername: string = ''
    secondaryUserId: string = ''
    secondaryUsername: string = ''
    brandId: string = ''
    status: 'active' = 'active'
    createdBy: string = ''
    notes?: string
    createdAt?: Date | string
    updatedAt?: Date | string
}
