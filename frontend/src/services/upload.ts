import { api } from './api'
import type { Document, ProjectDocument, DocumentType, ProjectDocumentType } from '@/types'

export const uploadService = {
  // Upload to vault (coffre-fort)
  uploadVaultDocument: async (
    file: File,
    type: DocumentType,
    issuedDate?: string,
    expiryDate?: string,
  ): Promise<Document> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', type)
    if (issuedDate) formData.append('issued_date', issuedDate)
    if (expiryDate) formData.append('expiry_date', expiryDate)

    const { data } = await api.post<Document>('/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  // Upload DCE file for a project
  uploadProjectDocument: async (
    projectId: string,
    file: File,
    type: ProjectDocumentType,
  ): Promise<ProjectDocument | { documents: ProjectDocument[]; extracted_count: number; warnings?: string[] }> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', type)

    const { data } = await api.post<ProjectDocument | { documents: ProjectDocument[]; extracted_count: number; warnings?: string[] }>(
      `/projects/${projectId}/documents`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return data
  },
}
